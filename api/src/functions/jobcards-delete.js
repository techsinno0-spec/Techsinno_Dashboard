const { app } = require('@azure/functions');
const { queryItems, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('jobcards-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'job-cards/{jobCardId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden('Only managers can delete job cards');

    const jobCardId = request.params.jobCardId;

    try {
      const results = await queryItems(
        'job-cards',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: jobCardId }]
      );
      if (results.length === 0) return notFound('Job card not found');
      const jc = results[0];

      await deleteItem('job-cards', jc.id, jc.id);
      await logActivity(decoded.sub, 'jobcard_deleted', `Deleted job card ${jc.jobNumber}: "${jc.title}"`, jc.id);

      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Job card not found');
      return jsonResponse({ error: 'Failed to delete job card' }, 500);
    }
  }
});
