const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { STATE_KEYS, cleanStateValue } = require('../../shared/state-safe');

app.http('state-save', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'state/{key}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!['owner', 'manager'].includes(decoded.role)) return forbidden('Manager access required');

    const key = request.params.key;
    if (!STATE_KEYS.includes(key)) return badRequest('Unknown state key');

    try {
      const body = await request.json();
      if (!body || typeof body !== 'object') return badRequest('State payload is required');
      const now = new Date().toISOString();
      const id = `state_${key}`;
      const incoming = body.value !== undefined ? body.value : body;
      const value = cleanStateValue(incoming);

      let existing = null;
      try { existing = await getItem('config', id); } catch {}

      const item = {
        ...(existing || {}),
        id,
        service: 'server_state',
        key,
        value,
        savedAt: now,
        savedBy: decoded.sub,
        updatedAt: now
      };

      if (existing) await replaceItem('config', id, item);
      else await createItem('config', item);

      return jsonResponse({ success: true, key, savedAt: now });
    } catch (err) {
      return jsonResponse({ error: 'Failed to save state' }, 500);
    }
  }
});
