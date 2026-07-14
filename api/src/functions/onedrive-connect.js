const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, isOwner } = require('../../shared/auth');
const { redirectBaseFromRequest } = require('../../shared/oauth-base');
const { createOAuthState } = require('../../shared/oauth-state');
const {
  ONEDRIVE_AUTH_URL,
  ONEDRIVE_SCOPES,
  getOneDriveConfig,
  oneDriveClientId
} = require('../../shared/onedrive');

app.http('onedrive-connect', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'onedrive/connect',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const cfg = await getOneDriveConfig();
    const clientId = oneDriveClientId(cfg);
    if (!clientId) return badRequest('OneDrive Client ID not configured - add it in Settings');

    const base = redirectBaseFromRequest(request);
    const redirectUri = `${base}/api/onedrive/callback`;
    const state = await createOAuthState('onedrive', decoded, { redirectUri });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: ONEDRIVE_SCOPES,
      response_mode: 'query',
      prompt: 'select_account consent',
      state
    });

    return jsonResponse({ url: `${ONEDRIVE_AUTH_URL}?${params.toString()}`, redirectUri });
  }
});
