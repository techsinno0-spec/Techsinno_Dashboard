const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('recurring-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks/recurring',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body.title || !body.title.trim()) return badRequest('Title is required');
      if (!body.assignedTo) return badRequest('assignedTo is required');
      if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) return badRequest('Frequency must be daily, weekly, or monthly');

      const now = new Date().toISOString();
      const rule = {
        id: `rtsk_${uuidv4()}`,
        title: sanitizeString(body.title, 200),
        description: sanitizeString(body.description || '', 2000),
        category: ['admin', 'repair', 'auto', 'iot', 'general'].includes(body.category) ? body.category : 'general',
        priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
        assignedTo: body.assignedTo,
        frequency: body.frequency,
        dayOfWeek: body.frequency === 'weekly' ? (parseInt(body.dayOfWeek) || 1) : null,
        dayOfMonth: body.frequency === 'monthly' ? (parseInt(body.dayOfMonth) || 1) : null,
        time: body.time || '09:00',
        active: true,
        lastCreatedDate: null,
        createdBy: decoded.sub,
        createdAt: now
      };

      await createItem('recurring_tasks', rule);
      return jsonResponse({ rule }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create recurring rule' }, 500);
    }
  }
});
