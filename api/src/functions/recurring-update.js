const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');

app.http('recurring-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'tasks/recurring/{ruleId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const rule = await getItem('recurring_tasks', request.params.ruleId);
      if (!rule) return notFound('Rule not found');

      const body = await request.json();
      if (body.active !== undefined) rule.active = !!body.active;
      if (body.title !== undefined) rule.title = body.title;
      if (body.assignedTo !== undefined) rule.assignedTo = body.assignedTo;

      await replaceItem('recurring_tasks', rule.id, rule);
      return jsonResponse({ rule });
    } catch (err) {
      if (err.code === 404) return notFound('Rule not found');
      return jsonResponse({ error: 'Failed to update rule' }, 500);
    }
  }
});
