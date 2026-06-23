const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('recurring-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tasks/recurring',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const rules = await queryItems('recurring_tasks', 'SELECT * FROM c ORDER BY c.createdAt DESC');
      return jsonResponse({ rules });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch recurring rules' }, 500);
    }
  }
});
