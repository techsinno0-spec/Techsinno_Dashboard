const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('jobcards-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'job-cards',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      let results;
      if (decoded.role === 'manager') {
        // Manager sees all job cards
        results = await queryItems(
          'job-cards',
          'SELECT * FROM c ORDER BY c.createdAt DESC'
        );
      } else {
        // Staff see only cards they are assigned to
        results = await queryItems(
          'job-cards',
          'SELECT * FROM c WHERE ARRAY_CONTAINS(c.assignedTo, @userId) ORDER BY c.createdAt DESC',
          [{ name: '@userId', value: decoded.sub }]
        );
      }
      return jsonResponse({ jobCards: results });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load job cards' }, 500);
    }
  }
});
