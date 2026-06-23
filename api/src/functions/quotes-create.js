const { app } = require('@azure/functions');
const { createItem, queryItems } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('quotes-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'quotes',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      if (!body.clientId) return badRequest('Client is required');
      if (!body.title || !body.title.trim()) return badRequest('Quote title is required');
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) return badRequest('At least one line item is required');

      const existing = await queryItems('quotes', 'SELECT VALUE COUNT(1) FROM c');
      const num = (existing[0] || 0) + 1;

      const items = body.items.map(i => ({
        description: sanitizeString(i.description || '', 300),
        quantity: Math.max(0, parseFloat(i.quantity) || 1),
        unitPrice: Math.max(0, parseFloat(i.unitPrice) || 0),
        total: Math.max(0, (parseFloat(i.quantity) || 1) * (parseFloat(i.unitPrice) || 0))
      }));

      const subtotal = items.reduce((s, i) => s + i.total, 0);
      const vatRate = body.vatRate !== undefined ? parseFloat(body.vatRate) : 15;
      const vatAmount = subtotal * (vatRate / 100);

      const now = new Date().toISOString();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      const quote = {
        id: `qte_${uuidv4()}`,
        quoteNumber: `QTE-${String(num).padStart(3, '0')}`,
        clientId: body.clientId,
        clientName: sanitizeString(body.clientName || '', 200),
        title: sanitizeString(body.title, 200),
        items,
        subtotal,
        vatRate,
        vatAmount,
        grandTotal: subtotal + vatAmount,
        validUntil: body.validUntil || validUntil.toISOString(),
        status: 'draft',
        notes: sanitizeString(body.notes || '', 2000),
        createdBy: decoded.sub,
        createdAt: now,
        updatedAt: now
      };

      await createItem('quotes', quote);
      await logActivity(decoded.sub, 'quote_created', `Created ${quote.quoteNumber} for ${quote.clientName}: R${Math.round(quote.grandTotal)}`, quote.id);

      return jsonResponse({ quote }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create quote' }, 500);
    }
  }
});
