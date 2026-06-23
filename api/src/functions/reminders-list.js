const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('reminders-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reminders',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const reminders = await queryItems(
        'reminders',
        'SELECT * FROM c WHERE c.userId = @uid AND c.status != "dismissed" ORDER BY c.dueDate ASC',
        [{ name: '@uid', value: decoded.sub }]
      );
      return jsonResponse({ reminders });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch reminders' }, 500);
    }
  }
});
