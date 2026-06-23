const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');

app.http('social-select-page', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'social/pages/select',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      const { pageId } = body;
      if (!pageId) return badRequest('pageId is required');

      const meta = await getItem('config', 'cfg_social_meta');
      if (!meta || !meta.pages) return badRequest('Facebook not connected');

      const page = meta.pages.find(p => p.id === pageId);
      if (!page) return badRequest('Page not found');

      meta.selectedPageId = pageId;
      meta.updatedAt = new Date().toISOString();
      await replaceItem('config', 'cfg_social_meta', meta);

      await logActivity(decoded.sub, 'social_config', `Selected page: ${page.name}`);

      return jsonResponse({
        success: true,
        pageName: page.name,
        hasInstagram: !!page.igBusinessAccount
      });
    } catch (err) {
      if (err.code === 404) return badRequest('Facebook not connected');
      return jsonResponse({ error: 'Failed to update page selection' }, 500);
    }
  }
});
