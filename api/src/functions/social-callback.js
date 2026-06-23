const { app } = require('@azure/functions');
const { verifyToken } = require('../../shared/auth');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { getLongLivedMetaToken } = require('../../shared/social');
const axios = require('axios');

app.http('social-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'social/callback/{platform}',
  handler: async (request) => {
    const platform = request.params.platform;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const html = (msg, ok) => ({
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><body><script>
        window.opener && window.opener.postMessage({ type:'social-auth', platform:'${platform}', success:${ok}, message:'${msg}' },'*');
        setTimeout(()=>window.close(),1500);
      </script><p>${msg}</p></body></html>`
    });

    if (error) return html('Authorization denied: ' + error, false);
    if (!code || !state) return html('Missing authorization code', false);

    let decoded;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      decoded = verifyToken(stateData.jwt);
      if (!decoded || decoded.role !== 'manager') return html('Unauthorized', false);
    } catch { return html('Invalid state', false); }

    const base = process.env.SOCIAL_REDIRECT_BASE || 'http://localhost:7071';

    try {
        if (platform === 'linkedin') {
          const linkedInConfig = await getItem('config', 'cfg_linkedin').catch(() => null);
          const clientId = process.env.LINKEDIN_CLIENT_ID || linkedInConfig?.clientId;
          const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || linkedInConfig?.clientSecret;
          if (!clientId || !clientSecret) throw new Error('LinkedIn client credentials not configured');
          const tokenRes = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
              grant_type: 'authorization_code',
              code,
              redirect_uri: `${base}/api/social/callback/linkedin`,
              client_id: clientId,
              client_secret: clientSecret
            }
          });

        const { access_token, expires_in, refresh_token } = tokenRes.data;
        console.log('[LinkedIn] Token exchange OK, expires_in:', expires_in);

        let personId = null, displayName = 'LinkedIn User';
        try {
          console.log('[LinkedIn] Trying /v2/me...');
          const profileRes = await axios.get('https://api.linkedin.com/v2/me', {
            headers: { 'Authorization': `Bearer ${access_token}` }
          });
          console.log('[LinkedIn] /v2/me response:', JSON.stringify(profileRes.data));
          personId = profileRes.data.id;
          displayName = [profileRes.data.localizedFirstName, profileRes.data.localizedLastName].filter(Boolean).join(' ') || 'LinkedIn User';
        } catch (e1) {
          console.log('[LinkedIn] /v2/me FAILED:', e1.response?.status, e1.response?.data ? JSON.stringify(e1.response.data) : e1.message);
          try {
            console.log('[LinkedIn] Trying /v2/userinfo...');
            const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
              headers: { 'Authorization': `Bearer ${access_token}` }
            });
            console.log('[LinkedIn] /v2/userinfo response:', JSON.stringify(profileRes.data));
            personId = profileRes.data.sub;
            displayName = profileRes.data.name || [profileRes.data.given_name, profileRes.data.family_name].filter(Boolean).join(' ') || 'LinkedIn User';
          } catch (e2) {
            console.log('[LinkedIn] /v2/userinfo FAILED:', e2.response?.status, e2.response?.data ? JSON.stringify(e2.response.data) : e2.message);
          }
        }
        if (!personId) {
          try {
            console.log('[LinkedIn] Trying /rest/me...');
            const meRes = await axios.get('https://api.linkedin.com/rest/me', {
              headers: { 'Authorization': `Bearer ${access_token}`, 'LinkedIn-Version': '202502' }
            });
            console.log('[LinkedIn] /rest/me response:', JSON.stringify(meRes.data));
            personId = meRes.data.id || meRes.data.sub;
          } catch (e3) {
            console.log('[LinkedIn] /rest/me FAILED:', e3.response?.status, e3.response?.data ? JSON.stringify(e3.response.data) : e3.message);
          }
        }
        if (!personId) throw new Error('Could not retrieve LinkedIn profile. Ensure your LinkedIn app has the Community Management API product approved.');

        const id = 'cfg_social_linkedin';
        const now = new Date().toISOString();
        const config = {
          id, service: 'social_linkedin',
          accessToken: access_token,
          refreshToken: refresh_token || null,
          expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
          personId,
          personUrn: `urn:li:person:${personId}`,
          displayName,
          profilePicture: null,
          connectedBy: decoded.sub,
          connectedAt: now, updatedAt: now
        };

        let existing;
        try { existing = await getItem('config', id); } catch {}
        if (existing) await replaceItem('config', id, config);
        else await createItem('config', config);

        return html('LinkedIn connected successfully!', true);
      }

      if (platform === 'meta') {
        const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: {
            client_id: process.env.META_APP_ID,
            client_secret: process.env.META_APP_SECRET,
            redirect_uri: `${base}/api/social/callback/meta`,
            code
          }
        });

        const shortToken = tokenRes.data.access_token;
        const longToken = await getLongLivedMetaToken(
          process.env.META_APP_ID, process.env.META_APP_SECRET, shortToken
        );

        const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
          params: { access_token: longToken, fields: 'id,name,access_token,instagram_business_account' }
        });

        const pages = pagesRes.data.data || [];
        const id = 'cfg_social_meta';
        const now = new Date().toISOString();
        const config = {
          id, service: 'social_meta',
          userAccessToken: longToken,
          pages: pages.map(p => ({
            id: p.id, name: p.name, accessToken: p.access_token,
            igBusinessAccount: p.instagram_business_account ? p.instagram_business_account.id : null
          })),
          selectedPageId: pages.length > 0 ? pages[0].id : null,
          connectedBy: decoded.sub,
          connectedAt: now, updatedAt: now
        };

        let existing;
        try { existing = await getItem('config', id); } catch {}
        if (existing) await replaceItem('config', id, config);
        else await createItem('config', config);

        return html('Facebook & Instagram connected successfully!', true);
      }

      return html('Unknown platform', false);
    } catch (err) {
      return html('Connection failed: ' + (err.response?.data?.error_description || err.message), false);
    }
  }
});
