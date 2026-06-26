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
      if (body && body.generatedCard && body.card && typeof body.card === 'object') {
        const source = body.card;
        const year = new Date().getFullYear();
        const existing = await queryItems(
          'job-cards',
          'SELECT VALUE COUNT(1) FROM c WHERE STARTSWITH(c.jobNumber, @prefix)',
          [{ name: '@prefix', value: `JC-${year}-` }]
        );
        const seq = String((existing[0] || 0) + 1).padStart(4, '0');
        const now = new Date().toISOString();
        const jobCard = {
          ...source,
          id: source.id || `jc_${uuidv4()}`,
          jobNumber: source.jobNumber || `JC-${year}-${seq}`,
          title: sanitizeString(source.title || source.jobTitle || 'AI generated job card', 200),
          description: sanitizeString(source.description || source.summary || '', 2000),
          clientName: sanitizeString(source.clientName || source.client || 'Unknown client', 200),
          clientContact: sanitizeString(source.clientContact || '', 200),
          site: sanitizeString(source.site || '', 200),
          status: source.status || 'open',
          assignedTo: Array.isArray(source.assignedTo) ? source.assignedTo : [],
          tasks: Array.isArray(source.tasks) ? source.tasks : [],
          parts: Array.isArray(source.parts) ? source.parts : [],
          notes: Array.isArray(source.notes) ? source.notes : [],
          createdBy: source.createdBy || decoded.sub,
          createdAt: source.createdAt || now,
          updatedAt: now,
          source: source.source || 'electron_ai'
        };

        await createItem('job-cards', jobCard);
        await logActivity(decoded.sub, 'jobcard_created', `Created AI job card ${jobCard.jobNumber}: "${jobCard.title}"`, jobCard.id);
        return jsonResponse({ jobCard }, 201);
      }

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
