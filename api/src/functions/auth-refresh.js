const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, signToken, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('auth-refresh', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/refresh',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized('Token expired or invalid — please log in again');

    try {
      const user = await getItem('users', decoded.sub);
      if (!user || !user.active) {
        return unauthorized('Account deactivated');
      }

      const token = signToken(user);

      return jsonResponse({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword || false
        },
        expiresIn: 86400
      });
    } catch {
      return jsonResponse({ error: 'Token refresh failed' }, 500);
    }
  }
});
