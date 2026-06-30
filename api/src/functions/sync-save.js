const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');

const SYNC_ID = 'dashboard_state';
const MAX_ARRAY_ITEMS = 1000;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 5000;

function cleanArray(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ARRAY_ITEMS) : [];
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanStateValue(value, depth = 0) {
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map(v => cleanStateValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).slice(0, MAX_OBJECT_KEYS).forEach(([key, val]) => {
      out[String(key).slice(0, 80)] = cleanStateValue(val, depth + 1);
    });
    return out;
  }
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return null;
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
      let existing = null;
      try { existing = await getItem('config', SYNC_ID); } catch {}
      const previous = cleanObject(existing && existing.data);
      const data = {
        ...previous,
        tasks: body.tasks === undefined ? cleanArray(previous.tasks) : cleanArray(body.tasks),
        goals: body.goals === undefined ? cleanArray(previous.goals) : cleanArray(body.goals),
        posts: body.posts === undefined ? cleanArray(previous.posts) : cleanArray(body.posts),
        manualTasks: body.manualTasks === undefined ? cleanArray(previous.manualTasks) : cleanArray(body.manualTasks),
        websiteServices: body.websiteServices === undefined ? cleanObject(previous.websiteServices) : cleanObject(body.websiteServices),
        dashboard: body.dashboard === undefined ? cleanObject(previous.dashboard) : cleanObject(body.dashboard),
        savedAt: body.savedAt || now
      };

      if (body.state && typeof body.state === 'object' && !Array.isArray(body.state)) {
        data.state = {
          ...cleanObject(previous.state),
          ...cleanStateValue(body.state)
        };
      }

      if (body.replaceState && typeof body.replaceState === 'object' && !Array.isArray(body.replaceState)) {
        data.state = cleanStateValue(body.replaceState);
      }

      const item = {
        id: SYNC_ID,
        service: 'dashboard_sync',
        data,
        savedAt: now,
        savedBy: decoded.sub,
        updatedAt: now
      };

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
