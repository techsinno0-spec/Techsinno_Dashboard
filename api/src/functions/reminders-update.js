const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, notFound } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');

app.http('reminders-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'reminders/{reminderId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const reminderId = request.params.reminderId;

    try {
      const reminder = await getItem('reminders', reminderId, decoded.sub);
      if (!reminder || reminder.userId !== decoded.sub) return notFound('Reminder not found');

      const body = await request.json();

      if (body.title !== undefined) reminder.title = sanitizeString(body.title, 200);
      if (body.description !== undefined) reminder.description = sanitizeString(body.description, 1000);
      if (body.dueDate !== undefined) reminder.dueDate = body.dueDate;
      if (body.priority !== undefined && ['high', 'medium', 'low'].includes(body.priority)) reminder.priority = body.priority;
      if (body.status !== undefined && ['active', 'dismissed', 'completed'].includes(body.status)) reminder.status = body.status;

      if (body.snooze) {
        const days = { '1d': 1, '3d': 3, '1w': 7 };
        const d = days[body.snooze] || 1;
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + d);
        reminder.dueDate = newDate.toISOString();
      }

      reminder.updatedAt = new Date().toISOString();
      await replaceItem('reminders', reminderId, reminder, decoded.sub);

      return jsonResponse({ reminder });
    } catch (err) {
      if (err.code === 404) return notFound('Reminder not found');
      return jsonResponse({ error: 'Failed to update reminder' }, 500);
    }
  }
});
