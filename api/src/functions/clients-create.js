const { app } = require('@azure/functions');
const { createItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString, sanitizeEmail } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

const VALID_INDUSTRIES = ['manufacturing', 'mining', 'agriculture', 'logistics', 'energy', 'food_processing', 'construction', 'other'];
const VALID_SOURCES = ['linkedin', 'cold_email', 'referral', 'website', 'event', 'other'];
const VALID_STATUSES = ['lead', 'contacted', 'quoted', 'negotiating', 'won', 'lost'];

app.http('clients-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'clients',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      const { companyName, contactName, email, phone, industry, source, estimatedValue, notes, followUpDate, assignedTo } = body;

      if (!companyName || !companyName.trim()) return badRequest('Company name is required');

      const now = new Date().toISOString();
      const client = {
        id: `cli_${uuidv4()}`,
        companyName: sanitizeString(companyName, 200),
        contactName: sanitizeString(contactName || '', 200),
        email: email ? sanitizeEmail(email) : '',
        phone: sanitizeString(phone || '', 30),
        industry: VALID_INDUSTRIES.includes(industry) ? industry : 'other',
        source: VALID_SOURCES.includes(source) ? source : 'other',
        status: 'lead',
        estimatedValue: parseFloat(estimatedValue) || 0,
        notes: sanitizeString(notes || '', 2000),
        followUpDate: followUpDate || null,
        assignedTo: assignedTo || decoded.sub,
        interactions: [],
        createdAt: now,
        updatedAt: now
      };

      await createItem('clients', client);
      await logActivity(decoded.sub, 'client_created', `Added lead: ${client.companyName}`, client.id);

      return jsonResponse({ client }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create client' }, 500);
    }
  }
});
