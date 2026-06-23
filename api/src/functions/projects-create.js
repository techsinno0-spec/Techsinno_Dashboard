const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_STATUSES = ['planning', 'active', 'on_hold', 'completed'];

app.http('projects-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'projects',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden('Only managers can create projects');

    try {
      const body = await request.json();
      const { name, description, clientName, status, startDate, targetDate, assignedTo } = body;

      if (!name || !name.trim()) return badRequest('Project name is required');
      if (!clientName || !clientName.trim()) return badRequest('Client name is required');

      const now = new Date().toISOString();
      const project = {
        id: `prj_${uuidv4()}`,
        name: sanitizeString(name, 200),
        description: sanitizeString(description || '', 2000),
        clientName: sanitizeString(clientName, 200),
        status: VALID_STATUSES.includes(status) ? status : 'planning',
        startDate: startDate || null,
        targetDate: targetDate || null,
        assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
        phases: [],
        notes: [],
        linkedJobCards: [],
        createdBy: decoded.sub,
        createdAt: now,
        updatedAt: now
      };

      await createItem('projects', project);
      await logActivity(decoded.sub, 'project_created', `Created project "${project.name}"`, project.id);

      return jsonResponse({ project }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create project' }, 500);
    }
  }
});
