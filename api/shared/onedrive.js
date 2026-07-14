const axios = require('axios');
const { getItem, createItem, replaceItem } = require('./cosmos');

const ONEDRIVE_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const ONEDRIVE_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const ONEDRIVE_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const ONEDRIVE_SCOPES = 'Files.ReadWrite offline_access User.Read';
const ONEDRIVE_CONFIG_ID = 'cfg_onedrive';
const ONEDRIVE_DEFAULT_FOLDER = 'TECHSINNO Dashboard/Uploads';
const ONEDRIVE_MAX_UPLOAD_BYTES = 35 * 1024 * 1024;

async function getOneDriveConfig() {
  try {
    return await getItem('config', ONEDRIVE_CONFIG_ID);
  } catch (err) {
    if (err.code === 404) return null;
    throw err;
  }
}

async function saveOneDriveConfig(updates) {
  const existing = await getOneDriveConfig();
  const config = existing || { id: ONEDRIVE_CONFIG_ID, service: 'onedrive' };
  Object.assign(config, updates, { updatedAt: new Date().toISOString() });
  if (existing) await replaceItem('config', ONEDRIVE_CONFIG_ID, config);
  else await createItem('config', config);
  return config;
}

function oneDriveClientId(config) {
  return process.env.ONEDRIVE_CLIENT_ID || config?.clientId || process.env.MS_CLIENT_ID;
}

function oneDriveClientSecret(config) {
  return process.env.ONEDRIVE_CLIENT_SECRET || config?.clientSecret || process.env.MS_CLIENT_SECRET;
}

async function ensureOneDriveToken(config) {
  if (config?.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }

  if (!config?.refreshToken) throw new Error('OneDrive not authenticated');

  const clientId = oneDriveClientId(config);
  const clientSecret = oneDriveClientSecret(config);
  if (!clientId || !clientSecret) throw new Error('OneDrive credentials not configured');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: config.refreshToken,
    scope: ONEDRIVE_SCOPES
  });

  let response;
  try {
    response = await axios.post(ONEDRIVE_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch (err) {
    const tokenError = err.response?.data?.error;
    if (['invalid_grant', 'interaction_required', 'invalid_client'].includes(tokenError)) {
      await saveOneDriveConfig({
        accessToken: null,
        refreshToken: null,
        tokenExpiry: 0,
        connected: false,
        reconnectRequired: true,
        lastAuthError: 'OneDrive authorization expired or was revoked. Reconnect OneDrive.'
      });
      throw new Error('OneDrive authorization expired or was revoked. Reconnect OneDrive in Settings.');
    }
    throw err;
  }

  const token = response.data.access_token;
  await saveOneDriveConfig({
    accessToken: token,
    refreshToken: response.data.refresh_token || config.refreshToken,
    tokenExpiry: Date.now() + (response.data.expires_in || 3600) * 1000,
    connected: true,
    reconnectRequired: false,
    lastAuthError: null
  });
  return token;
}

function safeOneDriveSegment(value, fallback = 'Untitled') {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/:*?"<>|#%]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback).slice(0, 120);
}

function safeOneDriveFileName(value, fallback = 'file') {
  const name = safeOneDriveSegment(value, fallback);
  return name.includes('.') ? name : `${name}.bin`;
}

function buildOneDrivePath(folder, filename) {
  const folders = String(folder || ONEDRIVE_DEFAULT_FOLDER)
    .split('/')
    .map(part => safeOneDriveSegment(part, 'Folder'))
    .filter(Boolean);
  const file = safeOneDriveFileName(filename);
  return [...folders, file].join('/');
}

function encodeDrivePath(path) {
  return String(path || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

async function uploadOneDriveBuffer(config, { folder, filename, buffer, contentType }) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Upload data must be a buffer');
  if (!buffer.length) throw new Error('Upload file is empty');
  if (buffer.length > ONEDRIVE_MAX_UPLOAD_BYTES) {
    throw new Error('File is too large for dashboard upload. Use a file under 35 MB.');
  }

  const token = await ensureOneDriveToken(config);
  const path = buildOneDrivePath(folder, filename);
  const uploadUrl = `${ONEDRIVE_GRAPH_BASE}/me/drive/root:/${encodeDrivePath(path)}:/content`;
  const res = await axios.put(uploadUrl, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType || 'application/octet-stream'
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  return {
    id: res.data.id,
    name: res.data.name,
    size: res.data.size,
    webUrl: res.data.webUrl,
    path
  };
}

module.exports = {
  ONEDRIVE_AUTH_URL,
  ONEDRIVE_TOKEN_URL,
  ONEDRIVE_GRAPH_BASE,
  ONEDRIVE_SCOPES,
  ONEDRIVE_DEFAULT_FOLDER,
  ONEDRIVE_MAX_UPLOAD_BYTES,
  getOneDriveConfig,
  saveOneDriveConfig,
  oneDriveClientId,
  oneDriveClientSecret,
  ensureOneDriveToken,
  safeOneDriveSegment,
  safeOneDriveFileName,
  buildOneDrivePath,
  uploadOneDriveBuffer
};
