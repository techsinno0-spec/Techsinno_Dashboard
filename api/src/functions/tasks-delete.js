const { app } = require('@azure/functions');
const { queryItems, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('tasks-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'tasks/{taskId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const taskId = request.params.taskId;

    try {
      const results = await queryItems(
        'tasks',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: taskId }]
      );
      if (results.length === 0) return notFound('Task not found');
      const task = results[0];

      await deleteItem('tasks', task.id, task.assignedTo);

      await logActivity(decoded.sub, 'task_deleted', `Deleted task "${task.title}"`, task.id);

      return jsonResponse({ success: true, message: `Task "${task.title}" deleted` });
    } catch (err) {
      if (err.code === 404) return notFound('Task not found');
      return jsonResponse({ error: 'Failed to delete task' }, 500);
    }
  }
});
