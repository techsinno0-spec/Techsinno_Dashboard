const { app } = require('@azure/functions');
const { queryItems, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('projects-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'projects/{projectId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden('Only managers can delete projects');

    const projectId = request.params.projectId;

    try {
      const results = await queryItems(
        'projects',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: projectId }]
      );
      if (results.length === 0) return notFound('Project not found');
      const proj = results[0];

      await deleteItem('projects', proj.id, proj.id);
      await logActivity(decoded.sub, 'project_deleted', `Deleted project "${proj.name}"`, proj.id);

      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Project not found');
      return jsonResponse({ error: 'Failed to delete project' }, 500);
    }
  }
});
