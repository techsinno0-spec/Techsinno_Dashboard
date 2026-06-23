const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, badRequest } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('reminders-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reminders',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const body = await request.json();
      if (!body.title || !body.title.trim()) return badRequest('Title is required');
      if (!body.dueDate) return badRequest('Due date is required');

      const now = new Date().toISOString();
      const reminder = {
        id: `rem_${uuidv4()}`,
        title: sanitizeString(body.title, 200),
        description: sanitizeString(body.description || '', 1000),
        dueDate: body.dueDate,
        userId: decoded.sub,
        priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
        status: 'active',
        recurring: body.recurring || null,
        linkedTo: body.linkedTo || null,
        createdAt: now,
        updatedAt: now
      };

      await createItem('reminders', reminder);
      return jsonResponse({ reminder }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create reminder' }, 500);
    }
  }
});
