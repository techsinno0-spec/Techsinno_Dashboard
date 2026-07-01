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

      const managerContext = decoded.role === 'manager';

      const userTasks = await queryItems(
        'tasks',
        managerContext
          ? 'SELECT * FROM c ORDER BY c.createdAt DESC OFFSET 0 LIMIT 50'
          : 'SELECT * FROM c WHERE c.assignedTo = @uid ORDER BY c.createdAt DESC OFFSET 0 LIMIT 20',
        managerContext ? [] : [{ name: '@uid', value: decoded.sub }]
      );

      let crmContext = '';
      let campaignContext = '';
      let jobContext = '';
      let workloadContext = '';
      if (managerContext) {
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

        try {
          const jobCards = await queryItems('job-cards', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 25', []);
          const abnormal = [];
          const open = jobCards.filter(j => !['done', 'completed', 'closed'].includes(String(j.status || '').toLowerCase()));
          open.forEach(j => {
            const days = j.updatedAt ? Math.floor((Date.now() - new Date(j.updatedAt).getTime()) / 86400000) : null;
            if (!(j.assignedTo || []).length) abnormal.push(`${j.title || j.jobTitle || j.clientName || j.id}: no assignee`);
            if (days !== null && days >= 7) abnormal.push(`${j.title || j.jobTitle || j.clientName || j.id}: ${days} days no update`);
            if ((j.tasks || []).some(t => t.status === 'blocked')) abnormal.push(`${j.title || j.jobTitle || j.clientName || j.id}: blocked task`);
          });
          jobContext = `\nJob cards: ${open.length} open. Abnormal job signals: ${abnormal.slice(0, 10).join('; ') || 'none detected'}.`;
        } catch {}

        try {
          const users = await queryItems('users', 'SELECT c.id, c.displayName, c.role, c.active FROM c WHERE c.active = true OFFSET 0 LIMIT 30', []);
          const counts = {};
          userTasks.filter(t => t.status !== 'done').forEach(t => { counts[t.assignedTo] = (counts[t.assignedTo] || 0) + 1; });
          workloadContext = `\nTeam workload: ${users.map(u => `${u.displayName}: ${counts[u.id] || 0} open tasks`).join('; ')}.`;
        } catch {}
      }

      let systemPrompt;
      if (managerContext) {
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

Act like a real approval-based admin agent:
- Anticipate the next movement Frank should take.
- Check job/task evolution and call out abnormalities: overdue, blocked, stale, unassigned, unclear next step, or workload imbalance.
- Suggest better options before drafting generic messages.
- Propose tasks to assign, owners, deadlines, and reasons.
- For leads/work: identify likely sectors, companies, and work opportunities to pursue from available dashboard/email/platform data.
- You may recommend actions, but do not claim an action was done unless the system confirms it.

You help with OPERATIONAL tasks only — task management, drafting professional communications, scheduling, and business operations. You do NOT do general research.

Current tasks in the system:
${JSON.stringify(userTasks.slice(0, 20), null, 2)}
${crmContext}${campaignContext}${jobContext}${workloadContext}

When asked to draft outreach, format with: Problem spotted, Evidence/assumption, TECHSINNO fit, First step, Subject, and Body.
When asked for a social post, provide the post text ready to copy.
When asked about follow-ups, reference specific clients by name.
When asked what to do next, answer with: Top risk, Best next move, Task to assign, Owner suggestion, Deadline suggestion, and Why.
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
