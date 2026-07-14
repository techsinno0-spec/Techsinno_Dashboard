const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getEmailConfig, saveEmailConfig } = require('../../shared/email');

app.http('email-disconnect', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'email/disconnect/{provider}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const provider = request.params.provider;
    if (!['gmail', 'outlook', 'zoho_mail'].includes(provider)) return badRequest('Unknown provider');

    const cfg = await getEmailConfig(provider);
    if (!cfg) return jsonResponse({ success: true });

    const updates = {
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      email: null,
      connected: false,
      reconnectRequired: false,
      lastAuthError: null
    };
    if (provider === 'zoho_mail') {
      updates.accountId = null;
      updates.aliases = null;
      updates.region = null;
    }
    await saveEmailConfig(provider, updates);

    return jsonResponse({ success: true });
  }
});
