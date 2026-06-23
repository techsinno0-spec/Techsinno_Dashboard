const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized } = require('../../shared/auth');
const axios = require('axios');

app.http('social-conversations', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/conversations',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();

    try {
      const meta = await getItem('config', 'cfg_social_meta').catch(() => null);
      if (!meta || !meta.pages || !meta.pages.length) {
        return jsonResponse({ conversations: [], message: 'Facebook not connected' });
      }

      const page = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];
      const conversations = [];

      // Facebook Page conversations
      try {
        const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}/conversations`, {
          params: {
            fields: 'participants,updated_time,messages.limit(1){message,from,created_time}',
            access_token: page.accessToken,
            limit: 20
          }
        });
        for (const conv of (fbRes.data.data || [])) {
          const lastMsg = conv.messages?.data?.[0];
          const participants = (conv.participants?.data || []).filter(p => p.id !== page.id);
          conversations.push({
            id: conv.id,
            platform: 'facebook',
            participantName: participants[0]?.name || 'Unknown',
            participantId: participants[0]?.id,
            lastMessage: lastMsg?.message || '',
            lastMessageFrom: lastMsg?.from?.name || '',
            updatedAt: conv.updated_time,
            pageId: page.id
          });
        }
      } catch {}

      // Instagram conversations
      if (page.igBusinessAccount) {
        try {
          const igRes = await axios.get(`https://graph.facebook.com/v19.0/${page.igBusinessAccount}/conversations`, {
            params: {
              fields: 'participants,updated_time,messages.limit(1){message,from,timestamp}',
              access_token: page.accessToken,
              platform: 'instagram',
              limit: 20
            }
          });
          for (const conv of (igRes.data.data || [])) {
            const lastMsg = conv.messages?.data?.[0];
            const participants = (conv.participants?.data || []).filter(p => p.id !== page.igBusinessAccount);
            conversations.push({
              id: conv.id,
              platform: 'instagram',
              participantName: participants[0]?.username || participants[0]?.name || 'Unknown',
              participantId: participants[0]?.id,
              lastMessage: lastMsg?.message || '',
              lastMessageFrom: lastMsg?.from?.username || lastMsg?.from?.name || '',
              updatedAt: conv.updated_time || lastMsg?.timestamp,
              igUserId: page.igBusinessAccount
            });
          }
        } catch {}
      }

      conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return jsonResponse({ conversations });
    } catch (err) {
      return jsonResponse({ error: 'Failed to load conversations' }, 500);
    }
  }
});
