const { app } = require('@azure/functions');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getItem, createItem, replaceItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const { getMailSamplesWithError, getDefaultProvider } = require('../../shared/mail-scan');
const { getBooksSnapshot } = require('../../shared/zoho-books');

// ============================================================================
// Scheduled agent scan.
//
// Changes in this version:
//  - Mail sampling moved to shared/mail-scan.js (reused by chat tools and the
//    morning briefing). Mail fetch failures are now REPORTED in `errors`
//    instead of silently returning nothing.
//  - Upwork RSS leg removed: Upwork discontinued public RSS feeds on
//    20 Aug 2024, so that code has been returning zero results silently.
//    A proper sourcing rebuild (eTenders / search-based) is planned.
//  - New bookkeeper watchdog: overdue invoices from Zoho Books become
//    approval-queue items with a ready-to-send payment chaser.
//  - The queue document now stores lastErrors + lastScanSummary so the
//    dashboard can show what each scan actually did.
// ============================================================================

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

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authenticateAgentScanSecret(request) {
  const expected = process.env.AGENT_SCAN_SECRET || '';
  const provided = request.headers.get('x-agent-scan-secret') || '';
  if (!constantTimeEqual(provided, expected)) return null;
  return {
    sub: 'scheduled-agent-scan',
    role: 'manager',
    accountRole: 'manager',
    isOwner: false
  };
}

