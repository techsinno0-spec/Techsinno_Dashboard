const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('social-schedule-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/scheduled',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const posts = await queryItems('scheduled_posts', 'SELECT * FROM c ORDER BY c.scheduledFor ASC');
      return jsonResponse({ posts });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch scheduled posts' }, 500);
    }
  }
});
