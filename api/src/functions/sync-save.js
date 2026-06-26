const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');

const SYNC_ID = 'dashboard_state';
const MAX_ARRAY_ITEMS = 1000;

function cleanArray(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ARRAY_ITEMS) : [];
}

app.http('sync-save', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'sync',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body || typeof body !== 'object') return badRequest('Sync payload is required');

      const now = new Date().toISOString();
      const data = {
        tasks: cleanArray(body.tasks),
        goals: cleanArray(body.goals),
        posts: cleanArray(body.posts),
        savedAt: body.savedAt || now
      };

      const item = {
        id: SYNC_ID,
        service: 'dashboard_sync',
        data,
        savedAt: now,
        savedBy: decoded.sub,
        updatedAt: now
      };

      let existing = null;
      try { existing = await getItem('config', SYNC_ID); } catch {}

      if (existing) {
        await replaceItem('config', SYNC_ID, { ...existing, ...item });
      } else {
        await createItem('config', item);
      }

      return jsonResponse({ success: true, ts: now, savedAt: now });
    } catch (err) {
      return jsonResponse({ error: 'Failed to save sync state' }, 500);
    }
  }
});
