const { v4: uuidv4 } = require('uuid');
const { getItem, createItem, replaceItem, queryItems } = require('./cosmos');
const { logActivity } = require('./activity');
const { sanitizeString, sanitizeEmail } = require('./sanitize');
const { getMailSamplesWithError, getConnectedEmailProviders, getDefaultProvider } = require('./mail-scan');
const { getBooksSnapshot } = require('./zoho-books');

// ============================================================================
// The AI agent's tool belt.
//
// This is what turns the chat from "talks about the business" into
// "works in the business". Every tool maps onto the same Cosmos containers
// and integrations the dashboard already uses.
//
// Safety model:
//   - Read tools: manager/owner only (staff keep the simple chat, no tools).
//   - Financial tools (Zoho Books): owner only.
//   - Write tools: manager/owner only, always logged to the activity feed
//     with an "ai_" action prefix so every agent write is auditable.
//   - Email is NEVER sent by the agent. queue_email_for_approval places a
//     draft in the existing agent queue where Frank reviews + sends it.
// ============================================================================

const AGENT_QUEUE_ID = 'agent_queue';
const VALID_TASK_CATEGORIES = ['admin', 'repair', 'auto', 'iot', 'general'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'done'];
const VALID_CLIENT_STATUSES = ['lead', 'contacted', 'quoted', 'negotiating', 'won', 'lost'];
const VALID_INDUSTRIES = ['manufacturing', 'mining', 'agriculture', 'logistics', 'energy', 'food_processing', 'construction', 'other'];
const VALID_SOURCES = ['linkedin', 'cold_email', 'referral', 'website', 'event', 'other'];
const VALID_INTERACTION_TYPES = ['email', 'call', 'meeting', 'linkedin', 'quote', 'other'];

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool schema)
// ---------------------------------------------------------------------------

