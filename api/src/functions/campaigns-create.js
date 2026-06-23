const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_TYPES = ['cold_outreach', 'social_media', 'referral', 'event', 'content_marketing'];

app.http('campaigns-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'campaigns',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body.name || !body.name.trim()) return badRequest('Campaign name is required');

      const now = new Date().toISOString();
      const campaign = {
        id: `cmp_${uuidv4()}`,
        name: sanitizeString(body.name, 200),
        type: VALID_TYPES.includes(body.type) ? body.type : 'cold_outreach',
        status: 'planning',
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        budget: parseFloat(body.budget) || 0,
        targetAudience: sanitizeString(body.targetAudience || '', 500),
        channels: Array.isArray(body.channels) ? body.channels : [],
        metrics: { sent: 0, opened: 0, replied: 0, leadsGenerated: 0, conversions: 0, revenue: 0 },
        linkedLeads: [],
        createdBy: decoded.sub,
        createdAt: now,
        updatedAt: now
      };

      await createItem('campaigns', campaign);
      await logActivity(decoded.sub, 'campaign_created', `Created campaign: ${campaign.name}`, campaign.id);

      return jsonResponse({ campaign }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create campaign' }, 500);
    }
  }
});
