const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

const ZOHO_ALIAS_RECIPIENTS = [
  'frank@techsinno.com',
  'info@techsinno.com',
  'sales@techsinno.com'
];
const GMAIL_MESSAGE_LIMIT = 50;
const GMAIL_SCAN_LIMIT = 200;
const OUTLOOK_MESSAGE_LIMIT = 50;
const ZOHO_PAGE_SIZE = 50;
const ZOHO_ALL_SCAN_LIMIT = 250;
const ZOHO_ALIAS_SCAN_LIMIT = 500;

function mailJsonResponse(body, status = 200) {
  const response = jsonResponse(body, status);
  response.headers = {
    ...response.headers,
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  };
  return response;
}

function upstreamMailError(err) {
  const data = err?.response?.data;
  const nested = data?.error;
  let message = '';

  if (nested && typeof nested === 'object') {
    message = nested.message || nested.status || nested.code || '';
  } else if (typeof nested === 'string') {
    message = nested;
  }

  message = message ||
    data?.error_description ||
    data?.message ||
    (typeof data === 'string' ? data : '') ||
    err?.message ||
    'Failed to load mail';

  return err?.response?.status ? `${message} (${err.response.status})` : message;
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...await Promise.all(chunk.map(mapper)));
  }
  return results;
}

async function gmailListMessagesSafely(cfg, wantedLabel) {
  try {
    return {
      listRes: await gmailGet(cfg, '/messages', { maxResults: GMAIL_SCAN_LIMIT, labelIds: wantedLabel }),
      scoped: true
    };
  } catch (err) {
    return {
      listRes: await gmailGet(cfg, '/messages', { maxResults: GMAIL_SCAN_LIMIT }),
      scoped: false,
      fallbackReason: upstreamMailError(err)
    };
  }
}

// Detect a real file attachment in a Gmail metadata payload (parts carry a filename)
function gmailHasAttachment(payload) {
  const walk = (part) => {
    if (!part) return false;
    if (part.filename && part.filename.trim() && (part.body?.attachmentId || part.body?.size)) return true;
    return (part.parts || []).some(walk);
  };
  return !!payload && (payload.parts || []).some(walk);
}

function zohoRecipientText(message) {
  return [
    message.toAddress,
    message.ccAddress,
    message.bccAddress,
    message.recipientAddress
  ].filter(Boolean).join(' ').toLowerCase();
}

