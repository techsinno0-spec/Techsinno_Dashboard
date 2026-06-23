const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');

const VALID_CATEGORIES = ['cold_outreach', 'follow_up', 'quote_sent', 'meeting_request', 'thank_you', 'custom'];

app.http('templates-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'templates/{templateId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const templateId = request.params.templateId;

    try {
      const template = await getItem('templates', templateId);
      if (!template) return notFound('Template not found');

      const body = await request.json();
      if (body.name !== undefined) template.name = sanitizeString(body.name, 100);
      if (body.category !== undefined && VALID_CATEGORIES.includes(body.category)) template.category = body.category;
      if (body.subject !== undefined) template.subject = sanitizeString(body.subject, 200);
      if (body.body !== undefined) template.body = sanitizeString(body.body, 5000);
      template.updatedAt = new Date().toISOString();

      await replaceItem('templates', templateId, template);
      return jsonResponse({ template });
    } catch (err) {
      if (err.code === 404) return notFound('Template not found');
      return jsonResponse({ error: 'Failed to update template' }, 500);
    }
  }
});
