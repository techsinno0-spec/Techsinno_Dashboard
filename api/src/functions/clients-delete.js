const { app } = require('@azure/functions');
const { deleteItem, getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('clients-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'clients/{clientId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const clientId = request.params.clientId;

    try {
      const client = await getItem('clients', clientId);
      if (!client) return notFound('Client not found');

      await deleteItem('clients', clientId);
      await logActivity(decoded.sub, 'client_deleted', `Deleted client: ${client.companyName}`, clientId);

      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Client not found');
      return jsonResponse({ error: 'Failed to delete client' }, 500);
    }
  }
});
