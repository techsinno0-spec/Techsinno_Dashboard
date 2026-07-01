const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, GMAIL_AUTH_URL, GMAIL_SCOPES, MS_AUTH_URL, MS_SCOPES, ZOHO_REGIONS, ZOHO_SCOPES } = require('../../shared/email');

app.http('email-connect', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/connect/{provider}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const provider = request.params.provider;
    const base = process.env.SOCIAL_REDIRECT_BASE || 'http://localhost:7071';
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    const state = Buffer.from(JSON.stringify({ jwt: token })).toString('base64url');

    if (provider === 'gmail') {
      const cfg = await getEmailConfig('gmail');
      const clientId = process.env.GMAIL_CLIENT_ID || cfg?.clientId;
      if (!clientId) return badRequest('Gmail Client ID not configured — add it in Settings');
      const redirectUri = `${base}/api/email/callback/gmail`;
      const url = `${GMAIL_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(GMAIL_SCOPES)}&access_type=offline&prompt=consent&state=${state}`;
      return jsonResponse({ url, redirectUri });
    }

    if (provider === 'outlook') {
      const cfg = await getEmailConfig('outlook');
      const clientId = process.env.MS_CLIENT_ID || cfg?.clientId;
      if (!clientId) return badRequest('Outlook Client ID not configured — add it in Settings');
      const redirectUri = `${base}/api/email/callback/outlook`;
      const url = `${MS_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(MS_SCOPES)}&response_mode=query&state=${state}`;
      return jsonResponse({ url, redirectUri });
    }

    if (provider === 'zoho_mail') {
      const cfg = await getEmailConfig('zoho_mail');
      const clientId = process.env.ZOHO_MAIL_CLIENT_ID || cfg?.clientId;
      if (!clientId) return badRequest('Zoho Mail Client ID not configured — add it in Settings');
      const redirectUri = `${base}/api/email/callback/zoho_mail`;
      const region = ZOHO_REGIONS[cfg?.region || 'com'] || ZOHO_REGIONS.com;
      const url = `${region.accounts}/oauth/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(ZOHO_SCOPES)}&access_type=offline&prompt=consent&state=${state}`;
      return jsonResponse({ url, redirectUri });
    }

    return badRequest('Unknown provider. Use: gmail, outlook, zoho_mail');
  }
});
