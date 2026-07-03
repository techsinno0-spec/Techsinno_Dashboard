const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, zohoGet } = require('../../shared/email');

function decodeQuotedPrintable(input) {
  const text = String(input || '');
  if (!/(=[0-9A-F]{2}|=\r?\n)/i.test(text)) return text;

  const clean = text.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '=' && /^[0-9A-F]{2}$/i.test(clean.slice(i + 1, i + 3))) {
      bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = clean.charCodeAt(i);
      if (code <= 0xff) bytes.push(code);
      else bytes.push(...Buffer.from(clean[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeHtmlEntities(input) {
  const named = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-',
    hellip: '...', bull: '•'
  };
  return String(input || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    const c = code.toLowerCase();
    if (c[0] === '#') {
      const n = c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(named, c) ? named[c] : m;
  });
}

function normalizeEmailText(input) {
  return decodeHtmlEntities(decodeQuotedPrintable(input))
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasRealHtml(input) {
  const html = String(input || '');
  if (!html.trim()) return false;
  return /<!doctype|<html[\s>]|<body[\s>]|<head[\s>]|<table[\s>]|<div[\s>]|<p[\s>]|<br\s*\/?>|<span[\s>]|<a[\s>]|<img[\s>]|<strong[\s>]|<b[\s>]|<ul[\s>]|<ol[\s>]|<li[\s>]/i.test(html);
}

function htmlToText(html) {
  return normalizeEmailText(String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n---\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|tr|table|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function sanitizeEmailHtml(html) {
  let safe = decodeQuotedPrintable(html);
  if (!safe.trim()) return '';

  safe = safe
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<(meta|base|link|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s+(href|src)\s*=\s*'javascript:[^']*'/gi, " $1='#'")
    .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]*/gi, ' $1="#"');

  return safe.trim();
}

function buildEmailBody({ html = '', text = '' }) {
  const bodyHtml = hasRealHtml(html) ? sanitizeEmailHtml(html) : '';
  const textBody = text ? normalizeEmailText(text) : '';
  const htmlBody = html ? htmlToText(html) : '';
  const bodyText = htmlBody.length > textBody.length * 1.4 ? htmlBody : (textBody || htmlBody);
  return {
    body: bodyText || '(no content)',
    bodyHtml
  };
}

function decodeGmailPart(part) {
  return part?.body?.data ? Buffer.from(part.body.data, 'base64url').toString('utf8') : '';
}

function extractGmailBodies(payload) {
  const found = { html: [], text: [] };
  function walk(part) {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    if (mime === 'text/html') {
      const body = decodeGmailPart(part);
      if (body.trim()) found.html.push(body);
    }
    if (mime === 'text/plain') {
      const body = decodeGmailPart(part);
      if (body.trim()) found.text.push(body);
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (!found.html.length && !found.text.length && payload?.body?.data) found.text.push(decodeGmailPart(payload));

  const longest = list => list.sort((a, b) => b.length - a.length)[0] || '';
  return { html: longest(found.html), text: longest(found.text) };
}

function gmailFilenameFromHeaders(headers = []) {
  const text = headers.map(h => `${h.name || ''}: ${h.value || ''}`).join('\n');
  const utf = text.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf) return decodeURIComponent(utf[1].replace(/"/g, ''));
  const plain = text.match(/filename="?([^";\n]+)"?/i);
  return plain ? plain[1] : '';
}

function flattenZohoAttachments(raw, folderId) {
  const candidates = [
    raw?.attachments,
    raw?.attachment,
    raw?.data?.attachments,
    raw?.data?.attachment,
    raw?.data
  ];
  const list = candidates.find(Array.isArray) || [];
  return list
    .map(a => ({
      id: a.attachmentId || a.attachId || a.storeName || a.id,
      name: a.attachmentName || a.fileName || a.name || a.file_name || 'attachment',
      mimeType: a.contentType || a.mimeType || a.type || 'application/octet-stream',
      size: a.attachmentSize || a.fileSize || a.size || 0,
      folderId
    }))
    .filter(a => a.id);
}

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

        function collectAttachments(payload, list) {
          if (payload?.body?.attachmentId) {
            const name = payload.filename || gmailFilenameFromHeaders(payload.headers) || 'attachment';
            list.push({ id: payload.body.attachmentId, name, mimeType: payload.mimeType, size: payload.body.size || 0 });
          }
          if (payload?.parts) payload.parts.forEach(p => collectAttachments(p, list));
          return list;
        }

        return jsonResponse({
          success: true,
          subject: headers['Subject'] || '(no subject)',
          from: headers['From'] || '',
          to: headers['To'] || '',
          date: headers['Date'] || '',
          ...buildEmailBody(extractGmailBodies(data.payload)),
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
        const isHtml = (data.body?.contentType || '').toLowerCase() === 'html';

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
          ...buildEmailBody({ html: isHtml ? raw : '', text: isHtml ? '' : raw }),
          attachments
        });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');
        const url = new URL(request.url);
        let folderId = url.searchParams.get('folderId') || '';

        let data;
        try {
          data = folderId
            ? await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}/content`)
            : await zohoGet(cfg, `/accounts/${cfg.accountId}/messages/${messageId}/content`);
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
        const rawContent = msg.content || msg.body || '';
        const looksHtml = hasRealHtml(rawContent);

        let attachments = flattenZohoAttachments(msg, folderId);
        if (!attachments.length) {
          try {
            if (!folderId) {
              const folders = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders`);
              const inbox = (folders.data || []).find(f => f.folderName === 'Inbox' || f.path === 'Inbox');
              if (inbox) folderId = inbox.folderId;
            }
            if (folderId) {
              const msgMeta = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}`);
              const metaAttachments = flattenZohoAttachments(msgMeta, folderId);
              if (metaAttachments.length) {
                attachments = metaAttachments;
              } else if (msgMeta?.data?.hasAttachment || msgMeta?.data?.attachmentCount || msgMeta?.data?.attachments?.length) {
                const attRes = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}/attachments`);
                attachments = flattenZohoAttachments(attRes, folderId);
              } else {
                try {
                  const attRes = await zohoGet(cfg, `/accounts/${cfg.accountId}/folders/${folderId}/messages/${messageId}/attachments`);
                  attachments = flattenZohoAttachments(attRes, folderId);
                } catch {}
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
          ...buildEmailBody({ html: looksHtml ? rawContent : '', text: looksHtml ? '' : rawContent }),
          attachments
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
});
