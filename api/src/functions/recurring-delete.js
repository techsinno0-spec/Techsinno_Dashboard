const { app } = require('@azure/functions');
const { deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');

app.http('recurring-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'tasks/recurring/{ruleId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      await deleteItem('recurring_tasks', request.params.ruleId);
      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Rule not found');
      return jsonResponse({ error: 'Failed to delete rule' }, 500);
    }
  }
});
