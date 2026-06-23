const { app } = require('@azure/functions');
const { deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('social-disconnect', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'social/disconnect/{platform}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const platform = request.params.platform;

    try {
      if (platform === 'linkedin') {
        await deleteItem('config', 'cfg_social_linkedin');
        await logActivity(decoded.sub, 'social_disconnect', 'Disconnected LinkedIn');
        return jsonResponse({ success: true, message: 'LinkedIn disconnected' });
      }

      if (platform === 'meta') {
        await deleteItem('config', 'cfg_social_meta');
        await logActivity(decoded.sub, 'social_disconnect', 'Disconnected Facebook & Instagram');
        return jsonResponse({ success: true, message: 'Facebook & Instagram disconnected' });
      }

      return badRequest('Unknown platform. Use: linkedin, meta');
    } catch (err) {
      if (err.code === 404) return jsonResponse({ success: true, message: 'Already disconnected' });
      return jsonResponse({ error: 'Failed to disconnect' }, 500);
    }
  }
});
