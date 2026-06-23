const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('quotes-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'quotes',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const url = new URL(request.url);
      const clientId = url.searchParams.get('clientId');

      let query, params = [];
      if (clientId) {
        query = 'SELECT * FROM c WHERE c.clientId = @cid ORDER BY c.createdAt DESC';
        params.push({ name: '@cid', value: clientId });
      } else {
        query = 'SELECT * FROM c ORDER BY c.createdAt DESC';
      }

      const quotes = await queryItems('quotes', query, params);
      return jsonResponse({ quotes });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch quotes' }, 500);
    }
  }
});
