const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('social-schedule-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'social/schedule',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body.text || !body.text.trim()) return badRequest('Post text is required');
      if (!body.scheduledFor) return badRequest('Scheduled date/time is required');
      if (!body.platforms || !Array.isArray(body.platforms) || body.platforms.length === 0) return badRequest('Select at least one platform');

      if (new Date(body.scheduledFor) <= new Date()) return badRequest('Scheduled time must be in the future');

      if (body.platforms.includes('instagram') && !body.imageUrl) return badRequest('Instagram requires an image URL');

      const now = new Date().toISOString();
      const post = {
        id: `spost_${uuidv4()}`,
        text: sanitizeString(body.text, 3000),
        imageUrl: body.imageUrl || null,
        platforms: body.platforms,
        scheduledFor: body.scheduledFor,
        status: 'scheduled',
        createdBy: decoded.sub,
        createdAt: now,
        postedAt: null,
        error: null
      };

      await createItem('scheduled_posts', post);
      return jsonResponse({ post }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to schedule post' }, 500);
    }
  }
});
