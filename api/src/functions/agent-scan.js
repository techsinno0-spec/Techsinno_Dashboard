const { app } = require('@azure/functions');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { getItem, createItem, replaceItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

const AGENT_QUEUE_ID = 'agent_queue';

const SCOUT_RULES = `
Act as a practical industrial problem-spotter for TECHSINNO, not a generic copywriter.
- Infer one likely operational pain from the source context. Label it as an assumption unless explicit.
- Tie the pain to one TECHSINNO service: PCB repair, PLC/SCADA automation, IoT monitoring, diagnostics, control-panel review, preventive maintenance.
- Suggest a low-friction first step Frank can offer.
- Keep tone technical, humble, and specific.
- Do not invent past clients, completed jobs, case studies, certifications, or guaranteed savings.
- Avoid generic phrases like "innovative solutions", "streamline your operations", "cutting-edge technology".
`;

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86400000);
}

function shortDate(value) {
  if (!value) return 'no date';
  try { return new Date(value).toISOString().slice(0, 10); } catch { return String(value); }
}

function itemFingerprint(item) {
  return item.fingerprint || item.emailId || item.url || item.relatedId || item.title || item.subject;
}

function queueItem(input) {
  return {
    id: uuidv4(),
    priority: input.priority || 3,
    flagType: input.flagType || 'admin',
    status: 'pending',
    createdAt: Date.now(),
    ...input
  };
}

async function loadQueue() {
  try {
    const item = await getItem('config', AGENT_QUEUE_ID);
    return item || { id: AGENT_QUEUE_ID, service: 'agent_queue', queue: [], lastScan: null };
  } catch {
    return { id: AGENT_QUEUE_ID, service: 'agent_queue', queue: [], lastScan: null };
  }
}

async function saveQueue(item) {
  let existing = null;
  try { existing = await getItem('config', AGENT_QUEUE_ID); } catch {}
  if (existing) await replaceItem('config', AGENT_QUEUE_ID, item);
  else await createItem('config', item);
}

