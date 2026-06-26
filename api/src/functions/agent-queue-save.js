const { app } = require('@azure/functions');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');

const AGENT_QUEUE_ID = 'agent_queue';

app.http('agent-queue-save', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'agent/queue',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body || !Array.isArray(body.queue)) return badRequest('queue array is required');
      const now = new Date().toISOString();
      const item = {
        id: AGENT_QUEUE_ID,
        service: 'agent_queue',
        queue: body.queue.slice(0, 300),
        lastScan: body.lastScan || null,
        updatedAt: now,
        updatedBy: decoded.sub
      };

      let existing = null;
      try { existing = await getItem('config', AGENT_QUEUE_ID); } catch {}
      if (existing) await replaceItem('config', AGENT_QUEUE_ID, { ...existing, ...item });
      else await createItem('config', item);

      return jsonResponse({ success: true, updatedAt: now });
    } catch {
      return jsonResponse({ error: 'Failed to save agent queue' }, 500);
    }
  }
});
