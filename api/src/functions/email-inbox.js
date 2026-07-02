const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

const ZOHO_ALIAS_RECIPIENTS = [
  'frank@techsinno.com',
  'info@techsinno.com',
  'sales@techsinno.com'
];
const ZOHO_PAGE_SIZE = 50;
const ZOHO_ALL_SCAN_LIMIT = 100;
const ZOHO_ALIAS_SCAN_LIMIT = 300;

function zohoRecipientText(message) {
  return [
    message.toAddress,
    message.ccAddress,
    message.bccAddress,
    message.recipientAddress
  ].filter(Boolean).join(' ').toLowerCase();
}

async function fetchZohoMessages(cfg, accountId, folderId, maxToScan) {
  const messages = [];
  const seen = new Set();
  let start = 1;

  for (let page = 0; page < Math.ceil(maxToScan / ZOHO_PAGE_SIZE); page++) {
    const params = { limit: ZOHO_PAGE_SIZE };
    if (folderId) params.folderId = folderId;
    if (page > 0) params.start = start;

    const data = await zohoGet(cfg, `/accounts/${accountId}/messages/view`, params);
    const pageMessages = Array.isArray(data.data) ? data.data : [];
    if (!pageMessages.length) break;

    const before = seen.size;
    pageMessages.forEach(message => {
      const id = message.messageId || message.mailId || message.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      messages.push(message);
    });

    if (pageMessages.length < ZOHO_PAGE_SIZE) break;
    if (seen.size === before) break;

    start += ZOHO_PAGE_SIZE;
  }

  return messages.slice(0, maxToScan);
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

        const q = folder === 'sent' ? 'in:sent' : 'is:inbox';
        const [profile, listRes] = await Promise.all([
          folder === 'inbox' ? gmailGet(cfg, '/profile') : Promise.resolve(null),
          gmailGet(cfg, '/messages', { q, maxResults: 15 })
        ]);

        const msgIds = (listRes.messages || []).slice(0, 12);
        const msgs = await Promise.all(msgIds.map(m => {
          const params = new URLSearchParams();
          params.append('format', 'metadata');
          ['Subject', 'From', 'To', 'Date'].forEach(h => params.append('metadataHeaders', h));
          return gmailGet(cfg, `/messages/${m.id}`, params);
        }));

        return jsonResponse({
          success: true,
          email: profile?.emailAddress || cfg.email,
          unreadCount: folder === 'inbox' ? msgs.filter(m => (m.labelIds || []).includes('UNREAD')).length : 0,
          messages: msgs.map(m => {
            const h = {};
            (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
            return { id: m.id, subject: h.Subject || '(no subject)', from: h.From || '', to: h.To || '', date: h.Date || '', unread: (m.labelIds || []).includes('UNREAD') };
          })
        });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        if (folder === 'sent') {
          const msgs = await msGet(cfg, '/me/mailFolders/SentItems/messages', {
            '$select': 'subject,toRecipients,from,sentDateTime', '$top': 15, '$orderby': 'sentDateTime desc'
          });
          return jsonResponse({
            success: true,
            email: cfg.email,
            messages: (msgs.value || []).map(m => ({
              id: m.id, subject: m.subject || '(no subject)',
              to: (m.toRecipients || []).map(r => r.emailAddress?.address || '').join(', '),
              from: m.from?.emailAddress?.address || '', date: m.sentDateTime
            }))
          });
        }

        const [msFolder, msgs] = await Promise.all([
          msGet(cfg, '/me/mailFolders/Inbox'),
          msGet(cfg, '/me/messages', { '$select': 'subject,from,receivedDateTime,isRead', '$top': 15, '$orderby': 'receivedDateTime desc' })
        ]);
        return jsonResponse({
          success: true,
          email: cfg.email,
          unreadCount: msFolder.unreadItemCount || 0,
          messages: (msgs.value || []).map(m => ({
            id: m.id, subject: m.subject || '(no subject)',
            from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
            date: m.receivedDateTime, unread: !m.isRead
          }))
        });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');
        const recipientFilter = ZOHO_ALIAS_RECIPIENTS.includes(recipient) ? recipient : '';

        let folderId;
        try {
          const folders = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders`);
          const target = folder === 'sent'
            ? (folders.data || []).find(f => ['Sent', 'Sent Items', 'Sent Mail'].includes(f.folderName) || f.folderType === 'sent')
            : (folders.data || []).find(f => f.folderName === 'Inbox' || f.path === 'Inbox');
          if (target) folderId = target.folderId;
        } catch {}

        if (folder === 'sent' && !folderId) return jsonResponse({ success: true, messages: [] });

        const scanLimit = recipientFilter ? ZOHO_ALIAS_SCAN_LIMIT : ZOHO_ALL_SCAN_LIMIT;
        const allMsgs = await fetchZohoMessages(cfg, cfg.accountId, folderId, scanLimit);
        const msgs = recipientFilter
          ? allMsgs.filter(m => zohoRecipientText(m).includes(recipientFilter))
          : allMsgs;

        return jsonResponse({
          success: true,
          email: cfg.email,
          recipient: recipientFilter,
          scannedCount: allMsgs.length,
          unreadCount: folder === 'inbox' ? msgs.filter(m => !m.isRead).length : 0,
          messages: msgs.slice(0, recipientFilter ? 80 : 60).map(m => ({
            id: m.messageId, subject: m.subject || '(no subject)',
            from: m.fromAddress || '', to: m.toAddress || '',
            date: m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : '',
            unread: !m.isRead
          }))
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
});