const AGENT_TOOLS = [
  {
    name: 'get_business_snapshot',
    description: 'Live overview of the whole business: task counts (open/overdue/blocked), open job cards, CRM pipeline by status and value, follow-ups due, active campaigns, pending approval-queue items, connected email providers. Call this first when asked about status, priorities, or "what should I do".',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_tasks',
    description: 'List tasks. Optionally filter by status or assignee name. Returns id, title, status, priority, category, assignee, deadline, overdue flag.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: VALID_TASK_STATUSES, description: 'Filter by status' },
        assigned_to_name: { type: 'string', description: 'Filter by team member display name (partial match)' },
        limit: { type: 'integer', description: 'Max results (default 25)' }
      },
      required: []
    }
  },
  {
    name: 'list_clients',
    description: 'List CRM clients/leads. Optionally filter by pipeline status or search by company/contact name. Returns id, company, contact, email, status, industry, estimated value, follow-up date, short notes.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: VALID_CLIENT_STATUSES },
        search: { type: 'string', description: 'Company or contact name contains (case-insensitive)' },
        limit: { type: 'integer', description: 'Max results (default 25)' }
      },
      required: []
    }
  },
  {
    name: 'get_client',
    description: 'Full detail for one client including notes and recent interaction history. Provide client_id or an exact-enough name.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        name: { type: 'string', description: 'Company name if id is unknown' }
      },
      required: []
    }
  },
  {
    name: 'list_job_cards',
    description: 'List job cards (repair/automation/IoT jobs). Returns id, title, client, status, progress, assignees, last update, and flags for stale/unassigned/blocked.',
    input_schema: {
      type: 'object',
      properties: {
        open_only: { type: 'boolean', description: 'Only jobs not done/completed/closed (default true)' },
        limit: { type: 'integer', description: 'Max results (default 25)' }
      },
      required: []
    }
  },
  {
    name: 'list_quotes',
    description: 'List quotes with number, client, title, total (ZAR), status and validity. Useful for chasing unanswered quotes and drafting follow-ups.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'e.g. draft, sent, accepted, rejected' },
        limit: { type: 'integer', description: 'Max results (default 20)' }
      },
      required: []
    }
  },
  {
    name: 'list_reminders',
    description: 'List active reminders (title, due date, priority).',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max results (default 20)' } },
      required: []
    }
  },
  {
    name: 'list_users',
    description: 'List active team members (id, name, role). Use this to resolve assignees before creating tasks.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_recent_emails',
    description: 'Read the newest UNREAD emails from connected accounts (subject, sender, snippet). Use for secretary work: triaging the inbox, spotting RFQs, drafting replies.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['zoho_mail', 'gmail', 'outlook', 'all'], description: 'Default all' },
        limit: { type: 'integer', description: 'Max per provider (default 8)' }
      },
      required: []
    }
  },
  {
    name: 'get_books_summary',
    description: 'BOOKKEEPER (owner only): Zoho Books financial summary — total invoiced/received, overdue and unpaid amounts, expenses, net profit, this-month figures, plus top overdue invoices.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_overdue_invoices',
    description: 'BOOKKEEPER (owner only): full list of overdue invoices from Zoho Books (number, client, balance, due date, days overdue). Use before drafting payment chasers.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_pending_approvals',
    description: 'List items currently waiting in the AI approval queue (drafted emails, recommendations, overdue-invoice chasers).',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max results (default 20)' } },
      required: []
    }
  },
  {
    name: 'create_task',
    description: 'ACTION: Create a task in the dashboard. Requires title and an assignee (team member name or id). Logged to the activity feed.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string', enum: VALID_TASK_CATEGORIES },
        priority: { type: 'string', enum: VALID_PRIORITIES },
        assigned_to: { type: 'string', description: 'Team member id OR display name' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['title', 'assigned_to']
    }
  },
  {
    name: 'update_task',
    description: 'ACTION: Update an existing task — status, priority, deadline or reassignment. Logged to the activity feed.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: VALID_TASK_STATUSES },
        priority: { type: 'string', enum: VALID_PRIORITIES },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        assigned_to: { type: 'string', description: 'Team member id OR display name' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'create_reminder',
    description: 'ACTION: Create a reminder with a due date. Good secretary behaviour: set reminders for follow-ups, deadlines, and promises made in emails.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD or ISO datetime' },
        description: { type: 'string' },
        priority: { type: 'string', enum: VALID_PRIORITIES }
      },
      required: ['title', 'due_date']
    }
  },
  {
    name: 'create_client',
    description: 'ACTION: Add a new lead/client to the CRM. Use when a new prospect appears in email or conversation. Logged to the activity feed.',
    input_schema: {
      type: 'object',
      properties: {
        company_name: { type: 'string' },
        contact_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        industry: { type: 'string', enum: VALID_INDUSTRIES },
        source: { type: 'string', enum: VALID_SOURCES },
        estimated_value: { type: 'number', description: 'ZAR' },
        notes: { type: 'string' },
        follow_up_date: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['company_name']
    }
  },
  {
    name: 'update_client',
    description: 'ACTION: Update a CRM client — pipeline status, follow-up date, estimated value, append a note, or log an interaction (call/email/meeting). Logged to the activity feed.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        name: { type: 'string', description: 'Company name if id is unknown' },
        status: { type: 'string', enum: VALID_CLIENT_STATUSES },
        follow_up_date: { type: 'string', description: 'YYYY-MM-DD' },
        estimated_value: { type: 'number', description: 'ZAR' },
        add_note: { type: 'string', description: 'Appended to client notes with a date stamp' },
        log_interaction: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: VALID_INTERACTION_TYPES },
            summary: { type: 'string' }
          },
          required: ['type', 'summary']
        }
      },
      required: []
    }
  },
  {
    name: 'create_quote_draft',
    description: 'ACTION: Create a DRAFT quote in the dashboard (auto-numbered, 15% VAT default, valid 30 days). Frank reviews it in the Quotes page before it goes anywhere. Provide client and line items with quantities and ZAR unit prices.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        client_name: { type: 'string', description: 'Company name if id is unknown' },
        title: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number', description: 'ZAR, excl. VAT' }
            },
            required: ['description', 'quantity', 'unit_price']
          }
        },
        notes: { type: 'string' },
        vat_rate: { type: 'number', description: 'Percent, default 15' }
      },
      required: ['title', 'items']
    }
  },
  {
    name: 'queue_email_for_approval',
    description: 'ACTION: Draft an email and place it in the approval queue. It is NOT sent — Frank reviews, edits and sends it from the AI Agent page. Use for replies, follow-ups, payment chasers and outreach. Plaintext body, 3–8 sentences, ends with Frank\'s signature.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plaintext email body' },
        provider: { type: 'string', enum: ['zoho_mail', 'gmail', 'outlook'], description: 'Optional — defaults to the first connected account' },
        reason: { type: 'string', description: 'Max 8 words, why this email matters' },
        flag_type: { type: 'string', enum: ['lead', 'quote_request', 'urgent', 'follow_up', 'outreach'], description: 'Default follow_up' }
      },
      required: ['to', 'subject', 'body']
    }
  }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireManager(decoded) {
  if (!decoded || decoded.role !== 'manager') {
    throw new Error('Manager access required for this tool');
  }
}

