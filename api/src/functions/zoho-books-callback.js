const { app } = require('@azure/functions');
const axios = require('axios');
const { getItem, createItem, replaceItem } = require('../../shared/cosmos');
const { verifyToken, isOwner } = require('../../shared/auth');
const { redirectBaseFromRequest } = require('../../shared/oauth-base');

const ZOHO_BOOKS_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com/books/v3' },
  eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu/books/v3' },
  in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in/books/v3' },
  au: { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au/books/v3' },
  jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp/books/v3' }
};

function html(provider, msg, ok) {
  const safe = String(msg || '').replace(/'/g, "\\'");
  return {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage({ type:'zoho-books-auth', provider:'${provider}', success:${ok}, message:'${safe}' },'*');
      setTimeout(()=>window.close(),2000);
    </script><p>${msg}</p></body></html>`
  };
}

function getRegion(region) {
  return ZOHO_BOOKS_REGIONS[region] || ZOHO_BOOKS_REGIONS.com;
}

async function getConfig() {
  try {
    return await getItem('config', 'cfg_zoho_books');
  } catch {
    return null;
  }
}

async function saveConfig(updates) {
  const id = 'cfg_zoho_books';
  const existing = await getConfig();
  const config = existing || { id, service: 'zoho_books' };
  Object.assign(config, updates, { updatedAt: new Date().toISOString() });
  if (existing) await replaceItem('config', id, config);
  else await createItem('config', config);
  return config;
}

app.http('zoho-books-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zoho-books/callback',
  handler: async (request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) return html('zoho_books', 'Authorization denied: ' + error, false);
    if (!code || !state) return html('zoho_books', 'Missing authorization code', false);

    let decoded;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      decoded = verifyToken(stateData.jwt);
      if (!isOwner(decoded)) return html('zoho_books', 'Owner access required', false);
    } catch {
      return html('zoho_books', 'Invalid state', false);
    }

    try {
      const cfg = await getConfig();
      const clientId = process.env.ZOHO_BOOKS_CLIENT_ID || cfg?.clientId;
      const clientSecret = process.env.ZOHO_BOOKS_CLIENT_SECRET || cfg?.clientSecret;
      if (!clientId || !clientSecret) throw new Error('Zoho Books credentials not configured');

      const base = redirectBaseFromRequest(request);
      const redirectUri = `${base}/api/zoho-books/callback`;
      const location = url.searchParams.get('location');
      const regionMap = { us: 'com', eu: 'eu', in: 'in', au: 'au', jp: 'jp' };
      let detectedRegion = regionMap[(location || '').toLowerCase()] || cfg?.region || 'com';
      const regionsToTry = [detectedRegion];
      ['com', 'eu', 'in', 'au', 'jp'].forEach(r => { if (!regionsToTry.includes(r)) regionsToTry.push(r); });

      let tokenData = null;
      for (const regionKey of regionsToTry) {
        try {
          const region = getRegion(regionKey);
          const p = new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri
          });
          const r = await axios.post(`${region.accounts}/oauth/v2/token`, p.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          if (r.data.access_token) {
            tokenData = r.data;
            detectedRegion = regionKey;
            break;
          }
        } catch {}
      }

      if (!tokenData?.access_token) throw new Error('Token exchange failed — check Client ID, Client Secret, region, and redirect URI');

      const updates = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || cfg?.refreshToken,
        tokenExpiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
        region: detectedRegion,
        connected: true,
        connectedBy: decoded.sub
      };

      try {
        const region = getRegion(detectedRegion);
        const orgs = await axios.get(`${region.api}/organizations`, {
          headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` }
        });
        const org = (orgs.data.organizations || [])[0];
        if (org?.organization_id) {
          updates.orgId = org.organization_id;
          updates.orgName = org.name;
        }
      } catch {}

      await saveConfig(updates);
      return html('zoho_books', 'Zoho Books connected successfully!', true);
    } catch (err) {
      return html('zoho_books', 'Connection failed: ' + (err.response?.data?.error_description || err.message), false);
    }
  }
});
