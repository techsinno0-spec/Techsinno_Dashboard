const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

app.http('email-message', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/message/{provider}/{messageId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const { provider, messageId } = request.params;

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        if (!cfg?.accessToken) return badRequest('Gmail not connected');

        const data = await gmailGet(cfg, `/messages/${messageId}`, { format: 'full' });
        const headers = {};
        (data.payload.headers || []).forEach(h => { headers[h.name] = h.value; });

        function decodeBody(payload) {
          if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
          if (payload.parts) {
            const plain = payload.parts.find(p => p.mimeType === 'text/plain');
            const html = payload.parts.find(p => p.mimeType === 'text/html');
            const part = plain || html;
            if (part?.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf-8');
            for (const p of payload.parts) { const b = decodeBody(p); if (b) return b; }
          }
          return '';
        }

        function collectAttachments(payload, list) {
          if (payload.filename?.length > 0 && payload.body?.attachmentId) {
            list.push({ id: payload.body.attachmentId, name: payload.filename, mimeType: payload.mimeType, size: payload.body.size || 0 });
          }
          if (payload.parts) payload.parts.forEach(p => collectAttachments(p, list));
          if (payload.filename?.length > 0 && payload.body?.size > 0 && !payload.body?.attachmentId && payload.body?.data) {
            list.push({ id: '__inline_' + list.length, name: payload.filename, mimeType: payload.mimeType, size: payload.body.size || 0, inline: true });
          }
          return list;
        }

        return jsonResponse({
          success: true,
          subject: headers['Subject'] || '(no subject)',
          from: headers['From'] || '',
          to: headers['To'] || '',
          date: headers['Date'] || '',
          body: decodeBody(data.payload),
          attachments: collectAttachments(data.payload, [])
        });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        const data = await msGet(cfg, `/me/messages/${messageId}`, {
          '$select': 'subject,from,toRecipients,receivedDateTime,body,hasAttachments'
        });
        const raw = data.body?.content || '';
        const body = data.body?.contentType === 'html'
          ? raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          : raw;

        let attachments = [];
        if (data.hasAttachments) {
          try {
            const attRes = await msGet(cfg, `/me/messages/${messageId}/attachments`);
            attachments = (attRes.value || [])
              .filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment')
              .map(a => ({ id: a.id, name: a.name, mimeType: a.contentType, size: a.size || 0 }));
          } catch {}
        }

        return jsonResponse({
          success: true,
          subject: data.subject || '(no subject)',
          from: data.from?.emailAddress?.name || data.from?.emailAddress?.address || '',
          to: (data.toRecipients || []).map(r => r.emailAddress?.address).join(', '),
          date: data.receivedDateTime,
          body, attachments
        });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');

        let data, folderId;
        try {
          data = await zohoGet(cfg, `/accounts/${cfg.accountId}/messages/${messageId}/content`);
        } catch (e1) {
          let found = false;
          try {
            const folders = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders`);
            const tryFolders = (folders.data || []).filter(f =>
              f.folderName === 'Inbox' || f.path === 'Inbox' ||
              ['Sent', 'Sent Items', 'Sent Mail'].includes(f.folderName) || f.folderType === 'sent'
            );
            for (const f of tryFolders) {
              try {
                data = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${f.folderId}/messages/${messageId}/content`);
                folderId = f.folderId;
                found = true;
                break;
              } catch {}
            }
          } catch {}
          if (!found) throw e1;
        }

        const msg = data.data || {};
        const body = (msg.content || '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        let attachments = [];
        if (msg.attachments?.length > 0) {
          attachments = msg.attachments.map(a => ({
            id: a.attachmentId || a.attachId || a.storeName,
            name: a.attachmentName || a.fileName || a.name,
            mimeType: a.contentType || 'application/octet-stream',
            size: a.attachmentSize || a.fileSize || a.size || 0,
            folderId
          }));
        } else {
          try {
            if (!folderId) {
              const folders = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders`);
              const inbox = (folders.data || []).find(f => f.folderName === 'Inbox' || f.path === 'Inbox');
              if (inbox) folderId = inbox.folderId;
            }
            if (folderId) {
              const msgMeta = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}`);
              if (msgMeta?.data?.hasAttachment) {
                const attRes = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}/attachments`);
                const attList = attRes?.data?.attachments || attRes?.data || [];
                attachments = (Array.isArray(attList) ? attList : []).map(a => ({
                  id: a.attachmentId || a.attachId || a.storeName,
                  name: a.attachmentName || a.fileName || a.name,
                  mimeType: a.contentType || 'application/octet-stream',
                  size: a.attachmentSize || a.fileSize || a.size || 0,
                  folderId
                }));
              }
            }
          } catch {}
        }

        return jsonResponse({
          success: true,
          subject: msg.subject || '(no subject)',
          from: msg.fromAddress || msg.from || '',
          to: msg.toAddress || '',
          date: msg.receivedTime ? new Date(parseInt(msg.receivedTime)).toISOString() : '',
          body, attachments
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
});
