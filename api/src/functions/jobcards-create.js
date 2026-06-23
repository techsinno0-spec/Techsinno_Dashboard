const { app } = require('@azure/functions');
const { createItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('jobcards-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'job-cards',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden('Only managers can create job cards');

    try {
      const body = await request.json();
      const { title, description, clientName, clientContact, site, assignedTo } = body;

      if (!title || !title.trim()) return badRequest('Job title is required');
      if (!clientName || !clientName.trim()) return badRequest('Client name is required');

      // Generate sequential job number: JC-YYYY-NNNN
      const year = new Date().getFullYear();
      const existing = await queryItems(
        'job-cards',
        'SELECT VALUE COUNT(1) FROM c WHERE STARTSWITH(c.jobNumber, @prefix)',
        [{ name: '@prefix', value: `JC-${year}-` }]
      );
      const seq = String((existing[0] || 0) + 1).padStart(4, '0');
      const jobNumber = `JC-${year}-${seq}`;

      const now = new Date().toISOString();
      const jobCard = {
        id: `jc_${uuidv4()}`,
        jobNumber,
        title: sanitizeString(title, 200),
        description: sanitizeString(description || '', 2000),
        clientName: sanitizeString(clientName, 200),
        clientContact: sanitizeString(clientContact || '', 200),
        site: sanitizeString(site || '', 200),
        status: 'open',
        assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
        tasks: [],
        parts: [],
        notes: [],
        completionSignOff: null,
        createdBy: decoded.sub,
        createdAt: now,
        updatedAt: now
      };

      await createItem('job-cards', jobCard);
      await logActivity(decoded.sub, 'jobcard_created', `Created job card ${jobNumber}: "${jobCard.title}"`, jobCard.id);

      return jsonResponse({ jobCard }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create job card' }, 500);
    }
  }
});
