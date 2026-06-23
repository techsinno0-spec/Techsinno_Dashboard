const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('activity-log', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const limit = Math.min(parseInt(request.query.get('limit') || '50', 10), 200);
      const action = request.query.get('action');

      let query = 'SELECT * FROM c';
      const params = [];

      if (action) {
        query += ' WHERE c.action = @action';
        params.push({ name: '@action', value: action });
      }

      query += ' ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit';
      params.push({ name: '@limit', value: limit });

      const activities = await queryItems('activity', query, params);

      return jsonResponse({ activities });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch activity log' }, 500);
    }
  }
});
