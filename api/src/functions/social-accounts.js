const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');

app.http('social-accounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/accounts',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const accounts = { linkedin: null, facebook: null, instagram: null };

      try {
        const li = await getItem('config', 'cfg_social_linkedin');
        if (li && li.accessToken) {
          accounts.linkedin = {
            connected: true,
            displayName: li.displayName,
            profilePicture: li.profilePicture,
            connectedAt: li.connectedAt,
            expiresAt: li.expiresAt
          };
        }
      } catch {}

      try {
        const meta = await getItem('config', 'cfg_social_meta');
        if (meta && meta.pages && meta.pages.length > 0) {
          const selectedPage = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];
          accounts.facebook = {
            connected: true,
            pageName: selectedPage.name,
            pageId: selectedPage.id,
            connectedAt: meta.connectedAt
          };
          if (selectedPage.igBusinessAccount) {
            accounts.instagram = {
              connected: true,
              igUserId: selectedPage.igBusinessAccount,
              linkedToPage: selectedPage.name,
              connectedAt: meta.connectedAt
            };
          }
        }
      } catch {}

      const isAdmin = decoded.role === 'manager';
      let availablePages = [];
      if (isAdmin) {
        try {
          const meta = await getItem('config', 'cfg_social_meta');
          if (meta && meta.pages) {
            availablePages = meta.pages.map(p => ({
              id: p.id, name: p.name,
              hasInstagram: !!p.igBusinessAccount,
              selected: p.id === meta.selectedPageId
            }));
          }
        } catch {}
      }

      return jsonResponse({ accounts, availablePages, isAdmin });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load accounts' }, 500);
    }
  }
});
