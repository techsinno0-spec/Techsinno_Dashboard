const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound, isOwner } = require('../../shared/auth');

app.http('users-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'users/{userId}',
  handler: async (request, context) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const userId = request.params.userId;

    if (userId === decoded.sub) {
      return badRequest('Cannot deactivate your own account');
    }

    try {
      const user = await getItem('users', userId);
      if (!user) return notFound('User not found');
      if (user.role === 'owner') return forbidden('Owner accounts cannot be deactivated here');

      user.active = false;
      user.updatedAt = new Date().toISOString();
      await replaceItem('users', user.id, user);

      return jsonResponse({ success: true, message: `User ${user.displayName} deactivated` });
    } catch (err) {
      if (err.code === 404) return notFound('User not found');
      return jsonResponse({ error: 'Failed to deactivate user' }, 500);
    }
  }
});
