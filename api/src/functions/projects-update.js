const { app } = require('@azure/functions');
const { queryItems, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_STATUSES = ['planning', 'active', 'on_hold', 'completed'];
const VALID_PHASE_STATUSES = ['pending', 'in_progress', 'done'];

app.http('projects-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'projects/{projectId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role === 'viewer') return forbidden('View-only users cannot update projects');

    const projectId = request.params.projectId;

    try {
      const results = await queryItems(
        'projects',
        'SELECT * FROM c WHERE c.id = @id',
        [{ name: '@id', value: projectId }]
      );
      if (results.length === 0) return notFound('Project not found');
      const proj = results[0];

      // Staff can only update if assigned
      if (decoded.role === 'staff' && !(proj.assignedTo || []).includes(decoded.sub)) {
        return forbidden('You are not assigned to this project');
      }

      const body = await request.json();
      const now = new Date().toISOString();

      // ── Status ────────────────────────────────────────────────────────────
      if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) return badRequest('Invalid status');
        proj.status = body.status;
      }

      // ── Manager-only field updates ────────────────────────────────────────
      if (decoded.role === 'manager') {
        if (body.name !== undefined) proj.name = sanitizeString(body.name, 200);
        if (body.description !== undefined) proj.description = sanitizeString(body.description, 2000);
        if (body.clientName !== undefined) proj.clientName = sanitizeString(body.clientName, 200);
        if (body.startDate !== undefined) proj.startDate = body.startDate;
        if (body.targetDate !== undefined) proj.targetDate = body.targetDate;
        if (Array.isArray(body.assignedTo)) proj.assignedTo = body.assignedTo;
        if (Array.isArray(body.linkedJobCards)) proj.linkedJobCards = body.linkedJobCards;

        // Add phase
        if (body.addPhase) {
          const { name, dueDate } = body.addPhase;
          if (!name || !name.trim()) return badRequest('Phase name is required');
          proj.phases = proj.phases || [];
          proj.phases.push({
            id: `ph_${uuidv4()}`,
            name: sanitizeString(name, 200),
            dueDate: dueDate || null,
            status: 'pending',
            createdAt: now
          });
        }

        // Delete phase
        if (typeof body.deletePhase === 'number') {
          proj.phases = (proj.phases || []).filter((_, i) => i !== body.deletePhase);
        }
      }

      // ── Update phase status (manager or assigned staff) ───────────────────
      if (body.updatePhase) {
        const { index, status } = body.updatePhase;
        if (!VALID_PHASE_STATUSES.includes(status)) return badRequest('Invalid phase status');
        if (!proj.phases || !proj.phases[index]) return notFound('Phase not found');
        proj.phases[index].status = status;
        proj.phases[index].updatedAt = now;
      }

      // ── Add note (any assigned user or manager) ───────────────────────────
      if (body.addNote) {
        const text = sanitizeString(body.addNote, 2000);
        if (text) {
          proj.notes = proj.notes || [];
          proj.notes.push({
            id: `pn_${uuidv4()}`,
            author: decoded.sub,
            authorName: decoded.name,
            text,
            timestamp: now
          });
        }
      }

      proj.updatedAt = now;
      await replaceItem('projects', proj.id, proj, proj.id);
      await logActivity(decoded.sub, 'project_updated', `Updated project "${proj.name}"`, proj.id);

      return jsonResponse({ project: proj });
    } catch (err) {
      if (err.code === 404) return notFound('Project not found');
      return jsonResponse({ error: 'Failed to update project' }, 500);
    }
  }
});
