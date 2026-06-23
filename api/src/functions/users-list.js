const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('users-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const users = await queryItems(
        'users',
        'SELECT c.id, c.username, c.displayName, c.email, c.role, c.active, c.mustChangePassword, c.lastLoginAt, c.createdAt FROM c ORDER BY c.createdAt DESC'
      );

      return jsonResponse({ users });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch users' }, 500);
    }
  }
});
