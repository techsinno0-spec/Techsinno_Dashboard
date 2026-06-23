const { app } = require('@azure/functions');
const { deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');

app.http('campaigns-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'campaigns/{campaignId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      await deleteItem('campaigns', request.params.campaignId);
      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Campaign not found');
      return jsonResponse({ error: 'Failed to delete campaign' }, 500);
    }
  }
});
