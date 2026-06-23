const { app } = require('@azure/functions');
const { queryItems, deleteItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, notFound } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('quotes-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'quotes/{quoteId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const quoteId = request.params.quoteId;

    try {
      const results = await queryItems('quotes', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: quoteId }]);
      const quote = results[0];
      if (!quote) return notFound('Quote not found');

      await deleteItem('quotes', quoteId, quote.clientId);
      await logActivity(decoded.sub, 'quote_deleted', `Deleted ${quote.quoteNumber}`, quoteId);

      return jsonResponse({ success: true });
    } catch (err) {
      if (err.code === 404) return notFound('Quote not found');
      return jsonResponse({ error: 'Failed to delete quote' }, 500);
    }
  }
});
