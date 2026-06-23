const { app } = require('@azure/functions');
const { queryItems, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');

app.http('tasks-notes', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks/{taskId}/notes',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const taskId = request.params.taskId;

    try {
      const body = await request.json();
      const { text } = body;

      if (!text || !text.trim()) {
        return badRequest('Note text is required');
      }

      const results = await queryItems(
        'tasks',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: taskId }]
      );
      if (results.length === 0) return notFound('Task not found');
      const task = results[0];

      if (decoded.role === 'staff' && task.assignedTo !== decoded.sub) {
        return forbidden('You can only add notes to your own tasks');
      }

      const note = {
        author: decoded.sub,
        authorName: decoded.name || 'Unknown',
        text: text.trim(),
        timestamp: new Date().toISOString()
      };

      if (!task.notes) task.notes = [];
      task.notes.push(note);
      task.updatedAt = new Date().toISOString();

      await replaceItem('tasks', task.id, task, task.assignedTo);

      await logActivity(decoded.sub, 'note_added', `Added note on "${task.title}"`, task.id);

      return jsonResponse({ task });
    } catch (err) {
      if (err.code === 404) return notFound('Task not found');
      return jsonResponse({ error: 'Failed to add note' }, 500);
    }
  }
});
