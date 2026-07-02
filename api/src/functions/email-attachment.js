const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, gmailGet, msGet, ensureZohoToken, getZohoRegion } = require('../../shared/email');
const axios = require('axios');

function findGmailAttachmentMeta(payload, attachmentId) {
  if (!payload) return null;
  if (payload.body?.attachmentId === attachmentId) {
    return {
      name: payload.filename || 'attachment',
      contentType: payload.mimeType || 'application/octet-stream'
    };
  }
  for (const part of (payload.parts || [])) {
    const found = findGmailAttachmentMeta(part, attachmentId);
    if (found) return found;
  }
  return null;
}

function filenameFromDisposition(disposition) {
  const text = String(disposition || '');
  const utf = text.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1].replace(/"/g, ''));
  const plain = text.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : '';
}

app.http('email-attachment', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/attachment/{provider}/{messageId}/{attachmentId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const { provider, messageId, attachmentId } = request.params;
    const url = new URL(request.url);
    const folderId = url.searchParams.get('folderId');

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        if (!cfg?.accessToken) return badRequest('Gmail not connected');

        const [data, message] = await Promise.all([
          gmailGet(cfg, `/messages/${messageId}/attachments/${attachmentId}`),
          gmailGet(cfg, `/messages/${messageId}`, { format: 'full' }).catch(() => null)
        ]);
        const meta = findGmailAttachmentMeta(message?.payload, attachmentId) || {};
        return jsonResponse({ success: true, data: data.data, name: meta.name, contentType: meta.contentType });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        const data = await msGet(cfg, `/me/messages/${messageId}/attachments/${attachmentId}`);
        return jsonResponse({ success: true, data: data.contentBytes, name: data.name, contentType: data.contentType });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');

        const token = await ensureZohoToken(cfg);
        const region = getZohoRegion(cfg.region || 'com');
        const baseUrl = `${region.mail}/api/accounts/${cfg.accountId}`;
        const attUrl = folderId
          ? `${baseUrl}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`
          : `${baseUrl}/messages/${messageId}/attachments/${attachmentId}`;

        const res = await axios.get(attUrl, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
          responseType: 'arraybuffer'
        });
        return jsonResponse({
          success: true,
          data: Buffer.from(res.data).toString('base64'),
          name: filenameFromDisposition(res.headers['content-disposition']),
          contentType: res.headers['content-type'] || 'application/octet-stream'
        });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
});
