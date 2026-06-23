const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, badRequest } = require('../../shared/auth');
const axios = require('axios');

app.http('social-messages-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/messages/{conversationId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const conversationId = request.params.conversationId;
    const url = new URL(request.url);
    const platform = url.searchParams.get('platform') || 'facebook';

    try {
      const meta = await getItem('config', 'cfg_social_meta');
      if (!meta || !meta.pages || !meta.pages.length) return badRequest('Facebook not connected');
      const page = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];

      const res = await axios.get(`https://graph.facebook.com/v19.0/${conversationId}/messages`, {
        params: {
          fields: 'message,from,created_time,attachments',
          access_token: page.accessToken,
          limit: 25
        }
      });

      const pageId = platform === 'instagram' ? page.igBusinessAccount : page.id;
      const messages = (res.data.data || []).map(m => ({
        id: m.id,
        text: m.message || '',
        from: m.from?.name || m.from?.username || 'Unknown',
        fromId: m.from?.id,
        isPage: m.from?.id === pageId,
        createdAt: m.created_time,
        attachments: m.attachments?.data || []
      })).reverse();

      return jsonResponse({ messages });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load messages' }, 500);
    }
  }
});

app.http('social-messages-send', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'social/messages/{conversationId}',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    const conversationId = request.params.conversationId;
    const body = await request.json();
    const { text, platform, recipientId } = body;

    if (!text || !text.trim()) return badRequest('Message text is required');

    try {
      const meta = await getItem('config', 'cfg_social_meta');
      if (!meta || !meta.pages || !meta.pages.length) return badRequest('Facebook not connected');
      const page = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];

      if (platform === 'instagram') {
        await axios.post(`https://graph.facebook.com/v19.0/${page.igBusinessAccount}/messages`, null, {
          params: {
            recipient: JSON.stringify({ id: recipientId }),
            message: JSON.stringify({ text: text.trim() }),
            access_token: page.accessToken
          }
        });
      } else {
        await axios.post(`https://graph.facebook.com/v19.0/${conversationId}/messages`, null, {
          params: {
            message: text.trim(),
            access_token: page.accessToken
          }
        });
      }

      return jsonResponse({ success: true });
    } catch (err) {
      return jsonResponse({ error: err.response?.data?.error?.message || err.message }, 500);
    }
  }
});
