const { app } = require('@azure/functions');
const { getItem, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');

app.http('social-schedule-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'social/scheduled/{postId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const post = await getItem('scheduled_posts', request.params.postId);
      if (!post) return notFound('Scheduled post not found');
      if (post.status === 'posted') return jsonResponse({ error: 'Cannot delete already posted item' }, 400);

      await deleteItem('scheduled_posts', request.params.postId);
      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Scheduled post not found');
      return jsonResponse({ error: 'Failed to delete' }, 500);
    }
  }
});
