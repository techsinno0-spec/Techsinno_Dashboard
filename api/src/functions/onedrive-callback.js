const { app } = require('@azure/functions');
const axios = require('axios');
const { redirectBaseFromRequest } = require('../../shared/oauth-base');
const { readOAuthState } = require('../../shared/oauth-state');
const {
  ONEDRIVE_TOKEN_URL,
  ONEDRIVE_GRAPH_BASE,
  ONEDRIVE_SCOPES,
  getOneDriveConfig,
  oneDriveClientId,
  oneDriveClientSecret,
  saveOneDriveConfig
} = require('../../shared/onedrive');

function html(msg, ok) {
  const safeMsg = String(msg || '');
  return {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage({ type:'onedrive-auth', provider:'onedrive', success:${ok}, message:${JSON.stringify(safeMsg)} },'*');
      setTimeout(()=>window.close(),2000);
    </script><p>${safeMsg.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))}</p></body></html>`
  };
}

app.http('onedrive-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'onedrive/callback',
  handler: async (request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) return html('Authorization denied: ' + error, false);
    if (!code || !state) return html('Missing authorization code', false);

    let stateData;
    try {
      stateData = await readOAuthState(state, 'onedrive');
      if (!stateData.isOwner) return html('Owner access required', false);
    } catch (err) {
      return html(err.message || 'Invalid state', false);
    }

    try {
      const cfg = await getOneDriveConfig();
      const clientId = oneDriveClientId(cfg);
      const clientSecret = oneDriveClientSecret(cfg);
      if (!clientId || !clientSecret) throw new Error('OneDrive credentials not configured');

      const base = redirectBaseFromRequest(request);
      const redirectUri = stateData.context?.redirectUri || `${base}/api/onedrive/callback`;
      const params = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        scope: ONEDRIVE_SCOPES
      });
      const tokenRes = await axios.post(ONEDRIVE_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, refresh_token, expires_in } = tokenRes.data;
      let profile = {};
      try {
        const me = await axios.get(`${ONEDRIVE_GRAPH_BASE}/me`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        profile = me.data || {};
      } catch {}

      await saveOneDriveConfig({
        accessToken: access_token,
        refreshToken: refresh_token || cfg?.refreshToken,
        tokenExpiry: Date.now() + (expires_in || 3600) * 1000,
        email: profile.mail || profile.userPrincipalName || '',
        displayName: profile.displayName || 'OneDrive',
        connectedBy: stateData.userId,
        connected: true,
        reconnectRequired: false,
        lastAuthError: null
      });

      return html('OneDrive connected successfully!', true);
    } catch (err) {
      return html('Connection failed: ' + (err.response?.data?.error_description || err.message), false);
    }
  }
});
