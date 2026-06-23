const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('campaigns-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'campaigns',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const campaigns = await queryItems('campaigns', 'SELECT * FROM c ORDER BY c.updatedAt DESC');
      return jsonResponse({ campaigns });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch campaigns' }, 500);
    }
  }
});
