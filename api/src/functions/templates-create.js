const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_CATEGORIES = ['cold_outreach', 'follow_up', 'quote_sent', 'meeting_request', 'thank_you', 'custom'];

app.http('templates-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body.name || !body.name.trim()) return badRequest('Template name is required');
      if (!body.body || !body.body.trim()) return badRequest('Template body is required');

      const now = new Date().toISOString();
      const template = {
        id: `tpl_${uuidv4()}`,
        name: sanitizeString(body.name, 100),
        category: VALID_CATEGORIES.includes(body.category) ? body.category : 'custom',
        subject: sanitizeString(body.subject || '', 200),
        body: sanitizeString(body.body, 5000),
        createdBy: decoded.sub,
        createdAt: now,
        updatedAt: now
      };

      await createItem('templates', template);
      return jsonResponse({ template }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create template' }, 500);
    }
  }
});
