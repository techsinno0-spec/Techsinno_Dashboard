const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const { STATE_KEYS } = require('../../shared/state-safe');

app.http('state-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'state/{key}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!['owner', 'manager'].includes(decoded.role)) return forbidden('Manager access required');

    const key = request.params.key;
    if (!STATE_KEYS.includes(key)) return jsonResponse({ error: 'Unknown state key' }, 400);

    try {
      const item = await getItem('config', `state_${key}`);
      return jsonResponse({
        success: true,
        key,
        value: item.value || null,
        savedAt: item.savedAt || item.updatedAt,
        savedBy: item.savedBy
      });
    } catch (err) {
      if (err.code === 404) return jsonResponse({ success: true, key, value: null });
      return jsonResponse({ error: 'Failed to fetch state' }, 500);
    }
  }
});
