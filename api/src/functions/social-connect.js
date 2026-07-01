const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { getItem } = require('../../shared/cosmos');
const { redirectBaseFromRequest } = require('../../shared/oauth-base');

app.http('social-connect', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/connect/{platform}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const platform = request.params.platform;
    const base = redirectBaseFromRequest(request);
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (platform === 'linkedin') {
      let clientId = process.env.LINKEDIN_CLIENT_ID;
      if (!clientId) {
        const cfg = await getItem('config', 'cfg_linkedin').catch(() => null);
        clientId = cfg?.clientId;
      }
      if (!clientId) return badRequest('LinkedIn Client ID not configured');
      const redirectUri = `${base}/api/social/callback/linkedin`;
      const scope = 'openid profile w_member_social';
      const state = Buffer.from(JSON.stringify({ jwt: token })).toString('base64url');
      const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
      return jsonResponse({ url });
    }

    if (platform === 'meta') {
      const appId = process.env.META_APP_ID;
      if (!appId) return badRequest('Meta App ID not configured');
      const redirectUri = `${base}/api/social/callback/meta`;
      const scope = 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,pages_messaging,instagram_manage_messages';
      const state = Buffer.from(JSON.stringify({ jwt: token })).toString('base64url');
      const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      return jsonResponse({ url });
    }

    return badRequest('Unknown platform. Use: linkedin, meta');
  }
});
