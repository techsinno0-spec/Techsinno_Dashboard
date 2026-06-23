const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('activity-user', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity/{userId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const userId = request.params.userId;

    try {
      const limit = Math.min(parseInt(request.query.get('limit') || '50', 10), 200);

      const activities = await queryItems(
        'activity',
        'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit',
        [
          { name: '@userId', value: userId },
          { name: '@limit', value: limit }
        ]
      );

      return jsonResponse({ activities });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch user activity' }, 500);
    }
  }
});
