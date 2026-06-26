const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

const AGENT_QUEUE_ID = 'agent_queue';

app.http('agent-queue-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agent/queue',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const item = await getItem('config', AGENT_QUEUE_ID);
      return jsonResponse({
        success: true,
        queue: item.queue || [],
        lastScan: item.lastScan || null,
        updatedAt: item.updatedAt || null
      });
    } catch (err) {
      if (err.code === 404) return jsonResponse({ success: true, queue: [], lastScan: null });
      return jsonResponse({ error: 'Failed to load agent queue' }, 500);
    }
  }
});
