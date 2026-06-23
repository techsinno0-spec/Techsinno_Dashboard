const { app } = require('@azure/functions');
const { getItem, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, notFound } = require('../../shared/auth');

app.http('reminders-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'reminders/{reminderId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const reminderId = request.params.reminderId;

    try {
      const reminder = await getItem('reminders', reminderId, decoded.sub);
      if (!reminder || reminder.userId !== decoded.sub) return notFound('Reminder not found');

      await deleteItem('reminders', reminderId, decoded.sub);
      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Reminder not found');
      return jsonResponse({ error: 'Failed to delete reminder' }, 500);
    }
  }
});
