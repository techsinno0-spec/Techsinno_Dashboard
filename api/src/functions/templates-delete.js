const { app } = require('@azure/functions');
const { deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');

app.http('templates-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      await deleteItem('templates', request.params.templateId);
      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Template not found');
      return jsonResponse({ error: 'Failed to delete template' }, 500);
    }
  }
});