async function loadBusinessContext() {
  const safe = async (fn, fallback = []) => {
    try { return await fn(); } catch { return fallback; }
  };

  const [tasks, jobCards, clients, projects, campaigns, users, quotes, reminders] = await Promise.all([
    safe(() => queryItems('tasks', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 80')),
    safe(() => queryItems('job-cards', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60')),
    safe(() => queryItems('clients', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60')),
    safe(() => queryItems('projects', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 40')),
    safe(() => queryItems('campaigns', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 30')),
    safe(() => queryItems('users', 'SELECT c.id, c.displayName, c.role, c.active FROM c WHERE c.active = true OFFSET 0 LIMIT 30')),
    safe(() => queryItems('quotes', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 80')),
    safe(() => queryItems('reminders', "SELECT * FROM c WHERE c.status = 'active' ORDER BY c.dueDate ASC OFFSET 0 LIMIT 60"))
  ]);

  return { tasks, jobCards, clients, projects, campaigns, users, quotes, reminders };
}

function activeDefaultAssignee(ctx) {
  const activeUsers = (ctx.users || []).filter(u => u.active !== false);
  const preferred = activeUsers.find(u => u.role === 'manager') || activeUsers[0];
  return preferred?.id || null;
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

// ---------------------------------------------------------------------------
// Bookkeeper watchdog: overdue Zoho Books invoices → payment-chaser drafts.
// ---------------------------------------------------------------------------

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchCrmClient(invoiceClientName, crmClients) {
  const target = normalizeName(invoiceClientName);
  if (!target) return null;
  return (crmClients || []).find(c => {
    const crm = normalizeName(c.companyName);
    if (!crm) return false;
    return crm === target || crm.includes(target) || target.includes(crm);
  }) || null;
}

function findClientForQuote(quote, crmClients) {
  if (!quote) return null;
  const byId = (crmClients || []).find(c => c.id === quote.clientId);
  return byId || matchCrmClient(quote.clientName, crmClients);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function quoteFollowUpBody(quote, client) {
  const contact = client?.contactName || 'there';
  const total = Math.round(quote.grandTotal || 0).toLocaleString('en-ZA');
  return `Hi ${contact},

Just following up on ${quote.quoteNumber || 'the quote'} for ${quote.title || 'the work we discussed'}.

The quoted amount is R${total} incl. VAT. Please let me know if you would like me to adjust the scope, clarify any line item, or plan the next step.

Regards,
Frank
TECHSINNO (Pty) Ltd`;
}

function buildFollowUpEngineItems(ctx, defaultProvider) {
  const items = [];
  const defaultAssignee = activeDefaultAssignee(ctx);
  const now = Date.now();

  (ctx.quotes || []).forEach(q => {
    const status = String(q.status || 'draft').toLowerCase();
    if (['accepted', 'rejected'].includes(status)) return;

    const age = daysSince(q.updatedAt || q.createdAt);
    const validUntil = q.validUntil ? new Date(q.validUntil).getTime() : null;
    const expiresSoon = validUntil && validUntil >= now && validUntil <= now + (5 * 86400000);
    const expired = validUntil && validUntil < now;
    const client = findClientForQuote(q, ctx.clients);
    const to = client?.email || '';

    if (status === 'sent' && (age >= 3 || expiresSoon || expired)) {
      items.push(queueItem({
        type: 'quote_followup',
        source: 'followup_engine',
        fingerprint: `quote_followup:${q.id}:${status}:${q.updatedAt || q.validUntil || q.createdAt}`,
        relatedId: q.id,
        priority: expired || expiresSoon ? 1 : 2,
        flagType: 'follow_up',
        title: `Follow up quote ${q.quoteNumber || ''} â€” ${q.clientName || 'client'}`,
        reason: expired ? 'Quote expired' : expiresSoon ? 'Quote expiring soon' : `${age} days since sent`,
        to,
        provider: to && defaultProvider ? defaultProvider : '',
        subject: `Follow-up: ${q.quoteNumber || 'TECHSINNO quote'}`,
        body: quoteFollowUpBody(q, client),
        painPoint: 'A sent quote can go cold without a clear next step.',
        evidence: `Quote status ${status}; updated ${shortDate(q.updatedAt || q.createdAt)}; valid until ${shortDate(q.validUntil)}.`,
        techsinnoSolution: 'Sales follow-up: ask whether scope, timing, or clarification is blocking the decision.',
        nextStep: to ? 'Review and send the quote follow-up.' : 'Add the client email in CRM, then send the follow-up.'
      }));
      return;
    }

    if (status === 'draft' && age >= 2 && defaultAssignee) {
      items.push(queueItem({
        type: 'quote_followup',
        source: 'followup_engine',
        fingerprint: `quote_followup:draft:${q.id}:${q.updatedAt || q.createdAt}`,
        relatedId: q.id,
        priority: 2,
        flagType: 'follow_up',
        title: `Draft quote waiting: ${q.quoteNumber || q.title || q.clientName}`,
        reason: `${age} days in draft`,
        body: 'A quote draft has been sitting without being sent or closed. This is a useful place for the agent to keep sales admin moving.',
        painPoint: 'Draft quotes do not create revenue until they are reviewed and sent.',
        evidence: `Quote status draft; updated ${shortDate(q.updatedAt || q.createdAt)}.`,
        techsinnoSolution: 'Admin follow-up: review scope, send it, or close it if no longer needed.',
        nextStep: 'Review the quote page and decide whether to send or revise it.',
        action: {
          kind: 'create_task',
          label: 'Create quote review task',
          payload: {
            title: `Review quote ${q.quoteNumber || q.title || q.clientName}`,
            description: `AI follow-up engine found a draft quote waiting since ${shortDate(q.updatedAt || q.createdAt)}. Review, send, revise, or close it.`,
            category: 'admin',
            priority: 'medium',
            assignedTo: defaultAssignee,
            deadline: addDays(1)
          }
        }
      }));
    }
  });

  (ctx.reminders || []).forEach(r => {
    if (!r.dueDate) return;
    const due = new Date(r.dueDate).getTime();
    if (!Number.isFinite(due) || due > now) return;
    items.push(queueItem({
      type: 'task_reminder',
      source: 'followup_engine',
      fingerprint: `task_reminder:${r.id}:${r.dueDate}`,
      relatedId: r.id,
      priority: r.priority === 'high' ? 1 : 2,
      flagType: 'follow_up',
      title: `Reminder due: ${r.title}`,
      reason: `Due ${shortDate(r.dueDate)}`,
      body: r.description || 'A reminder is due or overdue and needs a decision, reply, or follow-up.',
      painPoint: 'A reminder has reached its due date and can disappear into admin noise.',
      evidence: `Reminder due ${shortDate(r.dueDate)}; priority ${r.priority || 'medium'}.`,
      techsinnoSolution: 'Secretary follow-up: either complete it, convert it to a task, or send the needed reply.',
      nextStep: 'Decide whether this is done, still needed, or should become a task.'
    }));
  });

  return items;
}

function buildSourcingItems(ctx) {
  const defaultAssignee = activeDefaultAssignee(ctx);
  if (!defaultAssignee) return [];

  const leadCounts = {};
  (ctx.clients || []).forEach(c => {
    const industry = c.industry || 'other';
    if (!['won', 'lost'].includes(String(c.status || '').toLowerCase())) {
      leadCounts[industry] = (leadCounts[industry] || 0) + 1;
    }
  });

  const sectors = [
    {
      industry: 'manufacturing',
      title: 'Manufacturing maintenance prospects',
      target: 'small and mid-size manufacturers in Blackheath, Epping, Killarney Gardens and Bellville South',
      pain: 'production stoppages caused by failed PCBs, sensors, drives, and control panels',
      service: 'PCB repair, diagnostics, PLC/SCADA support, and preventive maintenance checks',
      firstStep: 'Build a 10-company prospect list and draft one problem-first intro email.'
    },
    {
      industry: 'food_processing',
      title: 'Food processing downtime prospects',
      target: 'food processors, packhouses, cold storage and bottling operations in the Western Cape',
      pain: 'downtime, temperature/control faults, and maintenance gaps during production runs',
      service: 'diagnostics, control-panel review, IoT monitoring, and preventive maintenance',
      firstStep: 'Find 8 operations managers and prepare a monitoring/downtime-risk outreach angle.'
    },
    {
      industry: 'agriculture',
      title: 'Agriculture automation prospects',
      target: 'farms, packhouses, irrigation operators and agri-processing sites',
      pain: 'pump/control faults, moisture/temperature blind spots, and unreliable field monitoring',
      service: 'IoT monitoring, automation support, diagnostics, and preventive checks',
      firstStep: 'Create a farm/packhouse target list and draft a site-walk-through offer.'
    },
    {
      industry: 'logistics',
      title: 'Logistics and warehouse prospects',
      target: 'warehouses, fleet depots and cold-chain logistics operators',
      pain: 'equipment faults, monitoring gaps, and preventable downtime in handling or storage systems',
      service: 'diagnostics, IoT monitoring, control-panel review, and repair coordination',
      firstStep: 'List 8 logistics sites and draft a short operational-risk email.'
    }
  ];

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekKey = weekStart.toISOString().slice(0, 10);

  return sectors
    .map(s => ({ ...s, activeLeads: leadCounts[s.industry] || 0 }))
    .sort((a, b) => a.activeLeads - b.activeLeads)
    .slice(0, 3)
    .map((s, index) => queueItem({
      type: 'sourcing_target',
      source: 'sourcing_engine',
      fingerprint: `sourcing_target:${weekKey}:${s.industry}`,
      priority: s.activeLeads === 0 ? 2 : 3 + index,
      flagType: 'opportunity',
      title: s.title,
      reason: s.activeLeads === 0 ? 'No active leads' : `${s.activeLeads} active lead(s)`,
      body: `Target: ${s.target}.\n\nSourcing play: ${s.firstStep}`,
      painPoint: s.pain,
      evidence: `CRM currently shows ${s.activeLeads} active ${s.industry.replace('_', ' ')} lead(s).`,
      techsinnoSolution: s.service,
      nextStep: s.firstStep,
      action: {
        kind: 'create_task',
        label: 'Create sourcing task',
        payload: {
          title: `Source ${s.title.toLowerCase()}`,
          description: `AI sourcing engine target: ${s.target}. Pain to lead with: ${s.pain}. First step: ${s.firstStep}`,
          category: 'admin',
          priority: s.activeLeads === 0 ? 'high' : 'medium',
          assignedTo: defaultAssignee,
          deadline: addDays(2)
        }
      }
    }));
}

function chaseEmailBody(inv, contactName) {
  return `Hi ${contactName || 'there'},

Just a friendly reminder that invoice ${inv.number} for R${Math.round(inv.balance).toLocaleString('en-ZA')} was due on ${shortDate(inv.due)} and is now ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} outstanding.

Could you let me know when we can expect payment, or whether anything on the invoice needs clarifying from our side? If payment has already been made, please ignore this note — and thank you.

Regards,
Frank
TECHSINNO (Pty) Ltd`;
}

function buildBookkeeperItems(books, ctx, defaultProvider) {
  if (!books || !books.overdueInvoices?.length) return [];
  const items = [];

  books.overdueInvoices.slice(0, 8).forEach(inv => {
    const crm = matchCrmClient(inv.client, ctx.clients);
    const to = crm?.email || '';
    items.push(queueItem({
      type: 'invoice_overdue',
      source: 'books_watchdog',
      fingerprint: `invoice_overdue:${inv.number}:${inv.due}`,
      priority: inv.daysOverdue >= 14 ? 1 : 2,
      flagType: 'urgent',
      title: `Overdue invoice ${inv.number} — ${inv.client}`,
      reason: `R${Math.round(inv.balance).toLocaleString('en-ZA')} · ${inv.daysOverdue}d overdue`,
      to,
      provider: to && defaultProvider ? defaultProvider : '',
      subject: `Payment follow-up: Invoice ${inv.number}`,
      body: chaseEmailBody(inv, crm?.contactName),
      painPoint: 'Cash is stuck in an unpaid invoice past its due date.',
      evidence: `Zoho Books: invoice ${inv.number} due ${shortDate(inv.due)}, balance R${Math.round(inv.balance).toLocaleString('en-ZA')}.`,
      techsinnoSolution: 'Bookkeeper follow-up: a polite, specific payment reminder with a clear ask.',
      nextStep: to
        ? 'Review and send the payment chaser, or call the client.'
        : `No email on file for "${inv.client}" in the CRM — add the client's email, or copy this text and send it manually.`
    }));
  });

  return items;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

app.http('agent-scan', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/scan',
  handler: async (request) => {
    const decoded = authenticate(request) || authenticateAgentScanSecret(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const errors = [];
    const newItems = [];

    try {
      let client = null;
      try {
        client = await getClaude();
      } catch (err) {
        errors.push('Claude: ' + err.message);
      }

      const queueDoc = await loadQueue();
      const existing = new Set((queueDoc.queue || []).map(itemFingerprint).filter(Boolean));

      // ---- 1. Business context (used by admin + bookkeeper legs) ----------
      const ctx = await loadBusinessContext();
      const defaultProvider = await getDefaultProvider();

      // ---- 2. Email leg: unread mail → drafted replies ---------------------
      const mail = [];
      for (const provider of ['zoho_mail', 'gmail', 'outlook']) {
        const { samples, error } = await getMailSamplesWithError(provider);
        mail.push(...samples);
        if (error) errors.push('Mail ' + error);
      }

      if (mail.length && client) {
        try {
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
[{"emailId":"id","provider":"zoho_mail|gmail|outlook","type":"email_reply","inboxCategory":"rfq|customer_reply|complaint|supplier|payment|booking|admin|other","urgency":"urgent|today|this_week|low","priority":1-5,"flagType":"lead|quote_request|urgent|follow_up","reason":"max 8 words","toAddress":"sender email","companyName":"company name/domain guess","contactName":"sender name if known","industry":"manufacturing|mining|agriculture|logistics|energy|food_processing|construction|other","painPoint":"specific likely or explicit operational problem","evidence":"email phrase/domain/sector used; say assumption if inferred","techsinnoSolution":"which TECHSINNO service fits and why","nextStep":"small practical next step to offer","suggestedAction":"create_task|draft_reply|add_lead|watch_only","subject":"specific Re: subject","body":"professional reply, 3-5 sentences, ending with Frank's signature"}]
Return [] if none qualify.` }]
          });
          parseJsonArray(r.content[0]?.text).forEach(item => {
            if (!existing.has(item.emailId)) {
              newItems.push({
                id: uuidv4(), type: 'email_reply', source: 'inbox_autopilot', emailId: item.emailId,
                priority: item.priority || 3, flagType: item.flagType || 'lead', title: item.subject, reason: item.reason,
                to: item.toAddress || '', subject: item.subject, body: item.body, provider: item.provider || 'zoho_mail',
                companyName: item.companyName || '', contactName: item.contactName || '', industry: item.industry || 'other',
                inboxCategory: item.inboxCategory || 'other', urgency: item.urgency || 'this_week', suggestedAction: item.suggestedAction || 'draft_reply',
                painPoint: item.painPoint || '', evidence: item.evidence || '', techsinnoSolution: item.techsinnoSolution || '',
                nextStep: item.nextStep || '', status: 'pending', createdAt: Date.now()
              });
              existing.add(item.emailId);
            }
          });
        } catch (err) {
          errors.push('Mail AI: ' + err.message);
        }
      }

      // ---- 3. Bookkeeper leg: overdue invoices → payment chasers ----------
      try {
        const books = await getBooksSnapshot(); // null if Books not connected
        if (books) {
          const bookItems = buildBookkeeperItems(books, ctx, defaultProvider);
          for (const item of bookItems) {
            const fp = itemFingerprint(item);
            if (fp && !existing.has(fp)) {
              newItems.push(item);
              existing.add(fp);
            }
          }
        }
      } catch (err) {
        errors.push('Books: ' + (err.message || 'Zoho Books fetch failed'));
      }

      // ---- 4. Follow-up engine: quotes + reminders ------------------------
      try {
        const followUpItems = buildFollowUpEngineItems(ctx, defaultProvider);
        for (const item of followUpItems) {
          const fp = itemFingerprint(item);
          if (fp && !existing.has(fp)) {
            newItems.push(item);
            existing.add(fp);
          }
        }
      } catch (err) {
        errors.push('Follow-up engine: ' + err.message);
      }

      // ---- 5. Work sourcing engine: weekly target sectors ------------------
      try {
        const sourcingItems = buildSourcingItems(ctx);
        for (const item of sourcingItems) {
          const fp = itemFingerprint(item);
          if (fp && !existing.has(fp)) {
            newItems.push(item);
            existing.add(fp);
          }
        }
      } catch (err) {
        errors.push('Sourcing engine: ' + err.message);
      }

      // ---- 6. Admin legs: heuristics + Claude review -----------------------
      try {
        const adminItems = buildHeuristicAdminItems(ctx);
        for (const item of adminItems) {
          const fp = itemFingerprint(item);
          if (fp && !existing.has(fp)) {
            newItems.push(item);
            existing.add(fp);
          }
        }

        if (client) {
          try {
            const claudeAdminItems = await buildClaudeAdminItems(client, ctx);
            for (const item of claudeAdminItems) {
              const fp = itemFingerprint(item);
              if (fp && !existing.has(fp)) {
                newItems.push(item);
                existing.add(fp);
              }
            }
          } catch (err) {
            errors.push('Admin AI: ' + err.message);
          }
        }
      } catch (err) {
        errors.push('Admin review: ' + err.message);
      }

      // ---- 7. Persist queue + scan telemetry -------------------------------
      const byType = {};
      newItems.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });

      const now = Date.now();
      queueDoc.queue = [...(queueDoc.queue || []), ...newItems].slice(-300);
      queueDoc.lastScan = now;
      queueDoc.lastErrors = errors;
      queueDoc.lastScanSummary = { at: now, newItems: newItems.length, byType };
      queueDoc.updatedAt = new Date().toISOString();
      queueDoc.updatedBy = decoded.sub;
      await saveQueue(queueDoc);

      return jsonResponse({ success: true, newItems: newItems.length, byType, queue: queueDoc.queue, lastScan: now, errors });
    } catch (err) {
      return jsonResponse({ error: err.message || 'Agent scan failed', errors }, 500);
    }
  }
});
