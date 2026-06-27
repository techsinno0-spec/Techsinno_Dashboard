const { app } = require('@azure/functions');
const { queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');

app.http('tasks-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const status = request.query.get('status');
      const assignedTo = request.query.get('assignedTo');
      const category = request.query.get('category');
      const priority = request.query.get('priority');

      let query = 'SELECT * FROM c WHERE 1=1';
      const params = [];

      if (decoded.role === 'staff' || decoded.role === 'viewer') {
        query += ' AND c.assignedTo = @userId';
        params.push({ name: '@userId', value: decoded.sub });
      } else if (assignedTo) {
        query += ' AND c.assignedTo = @assignedTo';
        params.push({ name: '@assignedTo', value: assignedTo });
      }

      if (status) {
        query += ' AND c.status = @status';
        params.push({ name: '@status', value: status });
      }
      if (category) {
        query += ' AND c.category = @category';
        params.push({ name: '@category', value: category });
      }
      if (priority) {
        query += ' AND c.priority = @priority';
        params.push({ name: '@priority', value: priority });
      }

      query += ' ORDER BY c.createdAt DESC';

      const tasks = await queryItems('tasks', query, params);

      return jsonResponse({ tasks });
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch tasks' }, 500);
    }
  }
});
