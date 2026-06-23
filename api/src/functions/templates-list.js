const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('templates-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const templates = await queryItems('templates', 'SELECT * FROM c ORDER BY c.category, c.name');
      return jsonResponse({ templates });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch templates' }, 500);
    }
  }
});
