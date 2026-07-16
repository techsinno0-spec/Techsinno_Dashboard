const { app } = require('@azure/functions');
const { getItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, badRequest } = require('../../shared/auth');
const { AGENT_TOOLS, executeAgentTool } = require('../../shared/agent-tools');

// ============================================================================
// AI chat — now a real agent for managers/owner.
//
// Instead of stuffing a data snapshot into the prompt and answering read-only,
// the manager chat runs a tool-use loop: Claude can look up live tasks, CRM,
// jobs, quotes, reminders, unread email and Zoho Books figures, and can take
// bounded actions (create/update tasks, reminders, clients, draft quotes) —
// with every write logged to the activity feed and every outgoing email
// parked in the approval queue instead of being sent.
//
// The staff chat is unchanged: simple, task-scoped, no tools.
// ============================================================================

const MAX_TOOL_ROUNDS = 6;      // max Claude<->tools round trips per message
const TIME_BUDGET_MS = 90000;   // stay well inside the platform request limit
const CHAT_MODEL = process.env.CLAUDE_CHAT_MODEL || 'claude-sonnet-5';

function managerSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the TECHSINNO AI agent — a working assistant built into the team dashboard for Frank Muland, owner of TECHSINNO (Pty) Ltd, a mechatronics and industrial electronics company in Kuilsriver, Western Cape, South Africa. Today is ${today}.

Services: industrial PCB repair, factory automation (PLC/SCADA), IoT monitoring, diagnostics, preventive maintenance.
Target clients: factories, farms, medical facilities and industrial operations, mainly in the Western Cape.
Currency: ZAR (R).

You act in five roles, using your tools:
1. SECRETARY — triage unread email (read_recent_emails), draft replies and follow-ups (queue_email_for_approval), set reminders for promises and deadlines (create_reminder).
2. ADMINISTRATOR — watch tasks and job cards (list_tasks, list_job_cards), chase overdue/blocked/stale work, create and update tasks with clear owners and deadlines (create_task, update_task).
3. BOOKKEEPER — monitor money in Zoho Books (get_books_summary, list_overdue_invoices), flag overdue invoices, draft polite payment chasers, and draft quotes for RFQs (create_quote_draft).
4. MARKETING AGENT — keep the CRM moving (list_clients, update_client), suggest problem-first outreach, draft outreach emails for approval.
5. SOURCING LEAD — track leads and opportunities in the CRM and approval queue, and turn inbound RFQs into clients + quotes.

Ground rules:
- Use tools to check live data BEFORE stating facts about tasks, clients, money or email. Never guess IDs, amounts or names. When asked about status or "what should I do", start with get_business_snapshot.
- You may take the bounded actions your tools allow. Emails are NEVER sent by you — queue_email_for_approval parks them for Frank's review in the AI Agent page. Say so when you queue one.
- After taking actions, summarise exactly what you did.
- Be a practical industrial problem-spotter, not a generic copywriter: identify the specific likely operational problem, state evidence, and clearly label assumptions.
- Match problems to one TECHSINNO service and suggest a small first step: diagnostic call, site walk-through, failed-board assessment, control-panel review, downtime-risk check, or monitoring pilot.
- Avoid generic phrases like "innovative solutions", "streamline your operations", "cutting-edge technology".
- Do not invent past clients, completed jobs, case studies, or guaranteed savings.
- Emails you draft: plaintext, 3–8 sentences, professional and specific, ending with Frank's signature ("Regards,\\nFrank\\nTECHSINNO (Pty) Ltd").
- Be concise and business-focused. Use ZAR (R) for currency.`;
}

async function runManagerAgent(client, messages, decoded) {
  const conv = messages.map(m => ({ role: m.role, content: m.content }));
  const actions = [];
  const started = Date.now();
  let finalText = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const outOfBudget = round === MAX_TOOL_ROUNDS || (Date.now() - started) > TIME_BUDGET_MS;

    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 3000,
      system: managerSystemPrompt(),
      tools: AGENT_TOOLS,
      tool_choice: outOfBudget ? { type: 'none' } : { type: 'auto' },
      messages: conv
    });

    const textParts = response.content.filter(b => b.type === 'text').map(b => b.text);
    const toolUses = response.content.filter(b => b.type === 'tool_use');

    if (!toolUses.length || outOfBudget) {
      finalText = textParts.join('\n').trim();
      break;
    }

    // Record the assistant turn (may contain text + tool_use blocks)
    conv.push({ role: 'assistant', content: response.content });

    // Execute every requested tool and feed the results back
    const results = [];
    for (const tu of toolUses) {
      const resultStr = await executeAgentTool(tu.name, tu.input, decoded);
      try {
        const parsed = JSON.parse(resultStr);
        if (parsed && parsed.actionSummary) actions.push(parsed.actionSummary);
      } catch {}
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: resultStr });
    }
    conv.push({ role: 'user', content: results });
  }

  if (!finalText) {
    finalText = actions.length
      ? 'Done — see the actions below.'
      : 'I could not complete that within the step limit. Please try a more specific request.';
  }

  let text = finalText;
  if (actions.length) {
    text += '\n\n⚡ Actions taken:\n' + actions.map(a => '• ' + a).join('\n');
  }
  return { text, actions };
}

app.http('ai-chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai/chat',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      let config;
      try { config = await getItem('config', 'cfg_claude'); } catch {}
      if (!config || !config.apiKey) {
        return jsonResponse({ error: 'Claude API key not configured. Ask your manager to set it up in Settings.' }, 400);
      }

      const body = await request.json();
      const { messages } = body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return badRequest('messages array is required');
      }

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.apiKey });

      // ----- Manager / owner: full agent with tools -----------------------
      if (decoded.role === 'manager') {
        const { text, actions } = await runManagerAgent(client, messages, decoded);
        return jsonResponse({ success: true, text, actions });
      }

      // ----- Staff: unchanged simple, task-scoped assistant ----------------
      const userTasks = await queryItems(
        'tasks',
        'SELECT * FROM c WHERE c.assignedTo = @uid ORDER BY c.createdAt DESC OFFSET 0 LIMIT 20',
        [{ name: '@uid', value: decoded.sub }]
      );

      const systemPrompt = `You are an AI assistant for a team member at TECHSINNO (Pty) Ltd — a mechatronics and industrial electronics company. You help with OPERATIONAL tasks only:
- Understanding task requirements
- Drafting professional messages to customers
- Suggesting how to approach assigned work
- Writing status updates and notes

You do NOT discuss financial data, business strategy, or company internals. Stay focused on helping the user complete their assigned tasks.

User: ${decoded.name}
Their current tasks:
${JSON.stringify(userTasks.slice(0, 10), null, 2)}`;

      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages
      });

      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      return jsonResponse({ success: true, text });
    } catch (err) {
      return jsonResponse({ error: err.message || 'AI chat failed' }, 500);
    }
  }
});