function requireOwner(decoded) {
  if (!decoded || !decoded.isOwner) {
    throw new Error('Owner access required for financial data');
  }
}

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86400000);
}

function trim(value, n = 240) {
  return String(value || '').slice(0, n);
}

async function getActiveUsers() {
  return queryItems('users', 'SELECT c.id, c.displayName, c.role, c.active FROM c WHERE c.active = true OFFSET 0 LIMIT 40');
}

async function resolveUser(idOrName) {
  if (!idOrName) return null;
  const users = await getActiveUsers();
  const exact = users.find(u => u.id === idOrName);
  if (exact) return exact;
  const needle = String(idOrName).toLowerCase();
  return users.find(u => String(u.displayName || '').toLowerCase().includes(needle)) || null;
}

async function resolveClient(clientId, name) {
  if (clientId) {
    try {
      const c = await getItem('clients', clientId);
      if (c) return c;
    } catch {}
  }
  if (name) {
    const rows = await queryItems(
      'clients',
      'SELECT * FROM c WHERE CONTAINS(LOWER(c.companyName), @s) OR CONTAINS(LOWER(c.contactName), @s) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 3',
      [{ name: '@s', value: String(name).toLowerCase() }]
    );
    return rows[0] || null;
  }
  return null;
}

async function loadQueueDoc() {
  try {
    const item = await getItem('config', AGENT_QUEUE_ID);
    return item || { id: AGENT_QUEUE_ID, service: 'agent_queue', queue: [], lastScan: null };
  } catch {
    return { id: AGENT_QUEUE_ID, service: 'agent_queue', queue: [], lastScan: null };
  }
}

async function saveQueueDoc(doc) {
  let existing = null;
  try { existing = await getItem('config', AGENT_QUEUE_ID); } catch {}
  if (existing) await replaceItem('config', AGENT_QUEUE_ID, doc);
  else await createItem('config', doc);
}

