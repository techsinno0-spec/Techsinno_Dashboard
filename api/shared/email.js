const axios = require('axios');
const { getItem, createItem, replaceItem } = require('./cosmos');

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_API_BASE = 'https://graph.microsoft.com/v1.0';
const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_SCOPES = 'Mail.Read Mail.Send offline_access';

const ZOHO_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', mail: 'https://mail.zoho.com' },
  eu:  { accounts: 'https://accounts.zoho.eu',  mail: 'https://mail.zoho.eu' },
  in:  { accounts: 'https://accounts.zoho.in',  mail: 'https://mail.zoho.in' },
  au:  { accounts: 'https://accounts.zoho.com.au', mail: 'https://mail.zoho.com.au' },
  jp:  { accounts: 'https://accounts.zoho.jp',  mail: 'https://mail.zoho.jp' }
};
const ZOHO_SCOPES = 'ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.folders.READ,ZohoMail.accounts.READ,ZohoMail.attachments.READ,ZohoMail.attachments.CREATE';

async function getEmailConfig(provider) {
  try {
    return await getItem('config', `cfg_${provider}`);
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

async function saveEmailConfig(provider, updates) {
  const id = `cfg_${provider}`;
  let existing;
  try { existing = await getItem('config', id); } catch {}
  const config = existing || { id, service: provider };
  Object.assign(config, updates, { updatedAt: new Date().toISOString() });
  if (existing) await replaceItem('config', id, config);
  else await createItem('config', config);
  return config;
}

function getZohoRegion(region) {
  return ZOHO_REGIONS[region] || ZOHO_REGIONS.com;
}

async function ensureGmailToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Gmail not authenticated');
  const p = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });
  let r;
  try {
    r = await axios.post(GMAIL_TOKEN_URL, p.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch (err) {
    const tokenError = err.response?.data?.error;
    if (tokenError === 'invalid_grant') {
      await saveEmailConfig('gmail', {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: 0,
        reconnectRequired: true,
        lastAuthError: 'Gmail authorization expired or was revoked. Reconnect Gmail.'
      });
      throw new Error('Gmail authorization expired or was revoked. Reconnect Gmail in Settings.');
    }
    throw err;
  }
  const token = r.data.access_token;
  await saveEmailConfig('gmail', {
    accessToken: token,
    tokenExpiry: Date.now() + r.data.expires_in * 1000,
    reconnectRequired: false,
    lastAuthError: null
  });
  return token;
}

async function ensureMsToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Outlook not authenticated');
  const p = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    scope: MS_SCOPES
  });
  const r = await axios.post(MS_TOKEN_URL, p.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const token = r.data.access_token;
  await saveEmailConfig('outlook', {
    accessToken: token,
    refreshToken: r.data.refresh_token || config.refreshToken,
    tokenExpiry: Date.now() + r.data.expires_in * 1000
  });
  return token;
}

async function ensureZohoToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Zoho Mail not authenticated');
  const region = getZohoRegion(config.region || 'com');
  const p = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });
  const r = await axios.post(region.accounts + '/oauth/v2/token', p.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!r.data.access_token) throw new Error(r.data.error || 'Token refresh failed');
  const token = r.data.access_token;
  await saveEmailConfig('zoho_mail', {
    accessToken: token,
    tokenExpiry: Date.now() + (r.data.expires_in || 3600) * 1000
  });
  return token;
}

async function gmailGet(config, endpoint, params = {}) {
  const token = await ensureGmailToken(config);
  const res = await axios.get(`${GMAIL_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }, params
  });
  return res.data;
}

async function gmailPost(config, endpoint, data) {
  const token = await ensureGmailToken(config);
  const res = await axios.post(`${GMAIL_API_BASE}${endpoint}`, data, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

async function msGet(config, endpoint, params = {}) {
  const token = await ensureMsToken(config);
  const res = await axios.get(`${MS_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` }, params
  });
  return res.data;
}

async function msPost(config, endpoint, data) {
  const token = await ensureMsToken(config);
  const res = await axios.post(`${MS_API_BASE}${endpoint}`, data, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

async function zohoGet(config, path, params = {}) {
  const token = await ensureZohoToken(config);
  const region = getZohoRegion(config.region || 'com');
  const res = await axios.get(`${region.mail}/api${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }, params
  });
  return res.data;
}

async function zohoPost(config, path, data) {
  const token = await ensureZohoToken(config);
  const region = getZohoRegion(config.region || 'com');
  const res = await axios.post(`${region.mail}/api${path}`, data, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

module.exports = {
  GMAIL_AUTH_URL, GMAIL_TOKEN_URL, GMAIL_SCOPES, GMAIL_API_BASE,
  MS_AUTH_URL, MS_TOKEN_URL, MS_SCOPES, MS_API_BASE,
  ZOHO_REGIONS, ZOHO_SCOPES,
  getEmailConfig, saveEmailConfig, getZohoRegion,
  ensureGmailToken, ensureMsToken, ensureZohoToken,
  gmailGet, gmailPost, msGet, msPost, zohoGet, zohoPost
};
