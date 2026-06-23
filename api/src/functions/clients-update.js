const { app } = require('@azure/functions');
const { getItem, replaceItem, createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString, sanitizeEmail } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_STATUSES = ['lead', 'contacted', 'quoted', 'negotiating', 'won', 'lost'];
const VALID_INDUSTRIES = ['manufacturing', 'mining', 'agriculture', 'logistics', 'energy', 'food_processing', 'construction', 'other'];
const VALID_SOURCES = ['linkedin', 'cold_email', 'referral', 'website', 'event', 'other'];
const VALID_INTERACTION_TYPES = ['email', 'call', 'meeting', 'linkedin', 'quote', 'other'];

app.http('clients-update', {
  methods: ['PUT'],
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

      const body = await request.json();

      if (body.addInteraction) {
        const i = body.addInteraction;
        client.interactions = client.interactions || [];
        client.interactions.push({
          date: i.date || new Date().toISOString(),
          type: VALID_INTERACTION_TYPES.includes(i.type) ? i.type : 'other',
          summary: sanitizeString(i.summary || '', 500)
        });
        await logActivity(decoded.sub, 'client_interaction', `Logged ${i.type} with ${client.companyName}`, clientId);
      }

      if (body.companyName !== undefined) client.companyName = sanitizeString(body.companyName, 200);
      if (body.contactName !== undefined) client.contactName = sanitizeString(body.contactName, 200);
      if (body.email !== undefined) client.email = body.email ? sanitizeEmail(body.email) : '';
      if (body.phone !== undefined) client.phone = sanitizeString(body.phone, 30);
      if (body.industry !== undefined && VALID_INDUSTRIES.includes(body.industry)) client.industry = body.industry;
      if (body.source !== undefined && VALID_SOURCES.includes(body.source)) client.source = body.source;
      if (body.estimatedValue !== undefined) client.estimatedValue = parseFloat(body.estimatedValue) || 0;
      if (body.notes !== undefined) client.notes = sanitizeString(body.notes, 2000);
      if (body.followUpDate !== undefined) client.followUpDate = body.followUpDate || null;
      if (body.assignedTo !== undefined) client.assignedTo = body.assignedTo;

      let autoReminder = null;
      if (body.status !== undefined && VALID_STATUSES.includes(body.status)) {
        const old = client.status;
        client.status = body.status;
        if (old !== body.status) {
          await logActivity(decoded.sub, 'client_status', `${client.companyName}: ${old} → ${body.status}`, clientId);

          const reminderDays = { contacted: 3, quoted: 3, negotiating: 5 };
          if (reminderDays[body.status]) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + reminderDays[body.status]);
            const titles = {
              contacted: `Follow up with ${client.companyName}`,
              quoted: `Follow up on quote for ${client.companyName}`,
              negotiating: `Check negotiation status — ${client.companyName}`
            };
            autoReminder = {
              id: uuidv4(),
              title: titles[body.status],
              description: `Auto-created when status changed to ${body.status}. Contact: ${client.contactName || 'N/A'}, Email: ${client.email || 'N/A'}`,
              dueDate: dueDate.toISOString(),
              userId: decoded.sub,
              priority: body.status === 'quoted' ? 'high' : 'medium',
              status: 'active',
              linkedTo: { type: 'client', id: clientId, label: client.companyName },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            try { await createItem('reminders', autoReminder); } catch {}
          }
        }
      }

      client.updatedAt = new Date().toISOString();
      await replaceItem('clients', clientId, client);

      return jsonResponse({ client, autoReminder });
    } catch (err) {
      if (err.code === 404) return notFound('Client not found');
      return jsonResponse({ error: 'Failed to update client' }, 500);
    }
  }
});
