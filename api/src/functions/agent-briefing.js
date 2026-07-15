const { app } = require('@azure/functions');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { getItem, createItem, replaceItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const { getMailSamplesWithError, getDefaultProvider, sendPlainEmail } = require('../../shared/mail-scan');
const { getBooksSnapshot } = require('../../shared/zoho-books');
const { getEmailConfig } = require('../../shared/email');

// ============================================================================
// Morning briefing — POST /api/agent/briefing
//
// The proactive half of the agent. Gathers money (Zoho Books), follow-ups,
// tasks, jobs, reminders, unread mail and pending approvals, composes a
// plaintext briefing (with Claude writing the "top 3 priorities" section),
// and EMAILS it to Frank through an already-connected mail account.
//
// Auth: manager JWT, or the same X-Agent-Scan-Secret header the scheduled
// scan uses — so the GitHub Actions cron can trigger it every weekday morning.
//
// Recipient resolution (first match wins):
//   1. AGENT_BRIEFING_TO environment variable (SWA application setting)
//   2. config doc cfg_agent → briefingTo
//   3. connected Zoho Mail address, then Gmail address
//   4. fallback: frank@techsinno.com
//
// Body options: { "dryRun": true } composes and returns the briefing
// without sending — handy for testing with curl.
// ============================================================================

const FALLBACK_RECIPIENT = 'frank@techsinno.com';

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
  return { sub: 'scheduled-agent-briefing', role: 'manager', accountRole: 'manager', isOwner: false };
}

function rand(value) {
  return `R${Math.round(value || 0).toLocaleString('en-ZA')}`;
}

function shortDate(value) {
  if (!value) return 'no date';
  try { return new Date(value).toISOString().slice(0, 10); } catch { return String(value); }
}

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86400000);
}

async function safeQuery(container, sql, params = []) {
  try { return await queryItems(container, sql, params); } catch { return []; }
}

async function resolveRecipient() {
  if (process.env.AGENT_BRIEFING_TO) return process.env.AGENT_BRIEFING_TO;
  try {
    const cfg = await getItem('config', 'cfg_agent');
    if (cfg?.briefingTo) return cfg.briefingTo;
  } catch {}
  try {
    const zoho = await getEmailConfig('zoho_mail');
    if (zoho?.email) return zoho.email;
    const aliases = zoho?.aliases || [];
    const def = aliases.find(a => a.isDefault) || aliases[0];
    if (def?.address) return def.address;
  } catch {}
  try {
    const gmail = await getEmailConfig('gmail');
    if (gmail?.email) return gmail.email;
  } catch {}
  return FALLBACK_RECIPIENT;
}

