const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { getEmailConfig, gmailPost, msPost, zohoPost, ensureZohoToken, getZohoRegion } = require('../../shared/email');
const axios = require('axios');

app.http('email-send', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'email/send/{provider}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const provider = request.params.provider;
    const body = await request.json();
    const { to, subject, body: emailBody, from, attachments } = body;

    if (!to || !subject) return badRequest('Recipient and subject are required');

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        if (!cfg?.accessToken) return badRequest('Gmail not connected');

        let raw;
        if (attachments?.length > 0) {
          const boundary = 'boundary_' + Date.now();
          let mime = `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
          mime += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${emailBody || ''}\r\n`;
          for (const att of attachments) {
            const b64 = att.base64.replace(/\r?\n/g, '');
            const wrapped = b64.match(/.{1,76}/g).join('\r\n');
            mime += `--${boundary}\r\nContent-Type: ${att.mimeType}; name="${att.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${att.name}"\r\n\r\n${wrapped}\r\n`;
          }
          mime += `--${boundary}--`;
          raw = Buffer.from(mime).toString('base64url');
        } else {
          raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${emailBody || ''}`).toString('base64url');
        }

        await gmailPost(cfg, '/messages/send', { raw });
        await logActivity(decoded.sub, 'email_send', `Sent email via Gmail to ${to}: "${subject}"`);
        return jsonResponse({ success: true });
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        if (!cfg?.accessToken) return badRequest('Outlook not connected');

        const message = {
          subject,
          body: { contentType: 'Text', content: emailBody || '' },
          toRecipients: [{ emailAddress: { address: to } }]
        };
        if (attachments?.length > 0) {
          message.attachments = attachments.map(a => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.name, contentBytes: a.base64, contentType: a.mimeType
          }));
        }

        await msPost(cfg, '/me/sendMail', { message });
        await logActivity(decoded.sub, 'email_send', `Sent email via Outlook to ${to}: "${subject}"`);
        return jsonResponse({ success: true });
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        if (!cfg?.accessToken || !cfg?.accountId) return badRequest('Zoho Mail not connected');

        const aliases = cfg.aliases || [];
        const defaultAlias = aliases.find(a => a.isDefault) || aliases[0];
        const fromAddress = from || defaultAlias?.address || cfg.email || 'user@zoho.com';

        const payload = { fromAddress, toAddress: to, subject, content: emailBody || '', mailFormat: 'plaintext' };

        if (attachments?.length > 0) {
          const uploadedAtts = [];
          const token = await ensureZohoToken(cfg);
          const region = getZohoRegion(cfg.region || 'com');

          for (const att of attachments) {
            try {
              const buf = Buffer.from(att.base64, 'base64');
              const FormData = require('form-data');
              const form = new FormData();
              form.append('attach', buf, { filename: att.name, contentType: att.mimeType });
              const upRes = await axios.post(
                `${region.mail}/api/accounts/${cfg.accountId}/messages/attachments?uploadType=multipart`,
                form, { headers: { ...form.getHeaders(), Authorization: `Zoho-oauthtoken ${token}` } }
              );
              const upData = upRes.data?.data || upRes.data;
              const storeName = upData?.storeName || (Array.isArray(upData) ? upData[0]?.storeName : null);
              if (storeName) uploadedAtts.push({ storeName, attachmentName: att.name });
            } catch {}
          }
          if (uploadedAtts.length) payload.attachments = uploadedAtts;
        }

        await zohoPost(cfg, `/accounts/${cfg.accountId}/messages`, payload);
        await logActivity(decoded.sub, 'email_send', `Sent email via Zoho to ${to}: "${subject}"`);
        return jsonResponse({ success: true });
      }

      return badRequest('Unknown provider');
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      return jsonResponse({ error: detail }, 500);
    }
  }
});
