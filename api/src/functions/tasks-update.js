const { app } = require('@azure/functions');
const { getItem, replaceItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const VALID_CATEGORIES = ['admin', 'repair', 'auto', 'iot', 'general'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

app.http('tasks-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'tasks/{taskId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role === 'viewer') return forbidden('View-only users cannot update tasks');

    const taskId = request.params.taskId;

    try {
      const results = await queryItems(
        'tasks',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: taskId }]
      );
      if (results.length === 0) return notFound('Task not found');
      const task = results[0];

      if (decoded.role === 'staff' && task.assignedTo !== decoded.sub) {
        return forbidden('You can only update your own tasks');
      }

      const body = await request.json();

      if (decoded.role === 'manager') {
        if (body.title !== undefined) task.title = sanitizeString(body.title, 200);
        if (body.description !== undefined) task.description = sanitizeString(body.description, 2000);
        if (body.category && VALID_CATEGORIES.includes(body.category)) task.category = body.category;
        if (body.priority && VALID_PRIORITIES.includes(body.priority)) task.priority = body.priority;
        if (body.deadline !== undefined) task.deadline = body.deadline;
        if (body.assignedTo) {
          const assignee = await getItem('users', body.assignedTo);
          if (!assignee || !assignee.active) return badRequest('Assigned user not found or inactive');
          task.assignedTo = body.assignedTo;
        }
      }

      if (body.status && VALID_STATUSES.includes(body.status)) {
        const oldStatus = task.status;
        task.status = body.status;
        if (body.status === 'done' && oldStatus !== 'done') {
          task.completedAt = new Date().toISOString();
        } else if (body.status !== 'done') {
          task.completedAt = null;
        }
      }

      task.updatedAt = new Date().toISOString();
      await replaceItem('tasks', task.id, task, task.assignedTo);

      const action = body.status === 'done' ? 'task_completed' : 'task_updated';
      await logActivity(decoded.sub, action, `Updated task "${task.title}" — status: ${task.status}`, task.id);

      return jsonResponse({ task });
    } catch (err) {
      if (err.code === 404) return notFound('Task not found');
      return jsonResponse({ error: 'Failed to update task' }, 500);
    }
  }
});
