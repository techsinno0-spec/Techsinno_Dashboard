const { getEmailConfig, gmailGet, gmailPost, msGet, msPost, zohoGet, zohoPost } = require('./email');

// Shared mail helpers for the AI agent:
//  - getMailSamples(provider): newest unread messages (subject/from/snippet)
//  - getConnectedEmailProviders(): which providers have usable credentials
//  - getDefaultProvider(): preferred provider for outbound mail
//  - sendPlainEmail(provider, {to, subject, body}): simple plaintext send
// Extracted from agent-scan.js so ai-chat tools and the morning briefing
// can reuse identical logic.

const ZOHO_AGENT_SCAN_LIMIT = 40;
const MAIL_PROVIDERS = ['zoho_mail', 'gmail', 'outlook'];

function zohoMessageTime(message) {
  const raw =
    message.receivedTime ||
    message.sentDateInGMT ||
    message.date ||
    message.receivedDateTime ||
    message.sentDateTime ||
    0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestZohoFirst(a, b) {
  return zohoMessageTime(b) - zohoMessageTime(a);
}

function extractAddressParts(value) {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(extractAddressParts);
  if (typeof value === 'object') {
    return [
      value.address,
      value.email,
      value.emailAddress,
      value.mail,
      value.name,
      value.displayName,
      value.fromAddress,
      value.toAddress
    ].flatMap(extractAddressParts);
  }
  return [];
}

function zohoAddressText(...values) {
  return values.flatMap(extractAddressParts).filter(Boolean).join(', ');
}

function findZohoInboxFolder(folders) {
  const list = Array.isArray(folders?.data) ? folders.data : [];
  return list.find(f => {
    const name = String(f.folderName || '').toLowerCase();
    const path = String(f.path || '').toLowerCase();
    const type = String(f.folderType || '').toLowerCase();
    return name === 'inbox' || path === 'inbox' || type === 'inbox';
  });
}

async function getZohoMailAccounts(cfg) {
  try {
    const data = await zohoGet(cfg, '/accounts');
    const accounts = Array.isArray(data.data) ? data.data.filter(a => a?.accountId) : [];
    if (accounts.length) return accounts;
  } catch {}

  if (Array.isArray(cfg.accounts) && cfg.accounts.some(a => a?.accountId)) {
    return cfg.accounts.filter(a => a?.accountId);
  }

  return [{ accountId: cfg.accountId, primaryEmailAddress: cfg.email }].filter(a => a.accountId);
}

async function fetchZohoAccountMessages(cfg, accountId) {
  let folderId = '';
  try {
    const folders = await zohoGet(cfg, `/accounts/${accountId}/folders`);
    folderId = findZohoInboxFolder(folders)?.folderId || '';
  } catch {}

  const sources = folderId
    ? [
        { path: `/accounts/${accountId}/folders/${folderId}/messages/view`, params: {} },
        { path: `/accounts/${accountId}/messages/view`, params: { folderId } }
      ]
    : [{ path: `/accounts/${accountId}/messages/view`, params: {} }];

  const messages = [];
  const seen = new Set();

  for (const source of sources) {
    try {
      const data = await zohoGet(cfg, source.path, { ...source.params, limit: ZOHO_AGENT_SCAN_LIMIT });
      (data.data || []).forEach(message => {
        const id = message.messageId || message.mailId || message.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        messages.push({ ...message, accountId, folderId: message.folderId || folderId });
      });
    } catch {}
  }

  return messages;
}

// Returns newest unread message samples for one provider.
// On any failure it returns { samples: [], error } instead of throwing,
// so callers can surface the error rather than silently getting nothing.
async function getMailSamplesWithError(provider, limit = 8) {
  try {
    if (provider === 'zoho_mail') {
      const cfg = await getEmailConfig('zoho_mail');
      if (!cfg?.accessToken || !cfg?.accountId) return { samples: [], error: null };
      const accounts = await getZohoMailAccounts(cfg);
      const allMessages = [];
      for (const account of accounts) {
        const accountMessages = await fetchZohoAccountMessages(cfg, account.accountId);
        allMessages.push(...accountMessages);
      }
      const samples = allMessages
        .sort(newestZohoFirst)
        .filter(m => !m.isRead)
        .slice(0, limit)
        .map(m => ({
          id: m.messageId || m.mailId || m.id,
          provider,
          accountId: m.accountId,
          folderId: m.folderId || '',
          subject: m.subject || '(no subject)',
          from: zohoAddressText(m.fromAddress, m.from),
          to: zohoAddressText(m.toAddress, m.to, m.recipientAddress, m.recipients),
          snippet: m.summary || ''
        }));
      return { samples, error: null };
    }
    if (provider === 'gmail') {
      const cfg = await getEmailConfig('gmail');
      if (!cfg?.accessToken && !cfg?.refreshToken) return { samples: [], error: null };
      const list = await gmailGet(cfg, '/messages', { maxResults: limit, q: 'is:unread -from:noreply -from:no-reply' });
      const msgs = await Promise.all((list.messages || []).slice(0, limit).map(m => {
        const params = new URLSearchParams();
        params.append('format', 'metadata');
        ['Subject', 'From', 'Date'].forEach(h => params.append('metadataHeaders', h));
        return gmailGet(cfg, `/messages/${m.id}`, params);
      }));
      const samples = msgs.map(m => {
        const h = {};
        (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
        return { id: m.id, provider, subject: h.Subject || '(no subject)', from: h.From || '', snippet: m.snippet || '' };
      });
      return { samples, error: null };
    }
    if (provider === 'outlook') {
      const cfg = await getEmailConfig('outlook');
      if (!cfg?.accessToken && !cfg?.refreshToken) return { samples: [], error: null };
      const data = await msGet(cfg, '/me/messages', { '$select': 'subject,from,bodyPreview,receivedDateTime,isRead', '$top': Math.max(12, limit), '$orderby': 'receivedDateTime desc' });
      const samples = (data.value || []).filter(m => !m.isRead).slice(0, limit).map(m => ({
        id: m.id, provider, subject: m.subject || '(no subject)', from: m.from?.emailAddress?.address || '', snippet: m.bodyPreview || ''
      }));
      return { samples, error: null };
    }
    return { samples: [], error: null };
  } catch (err) {
    return { samples: [], error: `${provider}: ${err.message || 'mail fetch failed'}` };
  }
}

// Backwards-compatible helper (same behaviour agent-scan.js used to have).
async function getMailSamples(provider, limit = 8) {
  const { samples } = await getMailSamplesWithError(provider, limit);
  return samples;
}

// Which providers have usable stored credentials right now.
async function getConnectedEmailProviders() {
  const connected = [];
  for (const provider of MAIL_PROVIDERS) {
    try {
      const cfg = await getEmailConfig(provider);
      if (!cfg) continue;
      if (cfg.reconnectRequired) continue;
      if (cfg.accessToken || cfg.refreshToken) connected.push(provider);
    } catch {}
  }
  return connected;
}

// Preferred outbound provider (order: Zoho Mail, Gmail, Outlook).
async function getDefaultProvider() {
  const connected = await getConnectedEmailProviders();
  return connected[0] || null;
}

// Simple plaintext send — mirrors email-send.js without attachments.
async function sendPlainEmail(provider, { to, subject, body, from }) {
  if (!to || !subject) throw new Error('Recipient and subject are required');

  if (provider === 'gmail') {
    const cfg = await getEmailConfig('gmail');
    if (!cfg?.accessToken && !cfg?.refreshToken) throw new Error('Gmail not connected');
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body || ''}`).toString('base64url');
    await gmailPost(cfg, '/messages/send', { raw });
    return { provider, to };
  }

  if (provider === 'outlook') {
    const cfg = await getEmailConfig('outlook');
    if (!cfg?.accessToken && !cfg?.refreshToken) throw new Error('Outlook not connected');
    const message = {
      subject,
      body: { contentType: 'Text', content: body || '' },
      toRecipients: [{ emailAddress: { address: to } }]
    };
    await msPost(cfg, '/me/sendMail', { message });
    return { provider, to };
  }

  if (provider === 'zoho_mail') {
    const cfg = await getEmailConfig('zoho_mail');
    if (!cfg?.accessToken || !cfg?.accountId) throw new Error('Zoho Mail not connected');
    const aliases = cfg.aliases || [];
    const defaultAlias = aliases.find(a => a.isDefault) || aliases[0];
    const fromAddress = from || defaultAlias?.address || cfg.email;
    if (!fromAddress) throw new Error('Zoho Mail sender address unknown');
    await zohoPost(cfg, `/accounts/${cfg.accountId}/messages`, {
      fromAddress,
      toAddress: to,
      subject,
      content: body || '',
      mailFormat: 'plaintext'
    });
    return { provider, to };
  }

  throw new Error(`Unknown email provider: ${provider}`);
}

module.exports = {
  MAIL_PROVIDERS,
  getMailSamples,
  getMailSamplesWithError,
  getConnectedEmailProviders,
  getDefaultProvider,
  sendPlainEmail
};
