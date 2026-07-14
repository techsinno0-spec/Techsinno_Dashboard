const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, isOwner } = require('../../shared/auth');
const { getOneDriveConfig, saveOneDriveConfig } = require('../../shared/onedrive');

app.http('onedrive-disconnect', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'onedrive/disconnect',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const cfg = await getOneDriveConfig();
    if (!cfg) return jsonResponse({ success: true });

    await saveOneDriveConfig({
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      email: null,
      displayName: null,
      connected: false,
      reconnectRequired: false,
      lastAuthError: null
    });

    return jsonResponse({ success: true });
  }
});
