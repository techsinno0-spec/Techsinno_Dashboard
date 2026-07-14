const { app } = require('@azure/functions');
const { isManagerOrOwner } = require('../../shared/auth');
const { getEmailConfig, saveEmailConfig, GMAIL_TOKEN_URL, MS_TOKEN_URL, ZOHO_REGIONS } = require('../../shared/email');
const { redirectBaseFromRequest } = require('../../shared/oauth-base');
const { readOAuthState } = require('../../shared/oauth-state');
const axios = require('axios');

function zohoTokenError(err, region, redirectUri) {
  const data = err.response?.data;
  const code = data?.error || data?.error_code || err.response?.status || 'unknown_error';
  const detail = data?.error_description || data?.message || (typeof data === 'string' ? data : '') || err.message;
  return `Zoho token exchange failed (${region}, ${redirectUri}): ${code}${detail ? ' - ' + detail : ''}`;
}

app.http('email-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/callback/{provider}',
  handler: async (request) => {
    const provider = request.params.provider;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const html = (msg, ok) => ({
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><body><script>
        window.opener && window.opener.postMessage({ type:'email-auth', provider:'${provider}', success:${ok}, message:'${msg.replace(/'/g, "\\'")}' },'*');
        setTimeout(()=>window.close(),2000);
      </script><p>${msg}</p></body></html>`
    });

    if (error) return html('Authorization denied: ' + error, false);
    if (!code || !state) return html('Missing authorization code', false);

    let decoded;
    let stateData;
    try {
      stateData = await readOAuthState(state, provider);
      decoded = {
        sub: stateData.userId,
        role: stateData.role,
        accountRole: stateData.accountRole,
        isOwner: stateData.isOwner
      };
      if (!isManagerOrOwner(decoded)) return html('Unauthorized', false);
    } catch (err) { return html(err.message || 'Invalid state', false); }

    const base = redirectBaseFromRequest(request);

    try {
      if (provider === 'gmail') {
        const cfg = await getEmailConfig('gmail');
        const clientId = process.env.GMAIL_CLIENT_ID || cfg?.clientId;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET || cfg?.clientSecret;
        if (!clientId || !clientSecret) throw new Error('Gmail credentials not configured');

        const redirectUri = stateData.context?.redirectUri || `${base}/api/email/callback/gmail`;
        const p = new URLSearchParams({
          code, grant_type: 'authorization_code',
          client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri
        });
        const tokenRes = await axios.post(GMAIL_TOKEN_URL, p.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token, refresh_token, expires_in } = tokenRes.data;

        let email = 'Gmail User';
        try {
          const profile = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          email = profile.data.emailAddress || email;
        } catch {}

        await saveEmailConfig('gmail', {
          accessToken: access_token,
          refreshToken: refresh_token || cfg?.refreshToken,
          tokenExpiry: Date.now() + expires_in * 1000,
          email,
          connectedBy: decoded.sub,
          reconnectRequired: false,
          lastAuthError: null
        });

        return html('Gmail connected successfully!', true);
      }

      if (provider === 'outlook') {
        const cfg = await getEmailConfig('outlook');
        const clientId = process.env.MS_CLIENT_ID || cfg?.clientId;
        const clientSecret = process.env.MS_CLIENT_SECRET || cfg?.clientSecret;
        if (!clientId || !clientSecret) throw new Error('Outlook credentials not configured');

        const redirectUri = stateData.context?.redirectUri || `${base}/api/email/callback/outlook`;
        const p = new URLSearchParams({
          code, grant_type: 'authorization_code',
          client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, scope: 'Mail.Read Mail.Send offline_access'
        });
        const tokenRes = await axios.post(MS_TOKEN_URL, p.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token, refresh_token, expires_in } = tokenRes.data;

        let email = 'Outlook User';
        try {
          const me = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${access_token}` }
          });
          email = me.data.mail || me.data.userPrincipalName || email;
        } catch {}

        await saveEmailConfig('outlook', {
          accessToken: access_token,
          refreshToken: refresh_token || cfg?.refreshToken,
          tokenExpiry: Date.now() + expires_in * 1000,
          email,
          connectedBy: decoded.sub,
          connected: true,
          reconnectRequired: false,
          lastAuthError: null
        });

        return html('Outlook connected successfully!', true);
      }

      if (provider === 'zoho_mail') {
        const cfg = await getEmailConfig('zoho_mail');
        const clientId = process.env.ZOHO_MAIL_CLIENT_ID || cfg?.clientId;
        const clientSecret = process.env.ZOHO_MAIL_CLIENT_SECRET || cfg?.clientSecret;
        if (!clientId || !clientSecret) throw new Error('Zoho Mail credentials not configured');

        const redirectUri = stateData.context?.redirectUri || `${base}/api/email/callback/zoho_mail`;
        const location = url.searchParams.get('location');
        let detectedRegion = stateData.context?.region || cfg?.region || 'com';
        if (location) {
          const regionMap = { us: 'com', eu: 'eu', in: 'in', au: 'au', jp: 'jp' };
          detectedRegion = regionMap[location.toLowerCase()] || location.toLowerCase();
        }

        let tokenData = null;
        const tokenErrors = [];
        const regionsToTry = [detectedRegion];
        ['com', 'eu', 'in', 'au', 'jp'].forEach(r => { if (!regionsToTry.includes(r)) regionsToTry.push(r); });

        for (const region of regionsToTry) {
          try {
            const tokenUrl = ZOHO_REGIONS[region].accounts + '/oauth/v2/token';
            const p = new URLSearchParams({
              code, grant_type: 'authorization_code',
              client_id: clientId, client_secret: clientSecret,
              redirect_uri: redirectUri
            });
            const r = await axios.post(tokenUrl, p.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            if (r.data.access_token) {
              tokenData = r.data;
              detectedRegion = region;
              break;
            }
          } catch (err) {
            tokenErrors.push(zohoTokenError(err, region, redirectUri));
          }
        }

        if (!tokenData?.access_token) throw new Error(tokenErrors[0] || 'Zoho token exchange returned no access token');

        const updates = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || cfg?.refreshToken,
          tokenExpiry: Date.now() + (tokenData.expires_in || 3600) * 1000,
          region: detectedRegion,
          connectedBy: decoded.sub
        };

        const zohoRegion = ZOHO_REGIONS[detectedRegion];
        const apiRegionsToTry = [detectedRegion];
        ['com', 'eu', 'in', 'au', 'jp'].forEach(r => { if (!apiRegionsToTry.includes(r)) apiRegionsToTry.push(r); });

        for (const region of apiRegionsToTry) {
          try {
            const apiBase = ZOHO_REGIONS[region].mail + '/api';
            const acctRes = await axios.get(`${apiBase}/accounts`, {
              headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` }
            });
            const accounts = Array.isArray(acctRes.data.data) ? acctRes.data.data.filter(a => a?.accountId) : [];
            const acct = accounts[0];
            if (acct?.accountId) {
              updates.region = region;
              updates.accountId = acct.accountId;
              updates.accounts = accounts.map(a => ({
                accountId: a.accountId,
                primaryEmailAddress: a.primaryEmailAddress || a.emailAddress || '',
                email: a.emailAddress || a.primaryEmailAddress || '',
                name: a.accountDisplayName || a.displayName || a.primaryEmailAddress || '',
                aliases: [
                  ...(a.sendMailDetails || []).map(s => ({
                    address: s.fromAddress,
                    name: s.displayName || s.fromAddress,
                    isDefault: !!(s.isDefault || s.isPrimary)
                  })),
                  ...(Array.isArray(a.emailAddress) ? a.emailAddress.map(e => ({
                    address: e.mailId || e.emailAddress || e.address,
                    name: e.mailId || e.emailAddress || e.address,
                    isDefault: !!e.isPrimary
                  })) : [])
                ].filter(alias => alias.address)
              }));
              const sends = accounts.flatMap(a => [
                ...(a.sendMailDetails || []).map(s => ({
                  address: s.fromAddress,
                  name: s.displayName || s.fromAddress,
                  isDefault: !!(s.isDefault || s.isPrimary)
                })),
                ...(Array.isArray(a.emailAddress) ? a.emailAddress.map(e => ({
                  address: e.mailId || e.emailAddress || e.address,
                  name: e.mailId || e.emailAddress || e.address,
                  isDefault: !!e.isPrimary
                })) : [])
              ]);
              updates.aliases = sends.map(s => ({
                address: s.address,
                name: s.name || s.address,
                isDefault: !!s.isDefault
              })).filter(alias => alias.address);
              if (!updates.aliases.length && accounts.length) {
                updates.aliases = accounts
                  .map(a => a.primaryEmailAddress || a.emailAddress)
                  .filter(Boolean)
                  .map((address, index) => ({ address, name: address, isDefault: index === 0 }));
              }
              if (!updates.aliases.length) {
                updates.aliases = [{ address: acct.primaryEmailAddress || 'user@zoho.com', name: 'Zoho User', isDefault: true }];
              }
              updates.email = acct.primaryEmailAddress || updates.aliases[0]?.address;
              break;
            }
          } catch {}
        }

        await saveEmailConfig('zoho_mail', updates);
        return html('Zoho Mail connected successfully!', true);
      }

      return html('Unknown provider', false);
    } catch (err) {
      return html('Connection failed: ' + (err.response?.data?.error_description || err.message), false);
    }
  }
});
