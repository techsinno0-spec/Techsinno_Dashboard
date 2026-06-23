const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('config-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'config/{service}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const service = request.params.service;
    const VALID = ['zoho_books', 'zoho_mail', 'gmail', 'outlook', 'linkedin', 'claude', 'hunter', 'cloudflare', 'onedrive', 'goals_private'];
    if (!VALID.includes(service)) return jsonResponse({ error: 'Unknown service' }, 400);

    try {
      const config = await getItem('config', `cfg_${service}`);
      if (!config) return jsonResponse({ config: { service, connected: false } });

      const safe = { ...config };
      if (safe.clientSecret) safe.clientSecret = '••••••••';
      if (safe.accessToken) safe.hasAccessToken = true;
      delete safe.accessToken;
      delete safe.refreshToken;
      safe.connected = !!config.accessToken;

      return jsonResponse({ config: safe });
    } catch (err) {
      if (err.code === 404) return jsonResponse({ config: { service, connected: false } });
      return jsonResponse({ error: 'Failed to fetch config' }, 500);
    }
  }
});
