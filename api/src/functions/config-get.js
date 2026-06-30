const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, isOwner } = require('../../shared/auth');
const { CONFIG_SERVICES, safeConfig } = require('../../shared/config-safe');

app.http('config-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'config/{service}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const service = request.params.service;
    if (!CONFIG_SERVICES.includes(service)) return jsonResponse({ error: 'Unknown service' }, 400);

    try {
      const config = await getItem('config', `cfg_${service}`);
      if (!config) return jsonResponse({ config: { service, connected: false } });

      return jsonResponse({ config: safeConfig(config, service) });
    } catch (err) {
      if (err.code === 404) return jsonResponse({ config: { service, connected: false } });
      return jsonResponse({ error: 'Failed to fetch config' }, 500);
    }
  }
});