function parseJsonArray(text) {
  const m = (text || '[]').trim().match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

async function getClaude() {
  let cfg = null;
  try { cfg = await getItem('config', 'cfg_claude'); } catch {}
  if (!cfg || !cfg.apiKey) throw new Error('Claude API key not configured in cloud Settings');
  return new Anthropic({ apiKey: cfg.apiKey });
}

async function loadBusinessContext() {
  const safe = async (fn, fallback = []) => {
    try { return await fn(); } catch { return fallback; }
  };

  const [tasks, jobCards, clients, projects, campaigns, users] = await Promise.all([
    safe(() => queryItems('tasks', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 80')),
    safe(() => queryItems('job-cards', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60')),
    safe(() => queryItems('clients', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60')),
    safe(() => queryItems('projects', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 40')),
    safe(() => queryItems('campaigns', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 30')),
    safe(() => queryItems('users', 'SELECT c.id, c.displayName, c.role, c.active FROM c WHERE c.active = true OFFSET 0 LIMIT 30'))
  ]);

  return { tasks, jobCards, clients, projects, campaigns, users };
}

function buildHeuristicAdminItems(ctx) {
  const items = [];
  const now = Date.now();
  const activeUsers = (ctx.users || []).filter(u => u.active !== false);
  const staff = activeUsers.filter(u => ['staff', 'manager'].includes(u.role));
  const defaultAssignee = staff[0]?.id || activeUsers[0]?.id || null;

  const openTasks = (ctx.tasks || []).filter(t => t.status !== 'done');
  const overdueTasks = openTasks.filter(t => t.deadline && new Date(t.deadline).getTime() < now);
  const blockedTasks = openTasks.filter(t => t.status === 'blocked');
  const staleInProgress = openTasks.filter(t => t.status === 'in_progress' && daysSince(t.updatedAt || t.createdAt) >= 5);

  overdueTasks.slice(0, 5).forEach(t => {
    items.push(queueItem({
      type: 'admin_task',
      source: 'task_watchdog',
      fingerprint: `admin_task:overdue:${t.id}:${t.updatedAt || t.deadline}`,
      relatedId: t.id,
      priority: t.priority === 'high' ? 1 : 2,
      flagType: 'urgent',
      title: `Overdue task: ${t.title}`,
      reason: `Due ${shortDate(t.deadline)}`,
      body: `This task is overdue and still marked ${t.status || 'pending'}. Check whether it is actually done, blocked, or needs reassignment.`,
      painPoint: 'A committed task has passed its deadline without completion.',
      evidence: `Deadline ${shortDate(t.deadline)}; status ${t.status || 'pending'}.`,
      techsinnoSolution: 'Admin follow-up: clarify blocker, reassign if necessary, or close with notes.',
      nextStep: 'Ask the assigned person for a same-day update and reset the deadline.',
      action: defaultAssignee ? {
        kind: 'create_task',
        label: 'Create follow-up task',
        payload: {
          title: `Follow up overdue task: ${t.title}`,
          description: `AI admin detected overdue task "${t.title}". Confirm status, blocker, and next deadline.`,
          category: 'admin',
          priority: t.priority === 'high' ? 'high' : 'medium',
          assignedTo: t.assignedTo || defaultAssignee,
          deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        }
      } : null
    }));
  });

  blockedTasks.slice(0, 4).forEach(t => {
    items.push(queueItem({
      type: 'admin_task',
      source: 'task_watchdog',
      fingerprint: `admin_task:blocked:${t.id}:${t.updatedAt || t.createdAt}`,
      relatedId: t.id,
      priority: 1,
      flagType: 'blocked',
      title: `Blocked task needs decision: ${t.title}`,
      reason: 'Blocked work',
      body: 'A blocked task should have a named blocker, owner, and next decision. If it sits too long, it becomes invisible work.',
      painPoint: 'Task is blocked and may stop related work from moving.',
      evidence: `Status is blocked; last update ${shortDate(t.updatedAt || t.createdAt)}.`,
      techsinnoSolution: 'Admin decision: identify blocker, owner, and unblock action.',
      nextStep: 'Create a blocker-resolution task or reassign to the person who can remove the blocker.',
      action: defaultAssignee ? {
        kind: 'create_task',
        label: 'Create unblock task',
        payload: {
          title: `Unblock: ${t.title}`,
          description: `AI admin detected blocked task "${t.title}". Define blocker, decision needed, and next action.`,
          category: 'admin',
          priority: 'high',
          assignedTo: t.assignedTo || defaultAssignee,
          deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        }
      } : null
    }));
  });

  staleInProgress.slice(0, 4).forEach(t => {
    items.push(queueItem({
      type: 'job_abnormality',
      source: 'task_watchdog',
      fingerprint: `job_abnormality:stale_task:${t.id}:${t.updatedAt || t.createdAt}`,
      relatedId: t.id,
      priority: 2,
      flagType: 'follow_up',
      title: `Stale in-progress task: ${t.title}`,
      reason: `${daysSince(t.updatedAt || t.createdAt)} days no update`,
      body: 'This task is in progress but has not moved recently. It may be waiting on parts, customer feedback, unclear instructions, or simply not updated.',
      painPoint: 'Work may be active in the real world but stale in the dashboard.',
      evidence: `In progress; last update ${shortDate(t.updatedAt || t.createdAt)}.`,
      techsinnoSolution: 'Admin follow-up to capture true status and update the task.',
      nextStep: 'Ask for a short progress note: done, blocked, waiting, or new ETA.'
    }));
  });

  (ctx.jobCards || []).forEach(jc => {
    const open = !['done', 'completed', 'closed'].includes(String(jc.status || '').toLowerCase());
    const noAssignee = !(jc.assignedTo || []).length;
    const stale = open && daysSince(jc.updatedAt || jc.createdAt) >= 7;
    const tasks = Array.isArray(jc.tasks) ? jc.tasks : [];
    const taskBlocked = tasks.some(t => t.status === 'blocked');
    if (open && (noAssignee || stale || taskBlocked)) {
      const reason = noAssignee ? 'No person assigned' : taskBlocked ? 'Blocked job task' : `${daysSince(jc.updatedAt || jc.createdAt)} days no update`;
      items.push(queueItem({
        type: 'job_abnormality',
        source: 'job_watchdog',
        fingerprint: `job_abnormality:${jc.id}:${reason}:${jc.updatedAt || jc.createdAt}`,
        relatedId: jc.id,
        priority: noAssignee || taskBlocked ? 1 : 2,
        flagType: taskBlocked ? 'blocked' : 'urgent',
        title: `Job needs attention: ${jc.title || jc.jobTitle || jc.clientName || 'Untitled job'}`,
        reason,
        body: `Job card ${jc.jobNumber || jc.docNumber || jc.id} may need admin action: ${reason}.`,
        painPoint: noAssignee ? 'A job exists without a clear person responsible.' : taskBlocked ? 'A job task is blocked.' : 'Job progress has not been updated recently.',
        evidence: `Status ${jc.status || 'open'}; updated ${shortDate(jc.updatedAt || jc.createdAt)}.`,
        techsinnoSolution: 'Admin control: assign owner, confirm blocker, update progress, and set next deadline.',
        nextStep: noAssignee ? 'Assign a responsible person today.' : 'Request a progress note and next action.',
        action: (noAssignee && defaultAssignee) ? {
          kind: 'create_task',
          label: 'Create assign-owner task',
          payload: {
            title: `Assign owner for job: ${jc.title || jc.clientName || jc.id}`,
            description: `AI admin detected job card without an assignee. Choose responsible person and next deadline.`,
            category: 'admin',
            priority: 'high',
            assignedTo: defaultAssignee,
            deadline: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
          }
        } : null
      }));
    }
  });

  (ctx.clients || []).forEach(c => {
    const status = String(c.status || 'lead').toLowerCase();
    const followDue = c.followUpDate && new Date(c.followUpDate).getTime() <= now && !['won', 'lost'].includes(status);
    const staleLead = ['lead', 'contacted', 'quoted', 'negotiating'].includes(status) && daysSince(c.updatedAt || c.createdAt) >= 7;
    if (followDue || staleLead) {
      items.push(queueItem({
        type: 'lead_followup',
        source: 'crm_watchdog',
        fingerprint: `lead_followup:${c.id}:${c.status}:${c.followUpDate || c.updatedAt || c.createdAt}`,
        relatedId: c.id,
        priority: followDue ? 1 : 2,
        flagType: 'follow_up',
        title: `Follow up lead: ${c.companyName || c.contactName || 'Unnamed client'}`,
        reason: followDue ? `Due ${shortDate(c.followUpDate)}` : `${daysSince(c.updatedAt || c.createdAt)} days stale`,
        to: c.email || '',
        subject: `Follow-up: ${c.companyName || 'TECHSINNO'}`,
        body: `Hi ${c.contactName || 'there'},\n\nJust following up to check whether you still need help with ${c.notes || 'the repair, automation, or monitoring requirement we discussed'}.\n\nIf useful, I can suggest a small next step: a diagnostic call, failed-board assessment, or site/control-panel review.\n\nRegards,\nFrank`,
        painPoint: 'A potential customer may go cold without a scheduled follow-up.',
        evidence: followDue ? `Follow-up date is ${shortDate(c.followUpDate)}.` : `Lead status is ${status}; last update ${shortDate(c.updatedAt || c.createdAt)}.`,
        techsinnoSolution: 'Sales/admin follow-up with a specific low-friction next step.',
        nextStep: 'Send follow-up or create a reminder for today.',
        action: defaultAssignee ? {
          kind: 'create_task',
          label: 'Create follow-up task',
          payload: {
            title: `Follow up ${c.companyName || c.contactName || 'lead'}`,
            description: `AI admin detected CRM follow-up needed. Status: ${status}. ${c.notes || ''}`,
            category: 'admin',
            priority: followDue ? 'high' : 'medium',
            assignedTo: c.assignedTo || defaultAssignee,
            deadline: new Date().toISOString().slice(0, 10)
          }
        } : null
      }));
    }
  });

  (ctx.campaigns || []).filter(c => ['planning', 'active'].includes(c.status)).forEach(c => {
    const metrics = c.metrics || {};
    if ((metrics.sent || 0) > 10 && (metrics.replied || 0) === 0) {
      items.push(queueItem({
        type: 'service_suggestion',
        source: 'marketing_watchdog',
        fingerprint: `service_suggestion:campaign:${c.id}:${metrics.sent}:${metrics.replied}`,
        relatedId: c.id,
        priority: 3,
        flagType: 'outreach',
        title: `Improve campaign: ${c.name}`,
        reason: 'No replies yet',
        body: 'This campaign has sent messages but no replies. Consider changing the offer from generic outreach to a specific problem-first hook.',
        painPoint: 'Outreach may not be specific enough to trigger replies.',
        evidence: `${metrics.sent || 0} sent, ${metrics.replied || 0} replies.`,
        techsinnoSolution: 'Lead with a concrete industrial pain: downtime, obsolete PCB, control-panel faults, sensor gaps, or monitoring blind spots.',
        nextStep: 'Rewrite the next batch around one sector and one problem.'
      }));
    }
  });

  return items;
}

async function buildClaudeAdminItems(client, ctx) {
  const compact = {
    tasks: (ctx.tasks || []).slice(0, 35).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, category: t.category, assignedTo: t.assignedTo, deadline: t.deadline, updatedAt: t.updatedAt })),
    jobCards: (ctx.jobCards || []).slice(0, 25).map(j => ({ id: j.id, title: j.title || j.jobTitle, clientName: j.clientName || j.client, status: j.status, progress: j.progress, assignedTo: j.assignedTo, updatedAt: j.updatedAt, tasks: (j.tasks || []).map(t => ({ title: t.title, status: t.status, assignedTo: t.assignedTo })) })),
    clients: (ctx.clients || []).slice(0, 30).map(c => ({ id: c.id, companyName: c.companyName, contactName: c.contactName, status: c.status, industry: c.industry, source: c.source, estimatedValue: c.estimatedValue, followUpDate: c.followUpDate, notes: c.notes, updatedAt: c.updatedAt })),
    campaigns: (ctx.campaigns || []).slice(0, 15).map(c => ({ id: c.id, name: c.name, type: c.type, status: c.status, metrics: c.metrics })),
    users: (ctx.users || []).map(u => ({ id: u.id, displayName: u.displayName, role: u.role }))
  };

  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2200,
    messages: [{ role: 'user', content: `You are TECHSINNO's admin agent. Review this live dashboard data and propose practical next actions for Frank.

Company: TECHSINNO (Pty) Ltd, Kuilsriver, Western Cape. Services: PCB repair, PLC/SCADA automation, IoT monitoring, diagnostics, preventive maintenance.

Your job:
- Anticipate the next movement Frank should take.
- Spot abnormal jobs/tasks: overdue, blocked, stale, unassigned, unclear next step, risky customer follow-up.
- Suggest service/problem positioning for leads.
- Suggest tasks to assign, but do not pretend you already assigned them.
- Be specific, practical, and evidence-based. Label assumptions.

DATA:
${JSON.stringify(compact)}

Return ONLY valid JSON array, maximum 8 items:
[{"type":"admin_recommendation|task_assignment|job_abnormality|lead_followup|service_suggestion","priority":1-5,"flagType":"urgent|blocked|follow_up|lead|opportunity|outreach|admin","title":"short title","reason":"max 8 words","relatedId":"task/job/client id if any","painPoint":"specific issue spotted","evidence":"what data proves or suggests it","techsinnoSolution":"admin or TECHSINNO service response","nextStep":"one concrete next action","body":"short practical explanation","action":{"kind":"create_task","label":"button label","payload":{"title":"task title","description":"task description","category":"admin|repair|auto|iot|general","priority":"high|medium|low","assignedTo":"valid user id from DATA.users","deadline":"YYYY-MM-DD or null"}}}]

If no action is needed, return [].` }]
  });

  return parseJsonArray(r.content[0]?.text).map(item => queueItem({
    type: item.type || 'admin_recommendation',
    source: 'admin_review',
    fingerprint: `admin_review:${item.type || 'item'}:${item.relatedId || item.title}:${item.evidence || item.reason}`,
    priority: item.priority || 3,
    flagType: item.flagType || 'admin',
    title: item.title,
    reason: item.reason,
    relatedId: item.relatedId,
    painPoint: item.painPoint || '',
    evidence: item.evidence || '',
    techsinnoSolution: item.techsinnoSolution || '',
    nextStep: item.nextStep || '',
    body: item.body || '',
    action: item.action || null
  }));
}

async function getMailSamples(provider) {
  try {
    if (provider === 'zoho_mail') {
      const cfg = await getEmailConfig('zoho_mail');
      if (!cfg?.accessToken || !cfg?.accountId) return [];
      const data = await zohoGet(cfg, `/accounts/${cfg.accountId}/messages/view`, { limit: 12, sortcolumn: 'date', sortorder: 'desc' });
      return (data.data || []).filter(m => !m.isRead).slice(0, 8).map(m => ({
        id: m.messageId, provider, subject: m.subject || '(no subject)', from: m.fromAddress || '', snippet: m.summary || ''
      }));
    }
    if (provider === 'gmail') {
      const cfg = await getEmailConfig('gmail');
      if (!cfg?.accessToken) return [];
      const list = await gmailGet(cfg, '/messages', { maxResults: 8, q: 'is:unread -from:noreply -from:no-reply' });
      const msgs = await Promise.all((list.messages || []).slice(0, 8).map(m => {
        const params = new URLSearchParams();
        params.append('format', 'metadata');
        ['Subject', 'From', 'Date'].forEach(h => params.append('metadataHeaders', h));
        return gmailGet(cfg, `/messages/${m.id}`, params);
      }));
      return msgs.map(m => {
        const h = {};
        (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
        return { id: m.id, provider, subject: h.Subject || '(no subject)', from: h.From || '', snippet: m.snippet || '' };
      });
    }
    if (provider === 'outlook') {
      const cfg = await getEmailConfig('outlook');
      if (!cfg?.accessToken) return [];
      const data = await msGet(cfg, '/me/messages', { '$select': 'subject,from,bodyPreview,receivedDateTime,isRead', '$top': 12, '$orderby': 'receivedDateTime desc' });
      return (data.value || []).filter(m => !m.isRead).slice(0, 8).map(m => ({
        id: m.id, provider, subject: m.subject || '(no subject)', from: m.from?.emailAddress?.address || '', snippet: m.bodyPreview || ''
      }));
    }
  } catch {}
  return [];
}

async function fetchUpworkRSS() {
  const queries = ['PLC SCADA South Africa', 'industrial automation South Africa', 'PCB electronics repair', 'IoT monitoring South Africa'];
  const results = [];
  const seen = new Set();
  for (const q of queries) {
    try {
      const r = await axios.get(`https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(q)}&sort=recency`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const items = r.data.match(/<item>([\s\S]*?)<\/item>/g) || [];
      items.slice(0, 4).forEach(item => {
        const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || '';
        const link = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() || '';
        const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) || '';
        if (title && link && !seen.has(link)) { seen.add(link); results.push({ title, url: link, description: desc, query: q }); }
      });
    } catch {}
  }
  return results;
}

app.http('agent-scan', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/scan',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const errors = [];
    const newItems = [];

    try {
      const client = await getClaude();
      const queueDoc = await loadQueue();
      const existing = new Set((queueDoc.queue || []).map(itemFingerprint).filter(Boolean));

      const mail = [
        ...(await getMailSamples('zoho_mail')),
        ...(await getMailSamples('gmail')),
        ...(await getMailSamples('outlook'))
      ];

      if (mail.length) {
        const r = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2200,
          messages: [{ role: 'user', content: `You are Frank Muland's AI agent for TECHSINNO (Pty) Ltd, Kuilsriver, Western Cape, South Africa.

Services: PCB repair, factory automation (PLC/SCADA), IoT monitoring.

Find business-relevant unread emails. Skip newsletters and automated notifications.
${SCOUT_RULES}

EMAILS:
${JSON.stringify(mail)}

Return ONLY valid JSON array:
[{"emailId":"id","provider":"zoho_mail|gmail|outlook","type":"email_reply","priority":1-5,"flagType":"lead|quote_request|urgent|follow_up","reason":"max 8 words","toAddress":"sender email","companyName":"company name/domain guess","contactName":"sender name if known","industry":"manufacturing|mining|agriculture|logistics|energy|food_processing|construction|other","painPoint":"specific likely or explicit operational problem","evidence":"email phrase/domain/sector used; say assumption if inferred","techsinnoSolution":"which TECHSINNO service fits and why","nextStep":"small practical next step to offer","subject":"specific Re: subject","body":"professional reply, 3-5 sentences, ending with Frank's signature"}]
Return [] if none qualify.` }]
        });
        parseJsonArray(r.content[0]?.text).forEach(item => {
          if (!existing.has(item.emailId)) {
            newItems.push({
              id: uuidv4(), type: 'email_reply', source: item.provider || 'cloud_mail', emailId: item.emailId,
              priority: item.priority || 3, flagType: item.flagType || 'lead', title: item.subject, reason: item.reason,
              to: item.toAddress || '', subject: item.subject, body: item.body, provider: item.provider || 'zoho_mail',
              companyName: item.companyName || '', contactName: item.contactName || '', industry: item.industry || 'other',
              painPoint: item.painPoint || '', evidence: item.evidence || '', techsinnoSolution: item.techsinnoSolution || '',
              nextStep: item.nextStep || '', status: 'pending', createdAt: Date.now()
            });
            existing.add(item.emailId);
          }
        });
      }

      try {
        const jobs = await fetchUpworkRSS();
        if (jobs.length) {
          const r = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1600,
            messages: [{ role: 'user', content: `TECHSINNO does PCB repair, PLC/SCADA automation, and IoT monitoring in South Africa.
${SCOUT_RULES}

From these Upwork jobs pick the top 3 most relevant:
${JSON.stringify(jobs)}

Return ONLY JSON array:
[{"title":"job title","url":"url","relevance":1-10,"reason":"max 8 words","painPoint":"problem client likely has","techsinnoSolution":"service fit","nextStep":"first action","bidProposal":"short practical bid from Frank"}]` }]
          });
          parseJsonArray(r.content[0]?.text).filter(j => (j.relevance || 0) >= 6).forEach(item => {
            if (!existing.has(item.url)) {
              newItems.push({
                id: uuidv4(), type: 'opportunity', source: 'upwork', priority: Math.ceil((10 - (item.relevance || 6)) / 2),
                flagType: 'opportunity', title: item.title, reason: item.reason, url: item.url, platform: 'Upwork',
                body: item.bidProposal, painPoint: item.painPoint || '', techsinnoSolution: item.techsinnoSolution || '',
                nextStep: item.nextStep || '', status: 'pending', createdAt: Date.now()
              });
              existing.add(item.url);
            }
          });
        }
      } catch (err) { errors.push('Upwork: ' + err.message); }

      try {
        const ctx = await loadBusinessContext();
        const adminItems = buildHeuristicAdminItems(ctx);
        for (const item of adminItems) {
          const fp = itemFingerprint(item);
          if (fp && !existing.has(fp)) {
            newItems.push(item);
            existing.add(fp);
          }
        }

        const claudeAdminItems = await buildClaudeAdminItems(client, ctx);
        for (const item of claudeAdminItems) {
          const fp = itemFingerprint(item);
          if (fp && !existing.has(fp)) {
            newItems.push(item);
            existing.add(fp);
          }
        }
      } catch (err) {
        errors.push('Admin review: ' + err.message);
      }

      const now = Date.now();
      queueDoc.queue = [...(queueDoc.queue || []), ...newItems].slice(-300);
      queueDoc.lastScan = now;
      queueDoc.updatedAt = new Date().toISOString();
      queueDoc.updatedBy = decoded.sub;
      await saveQueue(queueDoc);

      return jsonResponse({ success: true, newItems: newItems.length, queue: queueDoc.queue, lastScan: now, errors });
    } catch (err) {
      return jsonResponse({ error: err.message || 'Agent scan failed', errors }, 500);
    }
  }
});
