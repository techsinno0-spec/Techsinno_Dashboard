const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, isOwner } = require('../../shared/auth');
const { CONFIG_SERVICES, safeConfig } = require('../../shared/config-safe');

const OAUTH_CONFIG_SERVICES = new Set(['zoho_books', 'zoho_mail', 'gmail', 'outlook']);

function clearOAuthTokensIfCredentialsChanged(config, body) {
  if (!OAUTH_CONFIG_SERVICES.has(config.service)) return;

  const clientIdChanged = body.clientId !== undefined && body.clientId !== config.clientId;
  const hasNewSecret = body.clientSecret !== undefined && body.clientSecret !== '••••••••';
  const clientSecretChanged = hasNewSecret && body.clientSecret !== config.clientSecret;

  if (!clientIdChanged && !clientSecretChanged) return;

  config.accessToken = null;
  config.refreshToken = null;
  config.tokenExpiry = 0;
  config.connected = false;
  config.reconnectRequired = true;
  config.lastAuthError = 'OAuth credentials changed. Reconnect this integration.';
}

app.http('config-save', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'config/{service}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const service = request.params.service;
    if (!CONFIG_SERVICES.includes(service)) return badRequest('Unknown service');

    try {
      const body = await request.json();
      const id = `cfg_${service}`;
      const now = new Date().toISOString();

      let existing = null;
      try { existing = await getItem('config', id); } catch {}

      const config = existing || { id, service };
      clearOAuthTokensIfCredentialsChanged(config, body);
      if (body.goals !== undefined) config.goals = body.goals;
      if (body.clientId !== undefined) config.clientId = body.clientId;
      if (body.clientSecret !== undefined && body.clientSecret !== '••••••••') config.clientSecret = body.clientSecret;
      if (body.orgId !== undefined) config.orgId = body.orgId;
      if (body.apiKey !== undefined) config.apiKey = body.apiKey;
      if (body.zoneId !== undefined) config.zoneId = body.zoneId;
      if (body.personalUrl !== undefined) config.personalUrl = body.personalUrl;
      if (body.region !== undefined) config.region = body.region;
      if (body.accountId !== undefined) config.accountId = body.accountId;
      if (body.aliases !== undefined) config.aliases = Array.isArray(body.aliases) ? body.aliases : [];
      if (body.companyName !== undefined) config.companyName = body.companyName;
      if (body.registrationNumber !== undefined) config.registrationNumber = body.registrationNumber;
      if (body.email !== undefined) config.email = body.email;
      if (body.phone !== undefined) config.phone = body.phone;
      if (body.address !== undefined) config.address = body.address;
      if (body.website !== undefined) config.website = body.website;
      if (body.ownerName !== undefined) config.ownerName = body.ownerName;
      if (body.notes !== undefined) config.notes = body.notes;
      if (body.connected !== undefined) config.connected = !!body.connected;
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

      return jsonResponse({ success: true, message: `${service} config saved`, config: safeConfig(config, service) });
    } catch (err) {
      return jsonResponse({ error: 'Failed to save config' }, 500);
    }
  }
});
