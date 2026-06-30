const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, isOwner } = require('../../shared/auth');
const { CONFIG_SERVICES, safeConfig } = require('../../shared/config-safe');

app.http('config-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'config',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    try {
      const configs = {};
      for (const service of CONFIG_SERVICES) {
        try {
          const config = await getItem('config', `cfg_${service}`);
          configs[service] = safeConfig(config, service);
        } catch (err) {
          if (err.code === 404) configs[service] = safeConfig({ service, connected: false }, service);
          else throw err;
        }
      }

      return jsonResponse({ configs, services: CONFIG_SERVICES });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch config list' }, 500);
    }
  }
});
