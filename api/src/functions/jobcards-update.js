const { app } = require('@azure/functions');
const { queryItems, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_STATUSES = ['open', 'in_progress', 'on_hold', 'completed'];

app.http('jobcards-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'job-cards/{jobCardId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const jobCardId = request.params.jobCardId;

    try {
      const results = await queryItems(
        'job-cards',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: jobCardId }]
      );
      if (results.length === 0) return notFound('Job card not found');
      const jc = results[0];

      // Staff can only update if assigned
      if (decoded.role === 'staff' && !(jc.assignedTo || []).includes(decoded.sub)) {
        return forbidden('You are not assigned to this job card');
      }

      const body = await request.json();
      const now = new Date().toISOString();

      // ── Status update ──────────────────────────────────────────────────────
      if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) return badRequest('Invalid status');
        jc.status = body.status;
      }

      // ── Manager-only field updates ─────────────────────────────────────────
      if (decoded.role === 'manager') {
        if (body.title !== undefined) jc.title = sanitizeString(body.title, 200);
        if (body.description !== undefined) jc.description = sanitizeString(body.description, 2000);
        if (body.clientName !== undefined) jc.clientName = sanitizeString(body.clientName, 200);
        if (body.clientContact !== undefined) jc.clientContact = sanitizeString(body.clientContact, 200);
        if (body.site !== undefined) jc.site = sanitizeString(body.site, 200);
        if (Array.isArray(body.assignedTo)) jc.assignedTo = body.assignedTo;

        // Sign-off
        if (body.signOff === true) {
          jc.completionSignOff = { by: decoded.sub, byName: decoded.name, at: now };
          jc.status = 'completed';
        }
      }

      // ── Add task (manager only) ────────────────────────────────────────────
      if (body.addTask && decoded.role === 'manager') {
        const { title, assignedTo } = body.addTask;
        if (!title || !title.trim()) return badRequest('Task title is required');
        jc.tasks = jc.tasks || [];
        jc.tasks.push({
          id: `jct_${uuidv4()}`,
          title: sanitizeString(title, 200),
          assignedTo: assignedTo || null,
          status: 'pending',
          createdAt: now
        });
      }

      // ── Update task status (manager or assigned user) ───────────────────────
      if (body.updateTask) {
        const { taskId, status } = body.updateTask;
        const task = (jc.tasks || []).find(t => t.id === taskId);
        if (!task) return notFound('Task not found in job card');
        if (decoded.role === 'staff' && task.assignedTo !== decoded.sub) {
          return forbidden('You are not assigned to this task');
        }
        if (!['pending', 'in_progress', 'done'].includes(status)) return badRequest('Invalid task status');
        task.status = status;
        task.updatedAt = now;
      }

      // ── Delete task (manager only) ─────────────────────────────────────────
      if (body.deleteTask && decoded.role === 'manager') {
        jc.tasks = (jc.tasks || []).filter(t => t.id !== body.deleteTask);
      }

      // ── Add part (manager only) ────────────────────────────────────────────
      if (body.addPart && decoded.role === 'manager') {
        const { name, qty, note } = body.addPart;
        if (!name || !name.trim()) return badRequest('Part name is required');
        jc.parts = jc.parts || [];
        jc.parts.push({
          name: sanitizeString(name, 200),
          qty: sanitizeString(qty || '', 50),
          note: sanitizeString(note || '', 500),
          addedAt: now,
          addedBy: decoded.sub
        });
      }

      // ── Delete part (manager only) ─────────────────────────────────────────
      if (typeof body.deletePart === 'number' && decoded.role === 'manager') {
        jc.parts = (jc.parts || []).filter((_, i) => i !== body.deletePart);
      }

      // ── Add note (any assigned user or manager) ───────────────────────────
      if (body.addNote) {
        const text = sanitizeString(body.addNote, 2000);
        if (text) {
          jc.notes = jc.notes || [];
          jc.notes.push({
            id: `jcn_${uuidv4()}`,
            author: decoded.sub,
            authorName: decoded.name,
            text,
            timestamp: now
          });
        }
      }

      jc.updatedAt = now;
      await replaceItem('job-cards', jc.id, jc, jc.id);
      await logActivity(decoded.sub, 'jobcard_updated', `Updated job card ${jc.jobNumber}`, jc.id);

      return jsonResponse({ jobCard: jc });
    } catch (err) {
      if (err.code === 404) return notFound('Job card not found');
      return jsonResponse({ error: 'Failed to update job card' }, 500);
    }
  }
});