async function gatherBriefingData() {
  const notes = [];
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const [tasks, jobCards, clients, reminders] = await Promise.all([
    safeQuery('tasks', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 120'),
    safeQuery('job-cards', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60'),
    safeQuery('clients', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 120'),
    safeQuery('reminders', "SELECT * FROM c WHERE c.status = 'active' ORDER BY c.dueDate ASC OFFSET 0 LIMIT 60")
  ]);

  // Tasks
  const open = tasks.filter(t => t.status !== 'done');
  const overdueTasks = open.filter(t => t.deadline && new Date(t.deadline).getTime() < now);
  const blockedTasks = open.filter(t => t.status === 'blocked');
  const dueToday = open.filter(t => t.deadline && String(t.deadline).slice(0, 10) === today);

  // CRM follow-ups
  const followUpsDue = clients.filter(c =>
    c.followUpDate &&
    new Date(c.followUpDate).getTime() <= now &&
    !['won', 'lost'].includes(String(c.status || '').toLowerCase())
  );

  // Jobs
  const openJobs = jobCards.filter(j => !['done', 'completed', 'closed'].includes(String(j.status || '').toLowerCase()));
  const problemJobs = openJobs.filter(j => {
    const unassigned = !(j.assignedTo || []).length;
    const stale = daysSince(j.updatedAt || j.createdAt) >= 7;
    const blocked = (j.tasks || []).some(t => t.status === 'blocked');
    return unassigned || stale || blocked;
  });

  // Reminders due today or overdue
  const remindersDue = reminders.filter(r => r.dueDate && String(r.dueDate).slice(0, 10) <= today);

  // Approval queue
  let pendingApprovals = [];
  try {
    const queueDoc = await getItem('config', 'agent_queue');
    pendingApprovals = (queueDoc?.queue || []).filter(i => i.status === 'pending');
  } catch {}
  const approvalsByType = {};
  pendingApprovals.forEach(i => { approvalsByType[i.type] = (approvalsByType[i.type] || 0) + 1; });

  // Unread mail
  const mail = [];
  for (const provider of ['zoho_mail', 'gmail', 'outlook']) {
    const { samples, error } = await getMailSamplesWithError(provider, 6);
    mail.push(...samples);
    if (error) notes.push('Mail ' + error);
  }

  // Money (Zoho Books) — skip silently if not connected
  let books = null;
  try {
    books = await getBooksSnapshot();
  } catch (err) {
    notes.push('Books: ' + (err.message || 'Zoho Books fetch failed'));
  }

  return {
    today,
    tasks: { open, overdueTasks, blockedTasks, dueToday },
    followUpsDue,
    jobs: { openJobs, problemJobs },
    remindersDue,
    approvals: { pending: pendingApprovals, byType: approvalsByType },
    mail,
    books,
    notes
  };
}

function composeBriefing(data, priorities) {
  const dateLine = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [];

  lines.push(`TECHSINNO MORNING BRIEFING — ${dateLine}`);
  lines.push('='.repeat(50));
  lines.push('');

  if (priorities) {
    lines.push('TOP PRIORITIES TODAY');
    lines.push(priorities.trim());
    lines.push('');
  }

  // Money
  if (data.books) {
    const s = data.books.summary;
    lines.push('MONEY (Zoho Books)');
    lines.push(`  Overdue: ${rand(s.totalOverdue)} across ${s.overdueCount} invoice(s) · Unpaid total: ${rand(s.totalUnpaid)}`);
    lines.push(`  Invoiced this month: ${rand(s.invoicedThisMonth)} · Expenses this month: ${rand(s.expensesThisMonth)}`);
    data.books.overdueInvoices.slice(0, 5).forEach(inv => {
      lines.push(`  - ${inv.number} ${inv.client}: ${rand(inv.balance)}, ${inv.daysOverdue}d overdue (due ${shortDate(inv.due)})`);
    });
    lines.push('');
  }

  // Follow-ups
  lines.push(`FOLLOW-UPS DUE (${data.followUpsDue.length})`);
  if (data.followUpsDue.length) {
    data.followUpsDue.slice(0, 6).forEach(c => {
      lines.push(`  - ${c.companyName || c.contactName || 'Unnamed'} (${c.status}${c.estimatedValue ? `, ~${rand(c.estimatedValue)}` : ''}) — due ${shortDate(c.followUpDate)}`);
    });
  } else {
    lines.push('  None due.');
  }
  lines.push('');

  // Tasks
  const t = data.tasks;
  lines.push(`TASKS — ${t.open.length} open · ${t.overdueTasks.length} overdue · ${t.blockedTasks.length} blocked · ${t.dueToday.length} due today`);
  t.overdueTasks.slice(0, 5).forEach(x => lines.push(`  - OVERDUE: ${x.title} (was due ${shortDate(x.deadline)})`));
  t.blockedTasks.slice(0, 3).forEach(x => lines.push(`  - BLOCKED: ${x.title}`));
  t.dueToday.slice(0, 5).forEach(x => lines.push(`  - DUE TODAY: ${x.title}`));
  lines.push('');

  // Jobs
  lines.push(`JOBS — ${data.jobs.openJobs.length} open, ${data.jobs.problemJobs.length} need attention`);
  data.jobs.problemJobs.slice(0, 5).forEach(j => {
    const why = !(j.assignedTo || []).length ? 'no assignee'
      : (j.tasks || []).some(x => x.status === 'blocked') ? 'blocked task'
      : `${daysSince(j.updatedAt || j.createdAt)}d no update`;
    lines.push(`  - ${j.title || j.jobTitle || j.clientName || j.id}: ${why}`);
  });
  lines.push('');

  // Reminders
  if (data.remindersDue.length) {
    lines.push(`REMINDERS DUE (${data.remindersDue.length})`);
    data.remindersDue.slice(0, 6).forEach(r => lines.push(`  - ${r.title} (${shortDate(r.dueDate)})`));
    lines.push('');
  }

  // Inbox
  lines.push(`INBOX — ${data.mail.length} recent unread`);
  data.mail.slice(0, 5).forEach(m => lines.push(`  - [${m.provider}] ${m.subject} — ${m.from}`));
  lines.push('');

  // Approvals
  lines.push(`WAITING FOR YOUR APPROVAL — ${data.approvals.pending.length} item(s) in the AI Agent page`);
  Object.entries(data.approvals.byType).forEach(([type, count]) => lines.push(`  - ${type}: ${count}`));
  lines.push('');

  if (data.notes.length) {
    lines.push('SYSTEM NOTES');
    data.notes.forEach(n => lines.push(`  ! ${n}`));
    lines.push('');
  }

  lines.push('—');
  lines.push('Sent automatically by the TECHSINNO AI agent. Open the dashboard to approve drafts and actions.');

  return lines.join('\n');
}

async function writePriorities(data) {
  let cfg = null;
  try { cfg = await getItem('config', 'cfg_claude'); } catch {}
  if (!cfg || !cfg.apiKey) return null;

  const digest = {
    today: data.today,
    money: data.books ? {
      totalOverdue: Math.round(data.books.summary.totalOverdue),
      overdueInvoices: data.books.overdueInvoices.slice(0, 5)
    } : null,
    followUpsDue: data.followUpsDue.slice(0, 6).map(c => ({ company: c.companyName, status: c.status, value: c.estimatedValue })),
    overdueTasks: data.tasks.overdueTasks.slice(0, 6).map(x => ({ title: x.title, deadline: x.deadline })),
    blockedTasks: data.tasks.blockedTasks.slice(0, 4).map(x => x.title),
    problemJobs: data.jobs.problemJobs.slice(0, 5).map(j => ({ title: j.title || j.jobTitle, client: j.clientName })),
    unreadMail: data.mail.slice(0, 6).map(m => ({ subject: m.subject, from: m.from })),
    pendingApprovals: data.approvals.byType
  };

  const client = new Anthropic({ apiKey: cfg.apiKey });
  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: `You write the "top priorities" section of a morning briefing for Frank, owner of TECHSINNO (Pty) Ltd (industrial PCB repair, PLC/SCADA automation, IoT monitoring — Western Cape, South Africa).

Based ONLY on this data, pick the 3 highest-impact things Frank should do today. Money and customer commitments outrank internal tidiness. Be specific: name the invoice, client, task or email. One line each, format "1. <action> — <why, max 10 words>". No preamble, no extra text.

DATA:
${JSON.stringify(digest)}` }]
  });

  const text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return text || null;
}

