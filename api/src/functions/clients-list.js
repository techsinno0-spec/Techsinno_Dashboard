const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('clients-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'clients',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');

      let query = 'SELECT * FROM c';
      const params = [];

      if (decoded.role === 'staff') {
        query += ' WHERE c.assignedTo = @uid';
        params.push({ name: '@uid', value: decoded.sub });
        if (status) {
          query += ' AND c.status = @status';
          params.push({ name: '@status', value: status });
        }
      } else if (status) {
        query += ' WHERE c.status = @status';
        params.push({ name: '@status', value: status });
      }

      query += ' ORDER BY c.updatedAt DESC';

      const clients = await queryItems('clients', query, params);
      return jsonResponse({ clients });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch clients' }, 500);
    }
  }
});
