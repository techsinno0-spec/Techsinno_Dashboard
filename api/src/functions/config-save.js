const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');

app.http('config-save', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'config/{service}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const service = request.params.service;
    const VALID = ['zoho_books', 'zoho_mail', 'gmail', 'outlook', 'linkedin', 'claude', 'hunter', 'cloudflare', 'onedrive', 'goals_private'];
    if (!VALID.includes(service)) return badRequest('Unknown service');

    try {
      const body = await request.json();
      const id = `cfg_${service}`;
      const now = new Date().toISOString();

      let existing = null;
      try { existing = await getItem('config', id); } catch {}

      const config = existing || { id, service };
      if (body.goals !== undefined) config.goals = body.goals;
      if (body.clientId !== undefined) config.clientId = body.clientId;
      if (body.clientSecret !== undefined && body.clientSecret !== '••••••••') config.clientSecret = body.clientSecret;
      if (body.orgId !== undefined) config.orgId = body.orgId;
      if (body.apiKey !== undefined) config.apiKey = body.apiKey;
      if (body.zoneId !== undefined) config.zoneId = body.zoneId;
      if (body.personalUrl !== undefined) config.personalUrl = body.personalUrl;
      if (body.accessToken !== undefined) config.accessToken = body.accessToken;
      if (body.refreshToken !== undefined) config.refreshToken = body.refreshToken;
      if (body.tokenExpiry !== undefined) config.tokenExpiry = body.tokenExpiry;
      config.updatedBy = decoded.sub;
      config.updatedAt = now;

      if (existing) {
        await replaceItem('config', id, config);
      } else {
        await createItem('config', config);
      }

      return jsonResponse({ success: true, message: `${service} config saved` });
    } catch (err) {
      return jsonResponse({ error: 'Failed to save config' }, 500);
    }
  }
});
