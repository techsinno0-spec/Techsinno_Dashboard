const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');

app.http('campaigns-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'campaigns/{campaignId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const campaignId = request.params.campaignId;

    try {
      const campaign = await getItem('campaigns', campaignId);
      if (!campaign) return notFound('Campaign not found');

      const body = await request.json();
      if (body.name !== undefined) campaign.name = sanitizeString(body.name, 200);
      if (body.type !== undefined) campaign.type = body.type;
      if (body.status !== undefined && ['planning', 'active', 'paused', 'completed'].includes(body.status)) campaign.status = body.status;
      if (body.startDate !== undefined) campaign.startDate = body.startDate;
      if (body.endDate !== undefined) campaign.endDate = body.endDate;
      if (body.budget !== undefined) campaign.budget = parseFloat(body.budget) || 0;
      if (body.targetAudience !== undefined) campaign.targetAudience = sanitizeString(body.targetAudience, 500);
      if (body.channels !== undefined) campaign.channels = body.channels;

      if (body.metrics) {
        campaign.metrics = { ...campaign.metrics, ...body.metrics };
      }
      if (body.addLead) {
        campaign.linkedLeads = campaign.linkedLeads || [];
        if (!campaign.linkedLeads.includes(body.addLead)) campaign.linkedLeads.push(body.addLead);
      }

      campaign.updatedAt = new Date().toISOString();
      await replaceItem('campaigns', campaignId, campaign);

      return jsonResponse({ campaign });
    } catch (err) {
      if (err.code === 404) return notFound('Campaign not found');
      return jsonResponse({ error: 'Failed to update campaign' }, 500);
    }
  }
});
