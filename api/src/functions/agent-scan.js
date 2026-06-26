const { app } = require('@azure/functions');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
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
      const existing = new Set((queueDoc.queue || []).map(i => i.emailId || i.url).filter(Boolean));

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
