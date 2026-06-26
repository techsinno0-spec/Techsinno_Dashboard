const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

const SYNC_ID = 'dashboard_state';

app.http('sync-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sync',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const state = await getItem('config', SYNC_ID);
      if (!state) return jsonResponse({ success: true, data: null });

      return jsonResponse({
        success: true,
        data: state.data || null,
        savedAt: state.savedAt,
        savedBy: state.savedBy
      });
    } catch (err) {
      if (err.code === 404) return jsonResponse({ success: true, data: null });
      return jsonResponse({ error: 'Failed to load sync state' }, 500);
    }
  }
});