app.http('agent-briefing', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'agent/briefing',
  handler: async (request) => {
    const decoded = authenticate(request) || authenticateAgentScanSecret(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    let body = {};
    try { body = await request.json(); } catch {}
    const dryRun = !!body.dryRun;

    try {
      const data = await gatherBriefingData();

      let priorities = null;
      try {
        priorities = await writePriorities(data);
      } catch (err) {
        data.notes.push('Priorities AI: ' + (err.message || 'failed'));
      }

      const briefing = composeBriefing(data, priorities);
      const subjectDate = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
      const subject = `TECHSINNO briefing — ${subjectDate}`;

      if (dryRun) {
        return jsonResponse({ success: true, dryRun: true, briefing });
      }

      const to = await resolveRecipient();
      let provider = null;
      try {
        const cfg = await getItem('config', 'cfg_agent');
        provider = cfg?.briefingProvider || null;
      } catch {}
      if (!provider) provider = await getDefaultProvider();
      if (!provider) {
        return jsonResponse({ error: 'No email account is connected — connect Zoho Mail, Gmail or Outlook in Settings first.', briefing }, 400);
      }

      await sendPlainEmail(provider, { to, subject, body: briefing });

      // Keep the latest briefing in Cosmos so the dashboard could show it
      const record = {
        id: 'agent_last_briefing',
        service: 'agent_briefing',
        text: briefing,
        sentTo: to,
        provider,
        at: new Date().toISOString(),
        triggeredBy: decoded.sub
      };
      try {
        let existing = null;
        try { existing = await getItem('config', 'agent_last_briefing'); } catch {}
        if (existing) await replaceItem('config', 'agent_last_briefing', record);
        else await createItem('config', record);
      } catch {}

      return jsonResponse({ success: true, sentTo: to, provider, briefing });
    } catch (err) {
      return jsonResponse({ error: err.message || 'Briefing failed' }, 500);
    }
  }
});
