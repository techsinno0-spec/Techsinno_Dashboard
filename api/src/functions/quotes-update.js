const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { sanitizeString } = require('../../shared/sanitize');

app.http('quotes-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'quotes/{quoteId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const quoteId = request.params.quoteId;

    try {
      const allQuotes = await require('../../shared/cosmos').queryItems(
        'quotes', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: quoteId }]
      );
      const quote = allQuotes[0];
      if (!quote) return notFound('Quote not found');

      const body = await request.json();

      if (body.title !== undefined) quote.title = sanitizeString(body.title, 200);
      if (body.notes !== undefined) quote.notes = sanitizeString(body.notes, 2000);
      if (body.validUntil !== undefined) quote.validUntil = body.validUntil;

      if (body.items && Array.isArray(body.items)) {
        quote.items = body.items.map(i => ({
          description: sanitizeString(i.description || '', 300),
          quantity: Math.max(0, parseFloat(i.quantity) || 1),
          unitPrice: Math.max(0, parseFloat(i.unitPrice) || 0),
          total: Math.max(0, (parseFloat(i.quantity) || 1) * (parseFloat(i.unitPrice) || 0))
        }));
        quote.subtotal = quote.items.reduce((s, i) => s + i.total, 0);
        quote.vatAmount = quote.subtotal * (quote.vatRate / 100);
        quote.grandTotal = quote.subtotal + quote.vatAmount;
      }

      if (body.status !== undefined) {
        const valid = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
        if (valid.includes(body.status)) {
          const old = quote.status;
          quote.status = body.status;
          if (old !== body.status) {
            await logActivity(decoded.sub, 'quote_status', `${quote.quoteNumber}: ${old} → ${body.status}`, quoteId);
          }
        }
      }

      quote.updatedAt = new Date().toISOString();
      await replaceItem('quotes', quoteId, quote, quote.clientId);

      return jsonResponse({ quote });
    } catch (err) {
      if (err.code === 404) return notFound('Quote not found');
      return jsonResponse({ error: 'Failed to update quote' }, 500);
    }
  }
});
