const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { postToLinkedIn, postToFacebook, postToInstagram } = require('../../shared/social');

app.http('social-post', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'social/post',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      const body = await request.json();
      const { text, imageUrl, mediaData, mediaType, platforms } = body;

      if (!text || !text.trim()) return badRequest('Post text is required');
      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return badRequest('Select at least one platform');
      }

      const results = [];
      const errors = [];

      if (platforms.includes('linkedin')) {
        try {
          const li = await getItem('config', 'cfg_social_linkedin');
          if (!li || !li.accessToken) throw new Error('LinkedIn not connected');
          const r = await postToLinkedIn(li.accessToken, li.personUrn, text.trim(), imageUrl || null, mediaData || null);
          results.push(r);
        } catch (err) {
          errors.push({ platform: 'linkedin', error: err.response?.data?.message || err.response?.data?.error || err.message });
        }
      }

      if (platforms.includes('facebook')) {
        try {
          const meta = await getItem('config', 'cfg_social_meta');
          if (!meta || !meta.pages || meta.pages.length === 0) throw new Error('Facebook not connected');
          const page = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];
          const r = await postToFacebook(page.accessToken, page.id, text.trim(), imageUrl || null, mediaData || null);
          results.push(r);
        } catch (err) {
          errors.push({ platform: 'facebook', error: err.response?.data?.error?.message || err.message });
        }
      }

      if (platforms.includes('instagram')) {
        try {
          if (!imageUrl && !mediaData) throw new Error('Instagram requires an image');
          const meta = await getItem('config', 'cfg_social_meta');
          if (!meta || !meta.pages || meta.pages.length === 0) throw new Error('Instagram not connected');
          const page = meta.pages.find(p => p.id === meta.selectedPageId) || meta.pages[0];
          if (!page.igBusinessAccount) throw new Error('No Instagram business account linked to this page');
          const r = await postToInstagram(page.accessToken, page.igBusinessAccount, text.trim(), imageUrl, mediaData || null, page.id);
          results.push(r);
        } catch (err) {
          errors.push({ platform: 'instagram', error: err.response?.data?.error?.message || err.message });
        }
      }

      const posted = results.map(r => r.platform).join(', ');
      if (posted) {
        await logActivity(decoded.sub, 'social_post', `Posted to ${posted}: "${text.trim().substring(0, 60)}..."`);
      }

      return jsonResponse({
        success: errors.length === 0,
        results,
        errors,
        message: errors.length === 0
          ? `Posted to ${results.length} platform(s)`
          : `${results.length} succeeded, ${errors.length} failed`
      });
    } catch (err) {
      return jsonResponse({ error: 'Failed to create post' }, 500);
    }
  }
});
