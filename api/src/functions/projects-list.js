const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('projects-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'projects',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      let results;
      if (decoded.role === 'manager') {
        results = await queryItems(
          'projects',
          'SELECT * FROM c ORDER BY c.createdAt DESC'
        );
      } else {
        results = await queryItems(
          'projects',
          'SELECT * FROM c WHERE ARRAY_CONTAINS(c.assignedTo, @userId) ORDER BY c.createdAt DESC',
          [{ name: '@userId', value: decoded.sub }]
        );
      }
      return jsonResponse({ projects: results });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load projects' }, 500);
    }
  }
});