function compactTask(t, userMap) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    category: t.category,
    assignedTo: userMap[t.assignedTo] || t.assignedTo,
    deadline: t.deadline,
    overdue: !!(t.deadline && t.status !== 'done' && new Date(t.deadline).getTime() < Date.now()),
    updatedAt: t.updatedAt
  };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const HANDLERS = {

  async get_business_snapshot(input, decoded) {
    requireManager(decoded);
    const [tasks, jobCards, clients, campaigns, users, queueDoc, connectedMail] = await Promise.all([
      queryItems('tasks', 'SELECT c.id, c.title, c.status, c.priority, c.deadline, c.assignedTo, c.updatedAt FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 120'),
      queryItems('job-cards', 'SELECT c.id, c.title, c.jobTitle, c.clientName, c.status, c.assignedTo, c.updatedAt FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60'),
      queryItems('clients', 'SELECT c.id, c.companyName, c.status, c.estimatedValue, c.followUpDate FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 100'),
      queryItems('campaigns', "SELECT c.id, c.name, c.type, c.status, c.metrics FROM c WHERE c.status IN ('planning', 'active') OFFSET 0 LIMIT 10"),
      getActiveUsers(),
      loadQueueDoc(),
      getConnectedEmailProviders()
    ]);

    const now = Date.now();
    const open = tasks.filter(t => t.status !== 'done');
    const overdue = open.filter(t => t.deadline && new Date(t.deadline).getTime() < now);
    const blocked = open.filter(t => t.status === 'blocked');

    const statusCounts = {};
    let pipelineValue = 0;
    const followUpsDue = [];
    clients.forEach(c => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
      if (!['won', 'lost'].includes(c.status)) pipelineValue += (c.estimatedValue || 0);
      if (c.followUpDate && new Date(c.followUpDate).getTime() <= now && !['won', 'lost'].includes(c.status)) {
        followUpsDue.push(c.companyName);
      }
    });

    const openJobs = jobCards.filter(j => !['done', 'completed', 'closed'].includes(String(j.status || '').toLowerCase()));
    const pending = (queueDoc.queue || []).filter(i => i.status === 'pending');
    const pendingByType = {};
    pending.forEach(i => { pendingByType[i.type] = (pendingByType[i.type] || 0) + 1; });

    return {
      today: new Date().toISOString().slice(0, 10),
      tasks: { open: open.length, overdue: overdue.length, blocked: blocked.length },
      jobCards: { open: openJobs.length },
      crm: { byStatus: statusCounts, pipelineValueZAR: Math.round(pipelineValue), followUpsDue },
      campaigns: campaigns.map(c => ({ name: c.name, type: c.type, status: c.status, metrics: c.metrics })),
      approvalQueue: { pending: pending.length, byType: pendingByType },
      team: users.map(u => ({ id: u.id, name: u.displayName, role: u.role })),
      connectedEmailProviders: connectedMail
    };
  },

  async list_tasks(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 25, 1), 60);
    const tasks = await queryItems('tasks', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 150');
    const users = await getActiveUsers();
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.displayName; });

    let filtered = tasks;
    if (input.status) filtered = filtered.filter(t => t.status === input.status);
    if (input.assigned_to_name) {
      const needle = String(input.assigned_to_name).toLowerCase();
      const ids = users.filter(u => String(u.displayName || '').toLowerCase().includes(needle)).map(u => u.id);
      filtered = filtered.filter(t => ids.includes(t.assignedTo));
    }
    return { count: filtered.length, tasks: filtered.slice(0, limit).map(t => compactTask(t, userMap)) };
  },

  async list_clients(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 25, 1), 60);
    let rows;
    if (input.search) {
      rows = await queryItems(
        'clients',
        'SELECT * FROM c WHERE CONTAINS(LOWER(c.companyName), @s) OR CONTAINS(LOWER(c.contactName), @s) ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 60',
        [{ name: '@s', value: String(input.search).toLowerCase() }]
      );
    } else {
      rows = await queryItems('clients', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 120');
    }
    if (input.status) rows = rows.filter(c => c.status === input.status);
    return {
      count: rows.length,
      clients: rows.slice(0, limit).map(c => ({
        id: c.id,
        company: c.companyName,
        contact: c.contactName,
        email: c.email,
        phone: c.phone,
        status: c.status,
        industry: c.industry,
        source: c.source,
        estimatedValueZAR: c.estimatedValue || 0,
        followUpDate: c.followUpDate,
        notes: trim(c.notes, 160),
        daysSinceUpdate: daysSince(c.updatedAt || c.createdAt)
      }))
    };
  },

  async get_client(input, decoded) {
    requireManager(decoded);
    const client = await resolveClient(input.client_id, input.name);
    if (!client) return { error: 'Client not found. Try list_clients with a search term.' };
    return {
      id: client.id,
      company: client.companyName,
      contact: client.contactName,
      email: client.email,
      phone: client.phone,
      status: client.status,
      industry: client.industry,
      source: client.source,
      estimatedValueZAR: client.estimatedValue || 0,
      followUpDate: client.followUpDate,
      notes: trim(client.notes, 1500),
      interactions: (client.interactions || []).slice(-8).map(i => ({ date: i.date, type: i.type, summary: trim(i.summary, 200) }))
    };
  },

  async list_job_cards(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 25, 1), 50);
    const openOnly = input.open_only !== false;
    const rows = await queryItems('job-cards', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 80');
    const filtered = rows.filter(j => {
      const closed = ['done', 'completed', 'closed'].includes(String(j.status || '').toLowerCase());
      return openOnly ? !closed : true;
    });
    return {
      count: filtered.length,
      jobCards: filtered.slice(0, limit).map(j => ({
        id: j.id,
        number: j.jobNumber || j.docNumber || '',
        title: j.title || j.jobTitle || '',
        client: j.clientName || j.client || '',
        status: j.status,
        progress: j.progress,
        assignees: j.assignedTo || [],
        unassigned: !(j.assignedTo || []).length,
        daysSinceUpdate: daysSince(j.updatedAt || j.createdAt),
        blockedTasks: (j.tasks || []).filter(t => t.status === 'blocked').map(t => t.title)
      }))
    };
  },

  async list_quotes(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 20, 1), 50);
    let rows = await queryItems('quotes', 'SELECT * FROM c ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 80');
    if (input.status) rows = rows.filter(q => q.status === input.status);
    return {
      count: rows.length,
      quotes: rows.slice(0, limit).map(q => ({
        id: q.id,
        number: q.quoteNumber,
        client: q.clientName,
        title: q.title,
        grandTotalZAR: Math.round(q.grandTotal || 0),
        status: q.status,
        validUntil: q.validUntil,
        createdAt: q.createdAt
      }))
    };
  },

  async list_reminders(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 20, 1), 50);
    const rows = await queryItems('reminders', "SELECT * FROM c WHERE c.status = 'active' ORDER BY c.dueDate ASC OFFSET 0 LIMIT 60");
    return {
      count: rows.length,
      reminders: rows.slice(0, limit).map(r => ({ id: r.id, title: r.title, dueDate: r.dueDate, priority: r.priority, description: trim(r.description, 120) }))
    };
  },

  async list_users(input, decoded) {
    requireManager(decoded);
    const users = await getActiveUsers();
    return { users: users.map(u => ({ id: u.id, name: u.displayName, role: u.role })) };
  },

  async read_recent_emails(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 8, 1), 15);
    const providers = input.provider && input.provider !== 'all' ? [input.provider] : ['zoho_mail', 'gmail', 'outlook'];
    const out = [];
    const errors = [];
    for (const p of providers) {
      const { samples, error } = await getMailSamplesWithError(p, limit);
      out.push(...samples);
      if (error) errors.push(error);
    }
    return { count: out.length, emails: out, errors };
  },

  async get_books_summary(input, decoded) {
    requireOwner(decoded);
    const snapshot = await getBooksSnapshot();
    if (!snapshot) return { error: 'Zoho Books is not connected. Connect it in Settings.' };
    return {
      orgName: snapshot.orgName,
      currency: snapshot.currency,
      summary: snapshot.summary,
      topOverdueInvoices: snapshot.overdueInvoices.slice(0, 8),
      recentExpenses: snapshot.recentExpenses.slice(0, 5)
    };
  },

  async list_overdue_invoices(input, decoded) {
    requireOwner(decoded);
    const snapshot = await getBooksSnapshot();
    if (!snapshot) return { error: 'Zoho Books is not connected. Connect it in Settings.' };
    return {
      totalOverdueZAR: Math.round(snapshot.summary.totalOverdue),
      count: snapshot.overdueInvoices.length,
      invoices: snapshot.overdueInvoices
    };
  },

  async get_pending_approvals(input, decoded) {
    requireManager(decoded);
    const limit = Math.min(Math.max(parseInt(input.limit) || 20, 1), 40);
    const doc = await loadQueueDoc();
    const pending = (doc.queue || []).filter(i => i.status === 'pending');
    return {
      count: pending.length,
      items: pending.slice(0, limit).map(i => ({
        id: i.id, type: i.type, title: i.title || i.subject, reason: i.reason, to: i.to || '', priority: i.priority
      }))
    };
  },

  // ---- Actions -------------------------------------------------------------

  async create_task(input, decoded) {
    requireManager(decoded);
    if (!input.title || !String(input.title).trim()) return { error: 'Task title is required' };
    const assignee = await resolveUser(input.assigned_to);
    if (!assignee) return { error: `Could not resolve team member "${input.assigned_to}". Call list_users first.` };

    const now = new Date().toISOString();
    const task = {
      id: `tsk_${uuidv4()}`,
      title: sanitizeString(input.title, 200),
      description: sanitizeString(input.description || '', 2000),
      category: VALID_TASK_CATEGORIES.includes(input.category) ? input.category : 'general',
      priority: VALID_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
      status: 'pending',
      assignedTo: assignee.id,
      assignedBy: decoded.sub,
      deadline: input.deadline || null,
      notes: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      createdByAgent: true
    };
    await createItem('tasks', task);
    await logActivity(decoded.sub, 'ai_task_created', `AI agent created task "${task.title}" for ${assignee.displayName}`, task.id);
    return { success: true, taskId: task.id, actionSummary: `Created task "${task.title}" → ${assignee.displayName}` };
  },

  async update_task(input, decoded) {
    requireManager(decoded);
    if (!input.task_id) return { error: 'task_id is required' };
    let task;
    try { task = await getItem('tasks', input.task_id); } catch {}
    if (!task) return { error: 'Task not found' };

    const changes = [];
    if (input.status && VALID_TASK_STATUSES.includes(input.status) && input.status !== task.status) {
      task.status = input.status;
      task.completedAt = input.status === 'done' ? new Date().toISOString() : null;
      changes.push(`status→${input.status}`);
    }
    if (input.priority && VALID_PRIORITIES.includes(input.priority)) { task.priority = input.priority; changes.push(`priority→${input.priority}`); }
    if (input.deadline) { task.deadline = input.deadline; changes.push(`deadline→${input.deadline}`); }
    if (input.assigned_to) {
      const assignee = await resolveUser(input.assigned_to);
      if (!assignee) return { error: `Could not resolve team member "${input.assigned_to}"` };
      task.assignedTo = assignee.id;
      changes.push(`assignee→${assignee.displayName}`);
    }
    if (!changes.length) return { error: 'No valid changes supplied' };

    task.updatedAt = new Date().toISOString();
    await replaceItem('tasks', task.id, task);
    await logActivity(decoded.sub, 'ai_task_updated', `AI agent updated task "${task.title}" (${changes.join(', ')})`, task.id);
    return { success: true, actionSummary: `Updated task "${task.title}" (${changes.join(', ')})` };
  },

  async create_reminder(input, decoded) {
    requireManager(decoded);
    if (!input.title || !input.due_date) return { error: 'title and due_date are required' };
    const now = new Date().toISOString();
    const reminder = {
      id: `rem_${uuidv4()}`,
      title: sanitizeString(input.title, 200),
      description: sanitizeString(input.description || '', 1000),
      dueDate: input.due_date,
      userId: decoded.sub,
      priority: VALID_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
      status: 'active',
      recurring: null,
      linkedTo: null,
      createdAt: now,
      updatedAt: now,
      createdByAgent: true
    };
    await createItem('reminders', reminder);
    await logActivity(decoded.sub, 'ai_reminder_created', `AI agent set reminder "${reminder.title}" for ${reminder.dueDate}`, reminder.id);
    return { success: true, reminderId: reminder.id, actionSummary: `Reminder "${reminder.title}" set for ${reminder.dueDate}` };
  },

  async create_client(input, decoded) {
    requireManager(decoded);
    if (!input.company_name || !String(input.company_name).trim()) return { error: 'company_name is required' };
    const now = new Date().toISOString();
    const client = {
      id: `cli_${uuidv4()}`,
      companyName: sanitizeString(input.company_name, 200),
      contactName: sanitizeString(input.contact_name || '', 200),
      email: input.email ? sanitizeEmail(input.email) : '',
      phone: sanitizeString(input.phone || '', 30),
      industry: VALID_INDUSTRIES.includes(input.industry) ? input.industry : 'other',
      source: VALID_SOURCES.includes(input.source) ? input.source : 'other',
      status: 'lead',
      estimatedValue: parseFloat(input.estimated_value) || 0,
      notes: sanitizeString(input.notes || '', 2000),
      followUpDate: input.follow_up_date || null,
      assignedTo: decoded.sub,
      interactions: [],
      createdAt: now,
      updatedAt: now,
      createdByAgent: true
    };
    await createItem('clients', client);
    await logActivity(decoded.sub, 'ai_client_created', `AI agent added lead: ${client.companyName}`, client.id);
    return { success: true, clientId: client.id, actionSummary: `Added lead "${client.companyName}" to CRM` };
  },

  async update_client(input, decoded) {
    requireManager(decoded);
    const client = await resolveClient(input.client_id, input.name);
    if (!client) return { error: 'Client not found. Try list_clients with a search term.' };

    const changes = [];
    if (input.status && VALID_CLIENT_STATUSES.includes(input.status) && input.status !== client.status) {
      client.status = input.status;
      changes.push(`status→${input.status}`);
    }
    if (input.follow_up_date) { client.followUpDate = input.follow_up_date; changes.push(`follow-up→${input.follow_up_date}`); }
    if (input.estimated_value !== undefined && input.estimated_value !== null) {
      client.estimatedValue = parseFloat(input.estimated_value) || 0;
      changes.push(`value→R${Math.round(client.estimatedValue)}`);
    }
    if (input.add_note) {
      const stamp = new Date().toISOString().slice(0, 10);
      const note = `[${stamp}] ${sanitizeString(input.add_note, 400)}`;
      client.notes = client.notes ? `${client.notes}\n${note}` : note;
      changes.push('note added');
    }
    if (input.log_interaction && input.log_interaction.summary) {
      client.interactions = client.interactions || [];
      client.interactions.push({
        date: new Date().toISOString(),
        type: VALID_INTERACTION_TYPES.includes(input.log_interaction.type) ? input.log_interaction.type : 'other',
        summary: sanitizeString(input.log_interaction.summary, 500)
      });
      changes.push(`${input.log_interaction.type || 'interaction'} logged`);
    }
    if (!changes.length) return { error: 'No valid changes supplied' };

    client.updatedAt = new Date().toISOString();
    await replaceItem('clients', client.id, client);
    await logActivity(decoded.sub, 'ai_client_updated', `AI agent updated ${client.companyName} (${changes.join(', ')})`, client.id);
    return { success: true, actionSummary: `Updated ${client.companyName} (${changes.join(', ')})` };
  },

  async create_quote_draft(input, decoded) {
    requireManager(decoded);
    if (!input.title || !String(input.title).trim()) return { error: 'Quote title is required' };
    if (!Array.isArray(input.items) || !input.items.length) return { error: 'At least one line item is required' };

    const client = await resolveClient(input.client_id, input.client_name);
    if (!client) return { error: 'Client not found — create the client first with create_client, then retry.' };

    const existing = await queryItems('quotes', 'SELECT VALUE COUNT(1) FROM c');
    const num = (existing[0] || 0) + 1;

    const items = input.items.map(i => {
      const quantity = Math.max(0, parseFloat(i.quantity) || 1);
      const unitPrice = Math.max(0, parseFloat(i.unit_price) || 0);
      return {
        description: sanitizeString(i.description || '', 300),
        quantity,
        unitPrice,
        total: quantity * unitPrice
      };
    });

    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const vatRate = input.vat_rate !== undefined ? parseFloat(input.vat_rate) : 15;
    const vatAmount = subtotal * (vatRate / 100);

    const now = new Date().toISOString();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const quote = {
      id: `qte_${uuidv4()}`,
      quoteNumber: `QTE-${String(num).padStart(3, '0')}`,
      clientId: client.id,
      clientName: sanitizeString(client.companyName || '', 200),
      title: sanitizeString(input.title, 200),
      items,
      subtotal,
      vatRate,
      vatAmount,
      grandTotal: subtotal + vatAmount,
      validUntil: validUntil.toISOString(),
      status: 'draft',
      notes: sanitizeString(input.notes || '', 2000),
      createdBy: decoded.sub,
      createdAt: now,
      updatedAt: now,
      createdByAgent: true
    };

    await createItem('quotes', quote);
    await logActivity(decoded.sub, 'ai_quote_created', `AI agent drafted ${quote.quoteNumber} for ${quote.clientName}: R${Math.round(quote.grandTotal)}`, quote.id);
    return {
      success: true,
      quoteNumber: quote.quoteNumber,
      grandTotalZAR: Math.round(quote.grandTotal),
      actionSummary: `Drafted ${quote.quoteNumber} for ${quote.clientName} (R${Math.round(quote.grandTotal)})`
    };
  },

  async queue_email_for_approval(input, decoded) {
    requireManager(decoded);
    const to = sanitizeEmail(input.to);
    if (!to) return { error: 'A valid recipient email address is required' };
    if (!input.subject || !input.body) return { error: 'subject and body are required' };

    let provider = input.provider;
    if (!provider) provider = await getDefaultProvider();
    if (!provider) return { error: 'No email account is connected — connect one in Settings first' };

    const doc = await loadQueueDoc();
    const item = {
      id: uuidv4(),
      type: 'email_reply',
      source: 'ai_chat',
      priority: 2,
      flagType: ['lead', 'quote_request', 'urgent', 'follow_up', 'outreach'].includes(input.flag_type) ? input.flag_type : 'follow_up',
      status: 'pending',
      title: sanitizeString(input.subject, 200),
      reason: sanitizeString(input.reason || 'Drafted in chat', 80),
      to,
      subject: sanitizeString(input.subject, 200),
      body: String(input.body).slice(0, 6000),
      provider,
      createdAt: Date.now()
    };
    doc.queue = [...(doc.queue || []), item].slice(-300);
    doc.updatedAt = new Date().toISOString();
    doc.updatedBy = decoded.sub;
    await saveQueueDoc(doc);
    await logActivity(decoded.sub, 'ai_email_queued', `AI agent queued email to ${to}: "${item.subject}" (awaiting approval)`, item.id);
    return {
      success: true,
      queued: true,
      note: 'Email is waiting in the AI Agent page — it will only be sent after Frank reviews and approves it.',
      actionSummary: `Email to ${to} queued for your approval`
    };
  }
};

// ---------------------------------------------------------------------------
// Executor — always returns a JSON string for the tool_result block.
// ---------------------------------------------------------------------------

async function executeAgentTool(name, input, decoded) {
  try {
    const fn = HANDLERS[name];
    if (!fn) return JSON.stringify({ error: `Unknown tool: ${name}` });
    const result = await fn(input || {}, decoded);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err.message || 'Tool execution failed' });
  }
}

module.exports = { AGENT_TOOLS, executeAgentTool, AGENT_QUEUE_ID };
