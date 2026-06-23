const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { hashPassword, validatePasswordStrength } = require('../../shared/password');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');

app.http('users-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'users/{userId}',
  handler: async (request, context) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const userId = request.params.userId;

    try {
      const user = await getItem('users', userId);
      if (!user) return notFound('User not found');

      const body = await request.json();
      const { displayName, email, role, resetPassword } = body;

      if (displayName !== undefined) user.displayName = displayName.trim();
      if (email !== undefined) user.email = email.trim();
      if (role !== undefined && (role === 'manager' || role === 'staff')) {
        user.role = role;
      }

      if (resetPassword) {
        const strength = validatePasswordStrength(resetPassword);
        if (!strength.valid) return badRequest(strength.reason);
        user.passwordHash = await hashPassword(resetPassword);
        user.mustChangePassword = true;
      }

      user.updatedAt = new Date().toISOString();
      await replaceItem('users', user.id, user);

      return jsonResponse({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt
        }
      });
    } catch (err) {
      if (err.code === 404) return notFound('User not found');
      return jsonResponse({ error: 'Failed to update user' }, 500);
    }
  }
});
