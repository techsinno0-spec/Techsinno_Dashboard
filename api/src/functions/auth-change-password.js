const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { verifyPassword, hashPassword, validatePasswordStrength } = require('../../shared/password');
const { authenticate, jsonResponse, unauthorized, badRequest } = require('../../shared/auth');

app.http('auth-change-password', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/change-password',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const body = await request.json();
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return badRequest('Current password and new password are required');
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) return badRequest(strength.reason);

      const user = await getItem('users', decoded.sub);
      if (!user || !user.active) return unauthorized('Account not found');

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) return badRequest('Current password is incorrect');

      user.passwordHash = await hashPassword(newPassword);
      user.mustChangePassword = false;
      user.updatedAt = new Date().toISOString();
      await replaceItem('users', user.id, user);

      return jsonResponse({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      return jsonResponse({ error: 'Failed to change password' }, 500);
    }
  }
});