function newestMessageTime(message) {
  const raw =
    message.receivedTime ||
    message.sentDateInGMT ||
    message.date ||
    message.receivedDateTime ||
    message.sentDateTime ||
    message.internalDate ||
    0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(a, b) {
  return newestMessageTime(b) - newestMessageTime(a);
}

function findMailFolder(folders, folder) {
  const list = Array.isArray(folders?.data) ? folders.data : [];
  const wanted = folder === 'sent' ? ['sent', 'sent items', 'sent mail'] : ['inbox'];
  return list.find(f => {
    const name = String(f.folderName || '').toLowerCase();
    const path = String(f.path || '').toLowerCase();
    const type = String(f.folderType || '').toLowerCase();
    return wanted.includes(name) || wanted.includes(path) || wanted.includes(type);
  });
}

function zohoAccountRecipientText(account) {
  const aliases = Array.isArray(account?.sendMailDetails) ? account.sendMailDetails : [];
  return [
    account?.primaryEmailAddress,
    account?.emailAddress,
    account?.accountDisplayName,
    ...aliases.map(a => a.fromAddress)
  ].filter(Boolean).join(' ').toLowerCase();
}

async function getZohoMailAccounts(cfg) {
  try {
    const data = await zohoGet(cfg, '/accounts');
    const accounts = Array.isArray(data.data) ? data.data.filter(a => a?.accountId) : [];
    if (accounts.length) return accounts;
  } catch {}

  return [{
    accountId: cfg.accountId,
    primaryEmailAddress: cfg.email,
    sendMailDetails: Array.isArray(cfg.aliases)
      ? cfg.aliases.map(a => ({ fromAddress: a.address, displayName: a.name }))
      : []
  }].filter(a => a.accountId);
}

async function fetchZohoMessageSource(cfg, path, baseParams, folderId, maxToScan) {
  const messages = [];
  const seen = new Set();

  for (let page = 0; page < Math.ceil(maxToScan / ZOHO_PAGE_SIZE); page++) {
    const params = {
      ...baseParams,
      limit: ZOHO_PAGE_SIZE
    };
    if (page > 0) params.start = page * ZOHO_PAGE_SIZE + 1;

    let data;
    try {
      data = await zohoGet(cfg, path, params);
    } catch (err) {
      if (messages.length) break;
      throw err;
    }
    const pageMessages = Array.isArray(data.data) ? data.data : [];
    if (!pageMessages.length) break;

    const before = seen.size;
    pageMessages.forEach(message => {
      const id = message.messageId || message.mailId || message.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      messages.push({ ...message, folderId: message.folderId || folderId });
    });

    if (pageMessages.length < ZOHO_PAGE_SIZE) break;
    if (seen.size === before) break;
  }

  return messages;
}

async function fetchZohoMessages(cfg, accountId, folderId, maxToScan) {
  const sources = folderId
    ? [
        { path: `/accounts/${accountId}/folders/${folderId}/messages/view`, params: {} },
        { path: `/accounts/${accountId}/messages/view`, params: { folderId } }
      ]
    : [{ path: `/accounts/${accountId}/messages/view`, params: {} }];

  const messages = [];
  const seen = new Set();
  let sourceError = null;

  for (const source of sources) {
    try {
      const sourceMessages = await fetchZohoMessageSource(cfg, source.path, source.params, folderId, maxToScan);
      sourceMessages.forEach(message => {
        const id = message.messageId || message.mailId || message.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        messages.push(message);
      });
    } catch (err) {
      sourceError = sourceError || err;
    }
  }

  if (!messages.length && sourceError) throw sourceError;
  return messages.sort(newestFirst).slice(0, maxToScan);
}

app.http('email-inbox', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/inbox/{provider}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const provider = request.params.provider;
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder') || 'inbox';
    const recipient = (url.searchParams.get('recipient') || '').trim().toLowerCase();

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        if (!cfg?.accessToken) return badRequest('Gmail not connected');

        const wantedLabel = folder === 'sent' ? 'SENT' : 'INBOX';
        const [profile, listResult] = await Promise.all([
          gmailGet(cfg, '/profile').catch(() => null),
          gmailListMessagesSafely(cfg, wantedLabel)
        ]);

        const listRes = listResult.listRes || {};
        const msgIds = (listRes.messages || []).slice(0, GMAIL_SCAN_LIMIT);
        const msgs = (await mapLimit(msgIds, 10, async m => {
          try {
            return await gmailGet(cfg, `/messages/${m.id}`, { format: 'metadata' });
          } catch {
            return null;
          }
        })).filter(Boolean);
        const sorted = msgs
          .filter(m => (m.labelIds || []).includes(wantedLabel))
          .sort(newestFirst)
          .slice(0, GMAIL_MESSAGE_LIMIT);

        return mailJsonResponse({
          success: true,
          email: profile?.emailAddress || cfg.email,
          scannedCount: msgs.length,
          scanMode: listResult.scoped ? 'label' : 'fallback',
          warning: listResult.fallbackReason ? `Gmail folder-scoped scan failed; loaded fallback recent mail: ${listResult.fallbackReason}` : undefined,
          unreadCount: folder === 'inbox' ? sorted.filter(m => (m.labelIds || []).includes('UNREAD')).length : 0,
          messages: sorted.map(m => {
            const h = {};
            (m.payload?.headers || []).forEach(x => { h[x.name] = x.value; });
            return { id: m.id, subject: h.Subject || '(no subject)', from: h.From || '', to: h.To || '', date: h.Date || '', unread: (m.labelIds || []).includes('UNREAD'), hasAttachment: gmailHasAttachment(m.payload) };
          })
        });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        if (folder === 'sent') {
          const msgs = await msGet(cfg, '/me/mailFolders/SentItems/messages', {
            '$select': 'subject,toRecipients,from,sentDateTime,hasAttachments', '$top': OUTLOOK_MESSAGE_LIMIT, '$orderby': 'sentDateTime desc'
          });
          return mailJsonResponse({
            success: true,
            email: cfg.email,
            messages: (msgs.value || []).map(m => ({
              id: m.id, subject: m.subject || '(no subject)',
              to: (m.toRecipients || []).map(r => r.emailAddress?.address || '').join(', '),
              from: m.from?.emailAddress?.address || '', date: m.sentDateTime,
              hasAttachment: !!m.hasAttachments
            }))
          });
        }

        const [msFolder, msgs] = await Promise.all([
          msGet(cfg, '/me/mailFolders/Inbox'),
          msGet(cfg, '/me/mailFolders/Inbox/messages', { '$select': 'subject,from,receivedDateTime,isRead,hasAttachments', '$top': OUTLOOK_MESSAGE_LIMIT, '$orderby': 'receivedDateTime desc' })
        ]);
        const sorted = (msgs.value || []).sort(newestFirst);
        return mailJsonResponse({
          success: true,
          email: cfg.email,
          unreadCount: msFolder.unreadItemCount || 0,
          messages: sorted.map(m => ({
            id: m.id, subject: m.subject || '(no subject)',
            from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
            date: m.receivedDateTime, unread: !m.isRead,
            hasAttachment: !!m.hasAttachments
          }))
        });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');
        const recipientFilter = ZOHO_ALIAS_RECIPIENTS.includes(recipient) ? recipient : '';

        const scanLimit = recipientFilter ? ZOHO_ALIAS_SCAN_LIMIT : ZOHO_ALL_SCAN_LIMIT;
        const accounts = await getZohoMailAccounts(cfg);
        const targetAccounts = recipientFilter
          ? accounts.filter(a => zohoAccountRecipientText(a).includes(recipientFilter))
          : accounts;
        const accountsToScan = targetAccounts.length ? targetAccounts : accounts;
        const perAccountLimit = Math.max(ZOHO_PAGE_SIZE, Math.ceil(scanLimit / Math.max(1, accountsToScan.length)));
        const allMsgs = [];
        let accountError = null;

        for (const account of accountsToScan) {
          let folderId;
          try {
            const folders = await zohoGet(cfg, `/accounts/${account.accountId}/folders`);
            const target = findMailFolder(folders, folder);
            if (target) folderId = target.folderId;
          } catch {}

          if (folder === 'sent' && !folderId) continue;

          try {
            const accountMsgs = await fetchZohoMessages(cfg, account.accountId, folderId, perAccountLimit);
            accountMsgs.forEach(m => allMsgs.push({ ...m, accountId: account.accountId, folderId: m.folderId || folderId || '' }));
          } catch (err) {
            accountError = accountError || err;
          }
        }

        if (!allMsgs.length && accountError) throw accountError;
        allMsgs.sort(newestFirst);
        const msgs = recipientFilter
          ? allMsgs.filter(m => {
              const recipientText = zohoRecipientText(m);
              return !recipientText || recipientText.includes(recipientFilter);
            })
          : allMsgs;

        return mailJsonResponse({
          success: true,
          email: cfg.email,
          recipient: recipientFilter,
          scannedCount: allMsgs.length,
          unreadCount: folder === 'inbox' ? msgs.filter(m => !m.isRead).length : 0,
          messages: msgs.slice(0, recipientFilter ? 80 : 60).map(m => ({
            id: m.messageId, subject: m.subject || '(no subject)',
            from: m.fromAddress || '', to: m.toAddress || '',
            date: m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : '',
            unread: !m.isRead,
            folderId: m.folderId || '',
            accountId: m.accountId || cfg.accountId || '',
            hasAttachment: !!(m.hasAttachment || m.attachmentCount || m.attachments?.length)
          }))
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      const labels = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' };
      return mailJsonResponse({ error: `${labels[provider] || 'Mail'}: ${upstreamMailError(err)}` }, 500);
    }
  }
});
