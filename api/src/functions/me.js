const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const user = await getItem('users', decoded.sub);
      if (!user || !user.active) return unauthorized('Account not found');

      return jsonResponse({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword || false,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
      });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch profile' }, 500);
    }
  }
});
