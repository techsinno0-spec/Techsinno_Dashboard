const { app } = require('@azure/functions');
const { createItem, getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_CATEGORIES = ['admin', 'repair', 'auto', 'iot', 'general'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

app.http('tasks-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const body = await request.json();
      const { title, description, category, priority, assignedTo, deadline } = body;

      if (decoded.role === 'staff') {
        if (!assignedTo || assignedTo !== decoded.sub) {
          return forbidden('Staff can only create tasks assigned to themselves');
        }
      }

      if (!title || !title.trim()) {
        return badRequest('Task title is required');
      }
      if (!assignedTo) {
        return badRequest('assignedTo (user ID) is required');
      }

      const assignee = await getItem('users', assignedTo);
      if (!assignee || !assignee.active) {
        return badRequest('Assigned user not found or inactive');
      }

      const now = new Date().toISOString();
      const task = {
        id: `tsk_${uuidv4()}`,
        title: sanitizeString(title, 200),
        description: sanitizeString(description || '', 2000),
        category: VALID_CATEGORIES.includes(category) ? category : 'general',
        priority: VALID_PRIORITIES.includes(priority) ? priority : 'medium',
        status: 'pending',
        assignedTo,
        assignedBy: decoded.sub,
        deadline: deadline || null,
        notes: [],
        createdAt: now,
        updatedAt: now,
        completedAt: null
      };

      await createItem('tasks', task);

      await logActivity(decoded.sub, 'task_created', `Created task "${task.title}" for ${assignee.displayName}`, task.id);

      return jsonResponse({ task }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create task' }, 500);
    }
  }
});
