const { app } = require('@azure/functions');
const { getItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, badRequest } = require('../../shared/auth');

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

      const userTasks = await queryItems(
        'tasks',
        decoded.role === 'manager'
          ? 'SELECT * FROM c ORDER BY c.createdAt DESC OFFSET 0 LIMIT 50'
          : 'SELECT * FROM c WHERE c.assignedTo = @uid ORDER BY c.createdAt DESC OFFSET 0 LIMIT 20',
        decoded.role === 'staff' ? [{ name: '@uid', value: decoded.sub }] : []
      );

      let crmContext = '';
      let campaignContext = '';
      if (decoded.role === 'manager') {
        try {
          const clients = await queryItems('clients', 'SELECT c.companyName, c.contactName, c.status, c.estimatedValue, c.followUpDate, c.source FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 30', []);
          const statusCounts = {};
          let pipelineValue = 0;
          const followUpsDue = [];
          clients.forEach(c => {
            statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
            if (!['won', 'lost'].includes(c.status)) pipelineValue += (c.estimatedValue || 0);
            if (c.followUpDate && new Date(c.followUpDate) <= new Date() && !['won', 'lost'].includes(c.status)) {
              followUpsDue.push(`${c.companyName} (${c.contactName || 'no contact'})`);
            }
          });
          crmContext = `\nCRM Pipeline: ${JSON.stringify(statusCounts)}. Pipeline value: R${Math.round(pipelineValue).toLocaleString()}.`;
          if (followUpsDue.length) crmContext += `\nFollow-ups overdue: ${followUpsDue.join(', ')}.`;
        } catch {}

        try {
          const campaigns = await queryItems('campaigns', "SELECT c.name, c.type, c.status, c.metrics FROM c WHERE c.status IN ('planning', 'active') OFFSET 0 LIMIT 10", []);
          if (campaigns.length) {
            campaignContext = `\nActive campaigns: ${campaigns.map(c => `${c.name} (${c.type}, ${c.status})`).join('; ')}.`;
          }
        } catch {}
      }

      let systemPrompt;
      if (decoded.role === 'manager') {
        systemPrompt = `You are an AI business operations assistant built into the TECHSINNO team dashboard for Frank Muland, owner of TECHSINNO (Pty) Ltd — a mechatronics and industrial electronics company in Kuilsriver, Western Cape, South Africa.

Services: industrial PCB repair, factory automation (PLC/SCADA), IoT monitoring systems.
Target clients: factories, farms, medical facilities in the Western Cape.
Business email: frank@techsinno.com

When helping Frank with outreach, leads, quotes, follow-ups, or business development, behave like a practical industrial problem-spotter, not a generic email writer:
- Identify the specific likely operational problem for the company/sector.
- State evidence and clearly label assumptions.
- Match the problem to one TECHSINNO service: PCB repair, PLC/SCADA automation, IoT monitoring, diagnostics, preventive maintenance.
- Suggest a small first step: diagnostic call, site walk-through, failed-board assessment, control-panel review, downtime-risk check, or monitoring pilot.
- Only then draft the email/message.
- Avoid generic phrases like "innovative solutions", "streamline your operations", or "cutting-edge technology".
- Do not invent past clients, completed jobs, case studies, or guaranteed savings.

You help with OPERATIONAL tasks only — task management, drafting professional communications, scheduling, and business operations. You do NOT do general research.

Current tasks in the system:
${JSON.stringify(userTasks.slice(0, 20), null, 2)}
${crmContext}${campaignContext}

When asked to draft outreach, format with: Problem spotted, Evidence/assumption, TECHSINNO fit, First step, Subject, and Body.
When asked for a social post, provide the post text ready to copy.
When asked about follow-ups, reference specific clients by name.
Use ZAR (R) for currency. Be concise, practical, and business-focused. Help manage tasks, suggest priorities, and draft communications specific to the SA industrial/manufacturing market.`;
      } else {
        systemPrompt = `You are an AI assistant for a team member at TECHSINNO (Pty) Ltd — a mechatronics and industrial electronics company. You help with OPERATIONAL tasks only:
- Understanding task requirements
- Drafting professional messages to customers
- Suggesting how to approach assigned work
- Writing status updates and notes

You do NOT discuss financial data, business strategy, or company internals. Stay focused on helping the user complete their assigned tasks.

User: ${decoded.name}
Their current tasks:
${JSON.stringify(userTasks.slice(0, 10), null, 2)}`;
      }

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.apiKey });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
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
