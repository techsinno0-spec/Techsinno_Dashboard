const { app } = require('@azure/functions');
const { getItem, replaceItem, queryItems } = require('../../shared/cosmos');
const { hashPassword, validatePasswordStrength } = require('../../shared/password');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound, isOwner } = require('../../shared/auth');

app.http('users-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'users/{userId}',
  handler: async (request, context) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const userId = request.params.userId;

    try {
      const user = await getItem('users', userId);
      if (!user) return notFound('User not found');

      const body = await request.json();
      const { displayName, email, role, resetPassword } = body;

      if (displayName !== undefined) user.displayName = displayName.trim();
      if (email !== undefined) {
        const cleanEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return badRequest('Use a valid company email address');
        const existing = await queryItems(
          'users',
          'SELECT c.id FROM c WHERE c.username = @username AND c.id != @id',
          [{ name: '@username', value: cleanEmail }, { name: '@id', value: user.id }]
        );
        if (existing.length > 0) return badRequest('Email/login already belongs to another user');
        user.email = cleanEmail;
        user.username = cleanEmail;
      }
      if (role !== undefined && ['owner', 'manager', 'staff', 'viewer'].includes(role)) {
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
