const { app, BrowserWindow, ipcMain, shell, Menu, clipboard, dialog } = require('electron');
const path = require('path');
const http = require('http');
const url = require('url');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const Store = require('electron-store');
const Anthropic = require('@anthropic-ai/sdk');

const store = new Store({ encryptionKey: 'techsinno-secure-2024' });

let mainWindow;
let authServer;

// ─── API BASE URL ─────────────────────────────────────────────────────────────
function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getApiBase() {
  const configured = normalizeApiBase(store.get('api_base_url'));
  if (configured) return configured;

  const environmentUrl = normalizeApiBase(process.env.TECHSINNO_API_BASE_URL);
  if (environmentUrl) return environmentUrl;

  return app.isPackaged ? '' : 'http://127.0.0.1:7071';
}

// ─── WINDOW ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'TECHSINNO Dashboard',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    backgroundColor: '#0d1117'
  });

  const sessionUser = store.get('auth_user');
  const hasSession = store.get('auth_token') && sessionUser?.role === 'manager';
  if (hasSession) {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'login.html'));
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'TECHSINNO',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'Developer Tools', accelerator: 'F12', click: () => mainWindow.webContents.openDevTools() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    }
  ]));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── AUTH IPC HANDLERS ────────────────────────────────────────────────────────

ipcMain.handle('auth-login', async (_, username, password) => {
  try {
    const apiBase = getApiBase();
    if (!apiBase) return { error: 'Cloud API URL is not configured. Add it below and try again.' };
    const res = await axios.post(`${apiBase}/api/auth/login`, { username, password }, { timeout: 15000 });
    if (res.data && res.data.token) {
      if (res.data.user?.role !== 'manager') {
        return { error: 'The desktop dashboard is restricted to manager accounts.' };
      }
      store.set('auth_token', res.data.token);
      store.set('auth_user', res.data.user);
      return { success: true, user: res.data.user };
    }
    return { error: res.data.error || 'Login failed' };
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    return { error: msg };
  }
});

ipcMain.handle('auth-logout', () => {
  store.delete('auth_token');
  store.delete('auth_user');
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'src', 'login.html'));
  return true;
});

ipcMain.handle('auth-get-user', () => {
  return store.get('auth_user', null);
});

ipcMain.handle('auth-get-api-base', () => getApiBase());

ipcMain.handle('auth-set-api-base', (_, value) => {
  const apiBase = normalizeApiBase(value);
  if (!/^https?:\/\/[^/]+/i.test(apiBase)) {
    return { error: 'Enter a valid URL beginning with http:// or https://' };
  }
  store.set('api_base_url', apiBase);
  store.delete('auth_token');
  store.delete('auth_user');
  return { success: true, apiBase };
});

ipcMain.handle('auth-change-password', async (_, currentPassword, newPassword) => {
  try {
    const apiBase = getApiBase();
    if (!apiBase) return { error: 'API URL not configured' };
    const token = store.get('auth_token');
    if (!token) return { error: 'Not logged in' };
    const res = await axios.post(`${apiBase}/api/auth/change-password`,
      { currentPassword, newPassword },
      { headers: {
        Authorization: `Bearer ${token}`,
        'X-Techsinno-Token': token
      } }
    );
    if (res.data.success) {
      const user = store.get('auth_user');
      if (user) { user.mustChangePassword = false; store.set('auth_user', user); }
    }
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error || e.message };
  }
});

async function ensureElectronToken() {
  const token = store.get('auth_token');
  const apiBase = getApiBase();
  if (!token || !apiBase) return;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const remaining = (payload.exp * 1000) - Date.now();
    if (remaining > 3600000) return;
    if (remaining <= 0) { store.delete('auth_token'); store.delete('auth_user'); return; }
    const res = await axios.post(`${apiBase}/api/auth/refresh`, null, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Techsinno-Token': token
      }
    });
    if (res.data && res.data.token) {
      store.set('auth_token', res.data.token);
      if (res.data.user) store.set('auth_user', res.data.user);
    }
  } catch {}
}

ipcMain.handle('api-call', async (_, method, apiPath, body) => {
  try {
    const apiBase = getApiBase();
    if (!apiBase) return { error: 'API URL not configured' };
    await ensureElectronToken();
    const token = store.get('auth_token');
    const config = {
      method,
      url: `${apiBase}/api${apiPath}`,
      headers: {}
    };
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      config.headers['X-Techsinno-Token'] = token;
    }
    if (body && (method === 'POST' || method === 'PUT')) {
      config.data = body;
      config.headers['Content-Type'] = 'application/json';
    }
    const res = await axios(config);
    return res.data;
  } catch (e) {
    if (e.response?.status === 401) {
      store.delete('auth_token');
      store.delete('auth_user');
      if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'src', 'login.html'));
      return { error: 'Session expired' };
    }
    return { error: e.response?.data?.error || e.message };
  }
});

// ─── ZOHO OAUTH ───────────────────────────────────────────────────────────────

const ZOHO_AUTH_URL   = 'https://accounts.zoho.com/oauth/v2/auth';
const ZOHO_TOKEN_URL  = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_BASE   = 'https://www.zohoapis.com/books/v3';
const REDIRECT_PORT   = 8472;
const REDIRECT_URI    = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES          = 'ZohoBooks.invoices.READ,ZohoBooks.expenses.READ,ZohoBooks.reports.READ,ZohoBooks.contacts.READ';

ipcMain.handle('get-zoho-config', () => {
  return {
    clientId:     store.get('zoho_client_id', ''),
    clientSecret: store.get('zoho_client_secret', ''),
    orgId:        store.get('zoho_org_id', ''),
    connected:    !!store.get('zoho_access_token')
  };
});

ipcMain.handle('save-zoho-config', (_, { clientId, clientSecret, orgId }) => {
  store.set('zoho_client_id', clientId);
  store.set('zoho_client_secret', clientSecret);
  store.set('zoho_org_id', orgId);
  store.delete('zoho_access_token');
  store.delete('zoho_refresh_token');
  return true;
});

ipcMain.handle('zoho-connect', async () => {
  const clientId = store.get('zoho_client_id');
  if (!clientId) return { error: 'No client ID configured' };

  return new Promise((resolve) => {
    if (authServer) { try { authServer.close(); } catch(e) {} }

    authServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }

      const code = parsed.query.code;
      if (!code) { res.end('<h2>Error: no code received</h2>'); resolve({ error: 'No code' }); return; }

      res.end(`<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3">
        <h2 style="color:#5fa8c4">TECHSINNO connected to Zoho Books!</h2>
        <p>You can close this tab and return to the dashboard.</p>
      </body></html>`);

      try {
        const tokenRes = await axios.post(ZOHO_TOKEN_URL, null, {
          params: {
            grant_type: 'authorization_code',
            client_id: store.get('zoho_client_id'),
            client_secret: store.get('zoho_client_secret'),
            redirect_uri: REDIRECT_URI,
            code
          }
        });
        store.set('zoho_access_token',  tokenRes.data.access_token);
        store.set('zoho_refresh_token', tokenRes.data.refresh_token);
        store.set('zoho_token_expiry',  Date.now() + (tokenRes.data.expires_in * 1000));
        authServer.close();
        resolve({ success: true });
      } catch(e) {
        authServer.close();
        resolve({ error: e.message });
      }
    });

    authServer.listen(REDIRECT_PORT, () => {
      const authUrl = `${ZOHO_AUTH_URL}?response_type=code&client_id=${clientId}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&access_type=offline&prompt=consent`;
      shell.openExternal(authUrl);
    });

    setTimeout(() => {
      if (authServer.listening) { authServer.close(); resolve({ error: 'Timeout' }); }
    }, 120000);
  });
});

ipcMain.handle('zoho-disconnect', () => {
  store.delete('zoho_access_token');
  store.delete('zoho_refresh_token');
  store.delete('zoho_token_expiry');
  return true;
});

// ─── ZOHO API HELPER ──────────────────────────────────────────────────────────

async function zohoGet(endpoint, params = {}) {
  let token = store.get('zoho_access_token');
  const expiry = store.get('zoho_token_expiry', 0);

  if (!token || Date.now() > expiry - 60000) {
    const refresh = store.get('zoho_refresh_token');
    if (!refresh) throw new Error('Not authenticated');
    const p = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: store.get('zoho_client_id'),
      client_secret: store.get('zoho_client_secret'),
      refresh_token: refresh
    });
    const r = await axios.post(ZOHO_TOKEN_URL, p.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!r.data.access_token) throw new Error(r.data.error || 'Token refresh failed');
    token = r.data.access_token;
    store.set('zoho_access_token', token);
    store.set('zoho_token_expiry', Date.now() + (r.data.expires_in * 1000));
  }

  const orgId = store.get('zoho_org_id');
  const res = await axios.get(`${ZOHO_API_BASE}${endpoint}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { organization_id: orgId, ...params }
  });
  return res.data;
}

// ─── ZOHO DATA IPC HANDLERS ───────────────────────────────────────────────────

ipcMain.handle('zoho-get-dashboard', async () => {
  try {
    const [invoices, expenses, contacts] = await Promise.all([
      zohoGet('/invoices', { per_page: 200 }),
      zohoGet('/expenses', { per_page: 200 }),
      zohoGet('/contacts', { per_page: 200 })
    ]);

    const invList = invoices.invoices || [];
    const expList = expenses.expenses || [];

    const totalInvoiced   = invList.reduce((s, i) => s + (i.total || 0), 0);
    const totalReceived   = invList.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
    const totalOverdue    = invList.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.balance || 0), 0);
    const totalUnpaid     = invList.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + (i.balance || 0), 0);
    const totalExpenses   = expList.reduce((s, e) => s + (e.total || 0), 0);
    const netProfit       = totalReceived - totalExpenses;

    const overdueInvoices = invList
      .filter(i => i.status === 'overdue')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 10)
      .map(i => ({
        number:   i.invoice_number,
        client:   i.customer_name,
        amount:   i.balance,
        due:      i.due_date,
        status:   i.status
      }));

    const recentInvoices = invList
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10)
      .map(i => ({
        number: i.invoice_number,
        client: i.customer_name,
        amount: i.total,
        date:   i.date,
        status: i.status
      }));

    const recentExpenses = expList
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8)
      .map(e => ({
        desc:     e.description || e.account_name,
        amount:   e.total,
        date:     e.date,
        category: e.account_name
      }));

    const clientCount = (contacts.contacts || []).filter(c => c.contact_type === 'customer').length;

    return {
      success: true,
      summary: { totalInvoiced, totalReceived, totalOverdue, totalUnpaid, totalExpenses, netProfit, clientCount },
      overdueInvoices,
      recentInvoices,
      recentExpenses
    };
  } catch(e) {
    return { error: e.response?.data?.message || e.response?.data?.code || e.message };
  }
});

// ─── LOCAL STORE IPC ──────────────────────────────────────────────────────────

ipcMain.handle('store-get', (_, key) => store.get(key));
ipcMain.handle('store-set', (_, key, val) => { store.set(key, val); return true; });

// ─── ONEDRIVE SYNC (via Microsoft Graph API) ─────────────────────────────────

const OD_AUTH_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const OD_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const OD_API_BASE  = 'https://graph.microsoft.com/v1.0';
const OD_PORT      = 8476;
const OD_REDIRECT  = `http://localhost:${OD_PORT}/callback`;
const OD_SCOPES    = 'Files.ReadWrite offline_access';
const OD_FILE_PATH = 'Techsinno/Dashboard/app-data.json';

let odServer;

async function odEnsureToken() {
  let token = store.get('od_access_token');
  if (!token || Date.now() > store.get('od_token_expiry', 0) - 60000) {
    const refresh = store.get('od_refresh_token');
    if (!refresh) throw new Error('OneDrive not connected');
    const p = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: store.get('od_client_id'),
      client_secret: store.get('od_client_secret'),
      refresh_token: refresh,
      scope: OD_SCOPES
    });
    const r = await axios.post(OD_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    token = r.data.access_token;
    store.set('od_access_token', token);
    store.set('od_refresh_token', r.data.refresh_token || refresh);
    store.set('od_token_expiry', Date.now() + r.data.expires_in * 1000);
  }
  return token;
}

ipcMain.handle('od-get-config', () => ({
  clientId: store.get('od_client_id', ''),
  clientSecret: store.get('od_client_secret', ''),
  connected: !!store.get('od_access_token')
}));

ipcMain.handle('od-save-config', (_, { clientId, clientSecret }) => {
  store.set('od_client_id', clientId);
  store.set('od_client_secret', clientSecret);
  ['od_access_token','od_refresh_token','od_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('od-connect', async () => {
  const clientId = store.get('od_client_id');
  if (!clientId) return { error: 'No client ID configured' };
  return new Promise(resolve => {
    if (odServer) { try { odServer.close(); } catch(e) {} }
    odServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }
      const code = parsed.query.code;
      if (!code) { res.end('<h2>Error</h2>'); resolve({ error: 'No code' }); return; }
      res.end('<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3"><h2 style="color:#5fa8c4">OneDrive connected!</h2><p>You can close this tab.</p></body></html>');
      try {
        const p = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: store.get('od_client_id'), client_secret: store.get('od_client_secret'), redirect_uri: OD_REDIRECT, scope: OD_SCOPES });
        const r = await axios.post(OD_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        store.set('od_access_token', r.data.access_token);
        store.set('od_refresh_token', r.data.refresh_token);
        store.set('od_token_expiry', Date.now() + r.data.expires_in * 1000);
        odServer.close(); resolve({ success: true });
      } catch(e) { odServer.close(); resolve({ error: e.message }); }
    });
    odServer.listen(OD_PORT, () => {
      shell.openExternal(`${OD_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(OD_REDIRECT)}&scope=${encodeURIComponent(OD_SCOPES)}&response_mode=query`);
    });
    setTimeout(() => { if (odServer.listening) { odServer.close(); resolve({ error: 'Timeout' }); } }, 120000);
  });
});

ipcMain.handle('od-disconnect', () => {
  ['od_access_token','od_refresh_token','od_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('sync-get-info', () => ({
  connected: !!store.get('od_access_token'),
  clientId: store.get('od_client_id', '')
}));

ipcMain.handle('sync-save', async (_, data) => {
  try {
    const apiBase = getApiBase();
    if (apiBase && store.get('auth_token')) {
      await ensureElectronToken();
      const token = store.get('auth_token');
      const res = await axios.put(`${apiBase}/api/sync`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Techsinno-Token': token,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      if (res.data && res.data.success) return { ...res.data, source: 'cloud' };
    }
  } catch(e) {
    // Fall through to the legacy OneDrive backup path.
  }

  try {
    const token = await odEnsureToken();
    await axios.put(
      `${OD_API_BASE}/me/drive/root:/${OD_FILE_PATH}:/content`,
      JSON.stringify(data, null, 2),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, ts: new Date().toISOString(), source: 'onedrive' };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('sync-load', async () => {
  try {
    const apiBase = getApiBase();
    if (apiBase && store.get('auth_token')) {
      await ensureElectronToken();
      const token = store.get('auth_token');
      const res = await axios.get(`${apiBase}/api/sync`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Techsinno-Token': token
        },
        timeout: 15000
      });
      if (res.data && res.data.success) return { ...res.data, source: 'cloud' };
    }
  } catch(e) {
    // Fall through to the legacy OneDrive backup path.
  }

  try {
    const token = await odEnsureToken();
    const res = await axios.get(
      `${OD_API_BASE}/me/drive/root:/${OD_FILE_PATH}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { success: true, data: res.data, source: 'onedrive' };
  } catch(e) {
    if (e.response && e.response.status === 404) return { success: true, data: null, source: 'onedrive' };
    return { error: e.message };
  }
});

// ─── OPEN EXTERNAL URL ────────────────────────────────────────────────────────

ipcMain.handle('open-url', (_, u) => { shell.openExternal(u); return true; });

// ─── FILE PICKERS ─────────────────────────────────────────────────────────────

const MIME_MAP = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp', '.mp4':'video/mp4', '.mov':'video/quicktime', '.avi':'video/x-msvideo', '.pdf':'application/pdf', '.doc':'application/msword', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls':'application/vnd.ms-excel', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt':'text/plain', '.zip':'application/zip', '.csv':'text/csv' };
function getMime(ext) { return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream'; }

ipcMain.handle('pick-media-file', async (_, type) => {
  const filters = type === 'video'
    ? [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi'] }]
    : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  if (result.canceled || !result.filePaths.length) return null;
  const fp = result.filePaths[0];
  const data = fs.readFileSync(fp);
  return { path: fp, name: path.basename(fp), base64: data.toString('base64'), mimeType: getMime(path.extname(fp)), size: data.length };
});

ipcMain.handle('pick-email-attachments', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths.map(fp => {
    const data = fs.readFileSync(fp);
    return { name: path.basename(fp), base64: data.toString('base64'), mimeType: getMime(path.extname(fp)), size: data.length };
  });
});

ipcMain.handle('save-attachment', async (_, name, base64Data) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: name });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, Buffer.from(base64Data, 'base64'));
  return true;
});

// ─── GMAIL OAUTH ──────────────────────────────────────────────────────────────

const GMAIL_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE  = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_PORT      = 8473;
const GMAIL_REDIRECT  = `http://localhost:${GMAIL_PORT}/callback`;
const GMAIL_SCOPES    = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

let gmailServer;

async function gmailEnsureToken() {
  let token = store.get('gmail_access_token');
  if (!token || Date.now() > store.get('gmail_token_expiry', 0) - 60000) {
    const refresh = store.get('gmail_refresh_token');
    if (!refresh) throw new Error('Not authenticated');
    const p = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: store.get('gmail_client_id'),
      client_secret: store.get('gmail_client_secret'),
      refresh_token: refresh
    });
    const r = await axios.post(GMAIL_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    token = r.data.access_token;
    store.set('gmail_access_token', token);
    store.set('gmail_token_expiry', Date.now() + r.data.expires_in * 1000);
  }
  return token;
}

function gmailMetadataParams(...headers) {
  const p = new URLSearchParams();
  p.append('format', 'metadata');
  headers.forEach(h => p.append('metadataHeaders', h));
  return p;
}

async function gmailGet(endpoint, params = {}) {
  const token = await gmailEnsureToken();
  const res = await axios.get(`${GMAIL_API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, params });
  return res.data;
}

async function gmailPost(endpoint, data) {
  const token = await gmailEnsureToken();
  const res = await axios.post(`${GMAIL_API_BASE}${endpoint}`, data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return res.data;
}

ipcMain.handle('gmail-get-config', () => ({
  clientId: store.get('gmail_client_id', ''),
  clientSecret: store.get('gmail_client_secret', ''),
  connected: !!store.get('gmail_access_token')
}));

ipcMain.handle('gmail-save-config', (_, { clientId, clientSecret }) => {
  store.set('gmail_client_id', clientId);
  store.set('gmail_client_secret', clientSecret);
  ['gmail_access_token','gmail_refresh_token','gmail_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('gmail-connect', async () => {
  const clientId = store.get('gmail_client_id');
  if (!clientId) return { error: 'No client ID configured' };
  return new Promise(resolve => {
    if (gmailServer) { try { gmailServer.close(); } catch(e) {} }
    gmailServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }
      const code = parsed.query.code;
      if (!code) { res.end('<h2>Error</h2>'); resolve({ error: 'No code' }); return; }
      res.end('<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3"><h2 style="color:#5fa8c4">Gmail connected!</h2><p>You can close this tab.</p></body></html>');
      try {
        const p = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: store.get('gmail_client_id'), client_secret: store.get('gmail_client_secret'), redirect_uri: GMAIL_REDIRECT });
        const r = await axios.post(GMAIL_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        store.set('gmail_access_token', r.data.access_token);
        store.set('gmail_refresh_token', r.data.refresh_token);
        store.set('gmail_token_expiry', Date.now() + r.data.expires_in * 1000);
        gmailServer.close(); resolve({ success: true });
      } catch(e) { gmailServer.close(); resolve({ error: e.message }); }
    });
    gmailServer.listen(GMAIL_PORT, () => {
      shell.openExternal(`${GMAIL_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(GMAIL_REDIRECT)}&scope=${encodeURIComponent(GMAIL_SCOPES)}&access_type=offline&prompt=consent`);
    });
    setTimeout(() => { if (gmailServer.listening) { gmailServer.close(); resolve({ error: 'Timeout' }); } }, 120000);
  });
});

ipcMain.handle('gmail-disconnect', () => {
  ['gmail_access_token','gmail_refresh_token','gmail_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('gmail-get-inbox', async () => {
  try {
    const [profile, unreadRes, recentRes] = await Promise.all([
      gmailGet('/profile'),
      gmailGet('/messages', { q: 'is:unread', maxResults: 1 }),
      gmailGet('/messages', { maxResults: 10 })
    ]);
    const msgs = await Promise.all(
      (recentRes.messages || []).slice(0, 8).map(m =>
        gmailGet(`/messages/${m.id}`, gmailMetadataParams('Subject', 'From', 'Date'))
      )
    );
    return {
      success: true,
      email: profile.emailAddress,
      unreadCount: unreadRes.resultSizeEstimate || 0,
      messages: msgs.map(m => {
        const h = {};
        (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
        return { id: m.id, subject: h.Subject || '(no subject)', from: h.From || '', date: h.Date || '', unread: (m.labelIds || []).includes('UNREAD') };
      })
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-send', async (_, { to, subject, body, attachments }) => {
  try {
    let raw;
    if (attachments && attachments.length > 0) {
      const boundary = 'boundary_' + Date.now();
      let mime = `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      mime += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${body}\r\n`;
      for (const att of attachments) {
        const b64 = att.base64.replace(/\r?\n/g, '');
        const wrapped = b64.match(/.{1,76}/g).join('\r\n');
        mime += `--${boundary}\r\nContent-Type: ${att.mimeType}; name="${att.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${att.name}"\r\n\r\n${wrapped}\r\n`;
      }
      mime += `--${boundary}--`;
      raw = Buffer.from(mime).toString('base64url');
    } else {
      raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    }
    await gmailPost('/messages/send', { raw });
    return { success: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-get-message', async (_, messageId) => {
  try {
    const data = await gmailGet(`/messages/${messageId}`, { format: 'full' });
    const headers = {};
    (data.payload.headers || []).forEach(h => { headers[h.name] = h.value; });
    function decodeBody(payload) {
      if (payload.body && payload.body.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
      if (payload.parts) {
        const plain = payload.parts.find(p => p.mimeType === 'text/plain');
        const html  = payload.parts.find(p => p.mimeType === 'text/html');
        const part  = plain || html;
        if (part && part.body && part.body.data) return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        for (const p of payload.parts) { const b = decodeBody(p); if (b) return b; }
      }
      return '';
    }
    function collectAttachments(payload, list) {
      if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
        list.push({ id: payload.body.attachmentId, name: payload.filename, mimeType: payload.mimeType, size: payload.body.size || 0 });
      }
      if (payload.parts) payload.parts.forEach(p => collectAttachments(p, list));
      if (payload.filename && payload.filename.length > 0 && payload.body?.size > 0 && !payload.body?.attachmentId && payload.body?.data) {
        list.push({ id: '__inline_' + list.length, name: payload.filename, mimeType: payload.mimeType, size: payload.body.size || 0, inline: true, data: payload.body.data });
      }
      return list;
    }
    const attachments = collectAttachments(data.payload, []);
    console.log('[Gmail] Message', messageId, 'found', attachments.length, 'attachments');
    return { success: true, subject: headers['Subject'] || '(no subject)', from: headers['From'] || '', date: headers['Date'] || '', body: decodeBody(data.payload), attachments };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-get-attachment', async (_, messageId, attachmentId) => {
  try {
    const data = await gmailGet(`/messages/${messageId}/attachments/${attachmentId}`);
    return { success: true, data: data.data };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-analyze-inbox', async () => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const recentRes = await gmailGet('/messages', { maxResults: 10 });
    if (!recentRes.messages || !recentRes.messages.length) return { success: true, analysis: [], emails: [] };
    const msgs = await Promise.all(
      recentRes.messages.slice(0, 8).map(m =>
        gmailGet(`/messages/${m.id}`, gmailMetadataParams('Subject', 'From', 'Date'))
      )
    );
    const emailList = msgs.map(m => {
      const h = {};
      (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
      return { id: m.id, subject: h.Subject || '(no subject)', from: h.From || '', snippet: m.snippet || '' };
    });
    const client = new Anthropic({ apiKey });
    const prompt = `You are analyzing emails for TECHSINNO (Pty) Ltd — Frank Muland's mechatronics and industrial electronics company in Kuilsriver, Western Cape, South Africa. Services: PCB board repair, factory automation (PLC/SCADA), IoT monitoring. Target clients: factories, farms, medical facilities in Western Cape.

Analyze these ${emailList.length} emails:
${JSON.stringify(emailList.map(e=>({id:e.id,from:e.from,subject:e.subject,snippet:e.snippet})),null,2)}

Return ONLY a valid JSON array, no other text:
[{"id":"<id>","flag":"urgent|lead|reply|normal","reason":"<max 10 words>","priority":1-5}]

Flags: urgent=invoice/payment/deadline/complaint, lead=potential new customer or service inquiry, reply=needs response, normal=newsletter/receipt/notification`;
    const response = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] });
    const text = (response.content[0]?.text || '[]').trim();
    const m = text.match(/\[[\s\S]*\]/);
    const analysis = m ? JSON.parse(m[0]) : [];
    return { success: true, analysis, emails: emailList };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-get-message', async (_, messageId) => {
  try {
    const data = await msGet(`/me/messages/${messageId}`, { '$select': 'subject,from,receivedDateTime,body,hasAttachments' });
    const raw = data.body?.content || '';
    const body = data.body?.contentType === 'html' ? raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim() : raw;
    let attachments = [];
    if (data.hasAttachments) {
      try {
        const attRes = await msGet(`/me/messages/${messageId}/attachments`);
        attachments = (attRes.value || []).filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment').map(a => ({
          id: a.id, name: a.name, mimeType: a.contentType, size: a.size || 0
        }));
        console.log('[Outlook] Message', messageId, 'hasAttachments=true, found', attachments.length, 'file attachments out of', (attRes.value||[]).length, 'total');
      } catch(attErr) { console.log('[Outlook] Attachment fetch error:', attErr.message); }
    }
    return { success: true, subject: data.subject || '(no subject)', from: data.from?.emailAddress?.name || data.from?.emailAddress?.address || '', date: data.receivedDateTime, body, attachments };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-get-attachment', async (_, messageId, attachmentId) => {
  try {
    const data = await msGet(`/me/messages/${messageId}/attachments/${attachmentId}`);
    return { success: true, data: data.contentBytes, name: data.name, contentType: data.contentType };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-open-compose', (_, { to = '', subject = '', body = '' } = {}) => {
  shell.openExternal(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  return true;
});

// ─── MICROSOFT GRAPH (OUTLOOK) ────────────────────────────────────────────────

const MS_AUTH_URL   = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_API_BASE   = 'https://graph.microsoft.com/v1.0';
const MS_PORT       = 8474;
const MS_REDIRECT   = `http://localhost:${MS_PORT}/callback`;
const MS_SCOPES     = 'Mail.Read Mail.Send offline_access';

let msServer;

async function msEnsureToken() {
  let token = store.get('ms_access_token');
  if (!token || Date.now() > store.get('ms_token_expiry', 0) - 60000) {
    const refresh = store.get('ms_refresh_token');
    if (!refresh) throw new Error('Not authenticated');
    const p = new URLSearchParams({ grant_type: 'refresh_token', client_id: store.get('ms_client_id'), client_secret: store.get('ms_client_secret'), refresh_token: refresh, scope: MS_SCOPES });
    const r = await axios.post(MS_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    token = r.data.access_token;
    store.set('ms_access_token', token);
    store.set('ms_refresh_token', r.data.refresh_token || refresh);
    store.set('ms_token_expiry', Date.now() + r.data.expires_in * 1000);
  }
  return token;
}

async function msGet(endpoint, params = {}) {
  const token = await msEnsureToken();
  const res = await axios.get(`${MS_API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, params });
  return res.data;
}

async function msPost(endpoint, data) {
  const token = await msEnsureToken();
  const res = await axios.post(`${MS_API_BASE}${endpoint}`, data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return res.data;
}

ipcMain.handle('ms-get-config', () => ({
  clientId: store.get('ms_client_id', ''),
  clientSecret: store.get('ms_client_secret', ''),
  connected: !!store.get('ms_access_token')
}));

ipcMain.handle('ms-save-config', (_, { clientId, clientSecret }) => {
  store.set('ms_client_id', clientId);
  store.set('ms_client_secret', clientSecret);
  ['ms_access_token','ms_refresh_token','ms_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('ms-connect', async () => {
  const clientId = store.get('ms_client_id');
  if (!clientId) return { error: 'No client ID configured' };
  return new Promise(resolve => {
    if (msServer) { try { msServer.close(); } catch(e) {} }
    msServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }
      const code = parsed.query.code;
      if (!code) { res.end('<h2>Error</h2>'); resolve({ error: 'No code' }); return; }
      res.end('<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3"><h2 style="color:#5fa8c4">Outlook connected!</h2><p>You can close this tab.</p></body></html>');
      try {
        const p = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: store.get('ms_client_id'), client_secret: store.get('ms_client_secret'), redirect_uri: MS_REDIRECT, scope: MS_SCOPES });
        const r = await axios.post(MS_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        store.set('ms_access_token', r.data.access_token);
        store.set('ms_refresh_token', r.data.refresh_token);
        store.set('ms_token_expiry', Date.now() + r.data.expires_in * 1000);
        msServer.close(); resolve({ success: true });
      } catch(e) { msServer.close(); resolve({ error: e.message }); }
    });
    msServer.listen(MS_PORT, () => {
      shell.openExternal(`${MS_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(MS_REDIRECT)}&scope=${encodeURIComponent(MS_SCOPES)}&response_mode=query`);
    });
    setTimeout(() => { if (msServer.listening) { msServer.close(); resolve({ error: 'Timeout' }); } }, 120000);
  });
});

ipcMain.handle('ms-disconnect', () => {
  ['ms_access_token','ms_refresh_token','ms_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('ms-get-inbox', async () => {
  try {
    const [folder, msgs] = await Promise.all([
      msGet('/me/mailFolders/Inbox'),
      msGet('/me/messages', { '$select': 'subject,from,receivedDateTime,isRead', '$top': 10, '$orderby': 'receivedDateTime desc' })
    ]);
    return {
      success: true,
      unreadCount: folder.unreadItemCount || 0,
      messages: (msgs.value || []).map(m => ({
        id: m.id,
        subject: m.subject || '(no subject)',
        from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
        date: m.receivedDateTime,
        unread: !m.isRead
      }))
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-send', async (_, { to, subject, body, attachments }) => {
  try {
    const message = { subject, body: { contentType: 'Text', content: body }, toRecipients: [{ emailAddress: { address: to } }] };
    if (attachments && attachments.length > 0) {
      message.attachments = attachments.map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name, contentBytes: a.base64, contentType: a.mimeType
      }));
    }
    await msPost('/me/sendMail', { message });
    return { success: true };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-open-compose', (_, { to = '', subject = '', body = '' } = {}) => {
  shell.openExternal(`https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  return true;
});

// ─── LINKEDIN COMPANY PAGE ────────────────────────────────────────────────────

const LI_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_API_BASE  = 'https://api.linkedin.com/v2';
const LI_PORT      = 8475;
const LI_REDIRECT  = `http://localhost:${LI_PORT}/callback`;
const LI_SCOPES    = 'openid profile email';

let liServer;

ipcMain.handle('li-get-config', () => ({
  clientId: store.get('li_client_id', ''),
  clientSecret: store.get('li_client_secret', ''),
  orgId: store.get('li_org_id', ''),
  personalUrl: store.get('li_personal_url', ''),
  connected: !!store.get('li_access_token')
}));

ipcMain.handle('li-save-config', (_, { clientId, clientSecret, orgId, personalUrl }) => {
  store.set('li_client_id', clientId);
  store.set('li_client_secret', clientSecret);
  store.set('li_org_id', orgId);
  store.set('li_personal_url', personalUrl);
  ['li_access_token','li_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('li-connect', async () => {
  const clientId = store.get('li_client_id');
  if (!clientId) return { error: 'No client ID configured' };
  return new Promise(resolve => {
    if (liServer) { try { liServer.close(); } catch(e) {} }
    const state = Math.random().toString(36).slice(2);
    liServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }
      const code = parsed.query.code;
      if (!code) { res.end('<h2>Error</h2>'); resolve({ error: 'No code' }); return; }
      res.end('<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3"><h2 style="color:#5fa8c4">LinkedIn connected!</h2><p>You can close this tab.</p></body></html>');
      try {
        const p = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: store.get('li_client_id'), client_secret: store.get('li_client_secret'), redirect_uri: LI_REDIRECT });
        const r = await axios.post(LI_TOKEN_URL, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        store.set('li_access_token', r.data.access_token);
        store.set('li_token_expiry', Date.now() + r.data.expires_in * 1000);
        liServer.close(); resolve({ success: true });
      } catch(e) { liServer.close(); resolve({ error: e.message }); }
    });
    liServer.listen(LI_PORT, () => {
      shell.openExternal(`${LI_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(LI_REDIRECT)}&scope=${encodeURIComponent(LI_SCOPES)}&state=${state}`);
    });
    setTimeout(() => { if (liServer.listening) { liServer.close(); resolve({ error: 'Timeout' }); } }, 120000);
  });
});

ipcMain.handle('li-disconnect', () => {
  ['li_access_token','li_token_expiry'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('li-get-stats', async () => {
  try {
    const token = store.get('li_access_token');
    if (!token) return { error: 'Not authenticated' };
    const orgId = store.get('li_org_id');
    const headers = { Authorization: `Bearer ${token}`, 'LinkedIn-Version': '202401' };
    const [profile, org] = await Promise.all([
      axios.get('https://api.linkedin.com/v2/userinfo', { headers }).catch(() => null),
      orgId ? axios.get(`${LI_API_BASE}/organizations/${orgId}`, { headers }).catch(() => null) : Promise.resolve(null)
    ]);
    const personId = profile?.data?.sub;
    const [companyFollowersRes, personalFollowersRes] = await Promise.all([
      orgId ? axios.get(`${LI_API_BASE}/networkSizes/urn%3Ali%3Aorganization%3A${orgId}?edgeType=CompanyFollowedByMember`, { headers }).catch(() => null) : Promise.resolve(null),
      personId ? axios.get(`${LI_API_BASE}/networkSizes/urn%3Ali%3Aperson%3A${personId}?edgeType=followers`, { headers }).catch(() => null) : Promise.resolve(null)
    ]);
    const companyFollowers = companyFollowersRes?.data?.firstDegreeSize || 0;
    const personalFollowers = personalFollowersRes?.data?.firstDegreeSize || 0;
    return {
      success: true,
      name: profile?.data?.name || (profile?.data?.given_name ? `${profile.data.given_name} ${profile.data.family_name||''}`.trim() : ''),
      orgName: org?.data?.localizedName || org?.data?.name?.localized?.en_US || '',
      followers: companyFollowers || personalFollowers,
      companyFollowers,
      personalFollowers,
      orgUrl: orgId ? `https://www.linkedin.com/company/${orgId}` : '',
      personalUrl: store.get('li_personal_url', '')
    };
  } catch(e) { return { error: e.message }; }
});

// ─── CLAUDE AI ASSISTANT ──────────────────────────────────────────────────────

ipcMain.handle('claude-get-key', () => ({ key: store.get('anthropic_api_key', '') }));
ipcMain.handle('claude-save-key', (_, key) => { store.set('anthropic_api_key', key); return true; });

ipcMain.handle('claude-chat', async (_, { messages, appData }) => {
  const apiKey = store.get('anthropic_api_key');
  if (!apiKey) return { error: 'No API key configured. Go to Settings → Claude AI.' };

  const client = new Anthropic({ apiKey });

  const tools = [
    {
      name: 'add_task',
      description: 'Add a new task to a specific week in the task list',
      input_schema: {
        type: 'object',
        properties: {
          week: { type: 'number', description: 'Week index 0-7 (0=Week1, 1=Week2, etc.)' },
          text: { type: 'string', description: 'Task description' },
          category: { type: 'string', enum: ['admin','repair','auto','iot'], description: 'Task category' },
          slot: { type: 'string', enum: ['eve','wknd'], description: 'Evening or weekend task' }
        },
        required: ['week','text','category','slot']
      }
    },
    {
      name: 'complete_task',
      description: 'Mark a task as done or undone',
      input_schema: {
        type: 'object',
        properties: {
          week: { type: 'number', description: 'Week index 0-7' },
          taskIndex: { type: 'number', description: 'Task index within the week' },
          done: { type: 'boolean', description: 'true to mark done, false to unmark' }
        },
        required: ['week','taskIndex','done']
      }
    },
    {
      name: 'get_summary',
      description: 'Get a summary of current business status including tasks, goals, and Zoho data',
      input_schema: { type: 'object', properties: {} }
    }
  ];

  const systemPrompt = `You are an AI business assistant built into the TECHSINNO dashboard for Frank Muland, owner of TECHSINNO (Pty) Ltd — a mechatronics and industrial electronics company in Kuilsriver, Western Cape, South Africa.

Services: industrial PCB repair, factory automation (PLC/SCADA), IoT monitoring systems.
Target clients: factories, farms, medical facilities in the Western Cape.
Current phase: 90-day launch plan (Foundation → Traction → Scale).
Business email: frank@techsinno.com
Registration: 2022/364165/07

You have access to Frank's live task list, goals, and posts. Be concise, practical, and business-focused. Help manage tasks, suggest priorities, draft communications, and give business advice specific to the SA industrial/manufacturing market. When Frank asks you to add or complete tasks, use the tools provided.

Do not behave like a generic email writer. Behave like a field-aware business scout for TECHSINNO.

When asked for outreach, leads, emails, LinkedIn posts, quotes, or strategy:
1. First identify the specific likely operational problem for that company or sector.
2. State the evidence used and clearly label assumptions.
3. Connect the problem to one TECHSINNO service: PCB repair, PLC/SCADA automation, IoT monitoring, diagnostics, or preventive maintenance.
4. Suggest a practical first step Frank can offer, such as a quick diagnostic call, site walk-through, failed-board assessment, control panel review, downtime-risk check, or monitoring pilot.
5. Only then draft communication.

Outreach rules:
- Never write a generic "we offer innovative solutions" email.
- Avoid repeating the same opening line across emails.
- Mention one concrete pain: downtime, load-shedding surge damage, obsolete PLCs, imported spare delays, unmonitored pumps/motors, recurring control faults, quality losses, cold-chain risk, water/energy waste.
- Keep emails short, specific, and humble because TECHSINNO is still building proof.
- Do not invent past projects, clients, case studies, certifications, or completed work.

Current app data:
${JSON.stringify(appData, null, 2)}`;

  try {
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages
    });

    const actions = [];
    let finalText = '';

    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use');
      const toolResults = toolUses.map(tu => {
        actions.push({ tool: tu.name, input: tu.input });
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ ok: true, input: tu.input }) };
      });
      messages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults }];
      response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: systemPrompt, tools, messages });
    }

    finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return { success: true, text: finalText, actions };
  } catch(e) { return { error: e.message }; }
});

// ─── ZOHO MAIL ────────────────────────────────────────────────────────────────

const ZOHOMAIL_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', mail: 'https://mail.zoho.com' },
  eu:  { accounts: 'https://accounts.zoho.eu',  mail: 'https://mail.zoho.eu' },
  in:  { accounts: 'https://accounts.zoho.in',  mail: 'https://mail.zoho.in' },
  au:  { accounts: 'https://accounts.zoho.com.au', mail: 'https://mail.zoho.com.au' },
  jp:  { accounts: 'https://accounts.zoho.jp',  mail: 'https://mail.zoho.jp' }
};
function getZohoMailRegion() {
  const r = store.get('zohomail_region', 'com');
  return ZOHOMAIL_REGIONS[r] || ZOHOMAIL_REGIONS.com;
}
function getZohoMailAuthUrl()  { return getZohoMailRegion().accounts + '/oauth/v2/auth'; }
function getZohoMailTokenUrl() { return getZohoMailRegion().accounts + '/oauth/v2/token'; }
function getZohoMailApiBase()  { return getZohoMailRegion().mail + '/api'; }
const ZOHOMAIL_PORT      = 8478;
const ZOHOMAIL_REDIRECT  = `http://localhost:${ZOHOMAIL_PORT}/callback`;
const ZOHOMAIL_SCOPES    = 'ZohoMail.messages.READ,ZohoMail.messages.CREATE,ZohoMail.folders.READ,ZohoMail.accounts.READ';

let zohomailServer;

async function zohomailEnsureToken() {
  let token = store.get('zohomail_access_token');
  if (!token || Date.now() > store.get('zohomail_token_expiry', 0) - 60000) {
    const refresh = store.get('zohomail_refresh_token');
    if (!refresh) throw new Error('Not authenticated');
    const p = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: store.get('zohomail_client_id'),
      client_secret: store.get('zohomail_client_secret'),
      refresh_token: refresh
    });
    const r = await axios.post(getZohoMailTokenUrl(), p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (!r.data.access_token) throw new Error(r.data.error || 'Token refresh failed');
    token = r.data.access_token;
    store.set('zohomail_access_token', token);
    store.set('zohomail_token_expiry', Date.now() + (r.data.expires_in * 1000));
  }
  return token;
}

async function zohomailGet(path, params = {}) {
  const token = await zohomailEnsureToken();
  try {
    const res = await axios.get(`${getZohoMailApiBase()}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      params
    });
    return res.data;
  } catch(e) {
    const body = e.response?.data ? JSON.stringify(e.response.data) : '';
    throw new Error(`${e.response?.status || ''} ${e.message} — ${body}`);
  }
}

async function zohomailPost(path, data) {
  const token = await zohomailEnsureToken();
  const res = await axios.post(`${getZohoMailApiBase()}${path}`, data, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

ipcMain.handle('zohomail-get-config', () => ({
  clientId:     store.get('zohomail_client_id', ''),
  clientSecret: store.get('zohomail_client_secret', ''),
  connected:    !!store.get('zohomail_access_token'),
  accountId:    store.get('zohomail_account_id', ''),
  aliases:      store.get('zohomail_aliases', []),
  region:       store.get('zohomail_region', 'com')
}));

ipcMain.handle('zohomail-save-config', (_, { clientId, clientSecret, region }) => {
  store.set('zohomail_client_id', clientId);
  store.set('zohomail_client_secret', clientSecret);
  if (region) store.set('zohomail_region', region);
  ['zohomail_access_token','zohomail_refresh_token','zohomail_token_expiry','zohomail_account_id'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('zohomail-connect', async () => {
  const clientId = store.get('zohomail_client_id');
  if (!clientId) return { error: 'No client ID configured' };
  return new Promise(resolve => {
    if (zohomailServer) { try { zohomailServer.close(); } catch(e) {} }
    zohomailServer = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') { res.end(); return; }
      const code = parsed.query.code;
      const location = parsed.query.location;
      if (!code) { res.end('<h2>Error — no authorization code received</h2>'); resolve({ error: 'No code' }); return; }
      res.end('<html><body style="font-family:Arial;text-align:center;padding:60px;background:#0d1117;color:#e6edf3"><h2 style="color:#5fa8c4">Processing…</h2><p>Exchanging token — check the app for status.</p></body></html>');
      try {
        // Auto-detect region from Zoho's location parameter if available
        if (location) {
          const regionMap = { us: 'com', eu: 'eu', in: 'in', au: 'au', jp: 'jp', ca: 'com', sa: 'com' };
          const detected = regionMap[location.toLowerCase()] || location.toLowerCase();
          if (ZOHOMAIL_REGIONS[detected]) {
            store.set('zohomail_region', detected);
            console.log('[ZohoMail] Auto-detected region:', detected, 'from location:', location);
          }
        }
        // Try token exchange with each region until one works
        let tokenData = null;
        const regionsToTry = [store.get('zohomail_region', 'com')];
        // Add other regions as fallbacks
        ['com', 'eu', 'in', 'au', 'jp'].forEach(r => { if (!regionsToTry.includes(r)) regionsToTry.push(r); });

        for (const region of regionsToTry) {
          try {
            const tokenUrl = ZOHOMAIL_REGIONS[region].accounts + '/oauth/v2/token';
            const p = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: store.get('zohomail_client_id'), client_secret: store.get('zohomail_client_secret'), redirect_uri: ZOHOMAIL_REDIRECT });
            const r = await axios.post(tokenUrl, p.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            if (r.data.access_token) {
              tokenData = r.data;
              store.set('zohomail_region', region);
              console.log('[ZohoMail] Token exchange succeeded on region:', region);
              break;
            }
          } catch(e) {
            console.log('[ZohoMail] Token exchange failed on region:', region, e.message);
          }
        }

        if (!tokenData || !tokenData.access_token) {
          zohomailServer.close();
          resolve({ error: 'Token exchange failed on all regions. Check your Client ID and Secret.' });
          return;
        }

        store.set('zohomail_access_token', tokenData.access_token);
        if (tokenData.refresh_token) store.set('zohomail_refresh_token', tokenData.refresh_token);
        store.set('zohomail_token_expiry', Date.now() + (tokenData.expires_in || 3600) * 1000);

        // Try to get account ID — also try different API regions if needed
        let gotAccount = false;
        const apiRegionsToTry = [store.get('zohomail_region', 'com')];
        ['com', 'eu', 'in', 'au', 'jp'].forEach(r => { if (!apiRegionsToTry.includes(r)) apiRegionsToTry.push(r); });

        for (const region of apiRegionsToTry) {
          try {
            const apiBase = ZOHOMAIL_REGIONS[region].mail + '/api';
            const token = store.get('zohomail_access_token');
            const acctRes = await axios.get(`${apiBase}/accounts`, {
              headers: { Authorization: `Zoho-oauthtoken ${token}` }
            });
            const acct = (acctRes.data.data || [])[0];
            if (acct && acct.accountId) {
              store.set('zohomail_region', region);
              store.set('zohomail_account_id', acct.accountId);
              const sends = acct.sendMailDetails || [];
              const aliases = sends.map(s => ({
                address: s.fromAddress,
                name: s.displayName || s.fromAddress,
                isDefault: !!(s.isDefault || s.isPrimary)
              }));
              if (!aliases.length) aliases.push({ address: 'frank@techsinno.com', name: 'Frank Muland', isDefault: true });
              store.set('zohomail_aliases', aliases);
              gotAccount = true;
              console.log('[ZohoMail] Account ID obtained on region:', region, 'ID:', acct.accountId);
              break;
            }
          } catch(e) {
            console.log('[ZohoMail] /accounts failed on region:', region, e.message);
          }
        }

        zohomailServer.close();
        if (gotAccount) {
          resolve({ success: true, region: store.get('zohomail_region') });
        } else {
          resolve({ error: 'Connected but failed to get account info. Token saved — try refreshing the page.' });
        }
      } catch(e) { zohomailServer.close(); resolve({ error: 'Connection failed: ' + e.message }); }
    });
    zohomailServer.listen(ZOHOMAIL_PORT, () => {
      // Always use accounts.zoho.com for auth - it auto-redirects to user's correct DC
      shell.openExternal(`https://accounts.zoho.com/oauth/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(ZOHOMAIL_REDIRECT)}&scope=${encodeURIComponent(ZOHOMAIL_SCOPES)}&access_type=offline&prompt=consent`);
    });
    setTimeout(() => { if (zohomailServer.listening) { zohomailServer.close(); resolve({ error: 'Timeout — no response within 2 minutes' }); } }, 120000);
  });
});

ipcMain.handle('zohomail-set-region', (_, region) => {
  if (['com','eu','in','au','jp'].includes(region)) store.set('zohomail_region', region);
  return true;
});

ipcMain.handle('zohomail-disconnect', () => {
  ['zohomail_access_token','zohomail_refresh_token','zohomail_token_expiry','zohomail_account_id','zohomail_aliases'].forEach(k => store.delete(k));
  return true;
});

ipcMain.handle('zohomail-get-inbox', async () => {
  try {
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Not connected — go to Communications to set up Zoho Mail.' };
    // Fetch folders to find the Inbox folder ID
    let folderId;
    try {
      const folders = await zohomailGet(`/accounts/${accountId}/folders`);
      const inboxFolder = (folders.data || []).find(f => f.folderName === 'Inbox' || f.path === 'Inbox');
      if (inboxFolder) folderId = inboxFolder.folderId;
    } catch(e2) { /* proceed without folderId */ }
    const params = { limit: 20 };
    if (folderId) params.folderId = folderId;
    const data = await zohomailGet(`/accounts/${accountId}/messages/view`, params);
    const msgs = data.data || [];
    const unread = msgs.filter(m => !m.isRead).length;
    return {
      success: true,
      email: 'frank@techsinno.com',
      unreadCount: unread,
      messages: msgs.map(m => ({
        id: m.messageId,
        subject: m.subject || '(no subject)',
        from: m.fromAddress || '',
        to: m.toAddress || '',
        date: m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : '',
        unread: !m.isRead
      }))
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('zohomail-get-sent', async () => {
  try {
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Not connected' };
    let sentFolder;
    try {
      const folders = await zohomailGet(`/accounts/${accountId}/folders`);
      sentFolder = (folders.data || []).find(f =>
        ['Sent','Sent Items','Sent Mail'].includes(f.folderName) || f.folderType === 'sent'
      );
    } catch(e2) { /* proceed without — folders endpoint may not be available */ }
    if (!sentFolder) return { success: true, messages: [] };
    const data = await zohomailGet(`/accounts/${accountId}/messages/view`, { limit: 20, folderId: sentFolder.folderId });
    const msgs = data.data || [];
    return {
      success: true,
      messages: msgs.map(m => ({
        id: m.messageId,
        subject: m.subject || '(no subject)',
        to: m.toAddress || '',
        from: m.fromAddress || '',
        date: m.sentDateInGMT ? new Date(parseInt(m.sentDateInGMT)).toISOString()
            : m.receivedTime ? new Date(parseInt(m.receivedTime)).toISOString() : ''
      }))
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-get-sent', async () => {
  try {
    const sentRes = await gmailGet('/messages', { q: 'in:sent', maxResults: 10 });
    const msgs = await Promise.all(
      (sentRes.messages || []).slice(0, 8).map(m =>
        gmailGet(`/messages/${m.id}`, gmailMetadataParams('Subject', 'To', 'From', 'Date'))
      )
    );
    return {
      success: true,
      messages: msgs.map(m => {
        const h = {};
        (m.payload.headers || []).forEach(x => { h[x.name] = x.value; });
        return { id: m.id, subject: h.Subject || '(no subject)', to: h.To || '', from: h.From || '', date: h.Date || '' };
      })
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-get-sent', async () => {
  try {
    const msgs = await msGet('/me/mailFolders/SentItems/messages', {
      '$select': 'subject,toRecipients,from,sentDateTime', '$top': 10, '$orderby': 'sentDateTime desc'
    });
    return {
      success: true,
      messages: (msgs.value || []).map(m => ({
        id: m.id,
        subject: m.subject || '(no subject)',
        to: (m.toRecipients || []).map(r => r.emailAddress?.address || '').join(', '),
        from: m.from?.emailAddress?.address || '',
        date: m.sentDateTime
      }))
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('zohomail-get-message', async (_, messageId) => {
  try {
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Not connected' };
    let data, folderId;
    try {
      data = await zohomailGet(`/accounts/${accountId}/messages/${messageId}/content`);
    } catch(e1) {
      let found = false;
      try {
        const folders = await zohomailGet(`/accounts/${accountId}/folders`);
        const tryFolders = (folders.data || []).filter(f =>
          f.folderName === 'Inbox' || f.path === 'Inbox' ||
          ['Sent','Sent Items','Sent Mail'].includes(f.folderName) || f.folderType === 'sent'
        );
        for (const f of tryFolders) {
          try {
            data = await zohomailGet(`/accounts/${accountId}/folders/${f.folderId}/messages/${messageId}/content`);
            folderId = f.folderId;
            found = true;
            break;
          } catch(e3) { /* try next folder */ }
        }
      } catch(e2) { /* no folders */ }
      if (!found) throw e1;
    }
    const msg = data.data || {};
    const body = (msg.content || '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    let attachments = [];
    if (msg.attachments && msg.attachments.length > 0) {
      attachments = msg.attachments.map(a => ({
        id: a.attachmentId || a.attachId || a.storeName, name: a.attachmentName || a.fileName || a.name, mimeType: a.contentType || 'application/octet-stream', size: a.attachmentSize || a.fileSize || a.size || 0, folderId
      }));
      console.log('[Zoho] Found', attachments.length, 'attachments in content response');
    } else {
      try {
        if (!folderId) {
          try {
            const folders = await zohomailGet(`/accounts/${accountId}/folders`);
            const inbox = (folders.data || []).find(f => f.folderName === 'Inbox' || f.path === 'Inbox');
            if (inbox) folderId = inbox.folderId;
          } catch {}
        }
        if (folderId) {
          try {
            const msgMeta = await zohomailGet(`/accounts/${accountId}/folders/${folderId}/messages/${messageId}`);
            const meta = msgMeta?.data || {};
            console.log('[Zoho] Message meta hasAttachment:', meta.hasAttachment, 'hasInline:', meta.hasInline);
            if (meta.hasAttachment) {
              const attRes = await zohomailGet(`/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments`);
              const attList = attRes?.data?.attachments || attRes?.data || [];
              console.log('[Zoho] Attachments API response:', JSON.stringify(attRes).substring(0, 500));
              attachments = (Array.isArray(attList) ? attList : []).map(a => ({
                id: a.attachmentId || a.attachId || a.storeName, name: a.attachmentName || a.fileName || a.name, mimeType: a.contentType || 'application/octet-stream', size: a.attachmentSize || a.fileSize || a.size || 0, folderId
              }));
            }
          } catch(metaErr) { console.log('[Zoho] Meta/attachment fetch error:', metaErr.message); }
        }
      } catch(outerErr) { console.log('[Zoho] Attachment fallback error:', outerErr.message); }
    }
    return {
      success: true,
      subject: msg.subject || '(no subject)',
      from: msg.fromAddress || msg.from || '',
      date: msg.receivedTime ? new Date(parseInt(msg.receivedTime)).toISOString() : '',
      body,
      attachments
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('zohomail-get-attachment', async (_, messageId, attachmentId, folderId) => {
  try {
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Not connected' };
    const region = store.get('zohomail_region', 'com');
    const token = store.get('zohomail_access_token');
    const baseUrl = `https://mail.zoho.${region}/api/accounts/${accountId}`;
    const url = folderId
      ? `${baseUrl}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`
      : `${baseUrl}/messages/${messageId}/attachments/${attachmentId}`;
    const res = await axios.get(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, responseType: 'arraybuffer' });
    return { success: true, data: Buffer.from(res.data).toString('base64') };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('zohomail-send', async (_, { to, subject, body, from, attachments }) => {
  try {
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Zoho Mail not connected. Set it up in Communications.' };
    const aliases = store.get('zohomail_aliases', []);
    const defaultAlias = aliases.find(a => a.isDefault) || aliases[0];
    const fromAddress = from || (defaultAlias ? defaultAlias.address : 'frank@techsinno.com');
    const payload = { fromAddress, toAddress: to, subject, content: body, mailFormat: 'plaintext' };
    if (attachments && attachments.length > 0) {
      const uploadedAtts = [];
      const token = await zohomailEnsureToken();
      const region = store.get('zohomail_region', 'com');
      for (const att of attachments) {
        try {
          const buf = Buffer.from(att.base64, 'base64');
          const FormData = require('form-data');
          const form = new FormData();
          form.append('attach', buf, { filename: att.name, contentType: att.mimeType });
          const upRes = await axios.post(`https://mail.zoho.${region}/api/accounts/${accountId}/messages/attachments?uploadType=multipart`, form, {
            headers: { ...form.getHeaders(), Authorization: `Zoho-oauthtoken ${token}` }
          });
          const upData = upRes.data?.data || upRes.data;
          const storeName = upData?.storeName || upData?.attachments?.[0]?.storeName;
          if (storeName) uploadedAtts.push({ storeName, attachmentName: att.name });
          else console.log('Zoho upload response (no storeName):', JSON.stringify(upRes.data));
        } catch(upErr) { console.log('Zoho attachment upload error:', upErr.response?.data || upErr.message); }
      }
      if (uploadedAtts.length) payload.attachments = uploadedAtts;
    }
    await zohomailPost(`/accounts/${accountId}/messages`, payload);
    return { success: true };
  } catch(e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    return { error: detail };
  }
});

ipcMain.handle('zohomail-analyze-inbox', async () => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const accountId = store.get('zohomail_account_id');
    if (!accountId) return { error: 'Zoho Mail not connected.' };
    let inboxFolder, sentFolder;
    try {
      const folders = await zohomailGet(`/accounts/${accountId}/folders`);
      inboxFolder = (folders.data||[]).find(f=>f.folderName==='Inbox'||f.path==='Inbox');
      sentFolder  = (folders.data||[]).find(f=>['Sent','Sent Items','Sent Mail'].includes(f.folderName)||f.folderType==='sent');
    } catch(e2) { /* proceed without folder IDs */ }
    const inboxParams = { limit: 15 };
    if (inboxFolder) inboxParams.folderId = inboxFolder.folderId;
    const [inboxData, sentData] = await Promise.all([
      zohomailGet(`/accounts/${accountId}/messages/view`, inboxParams),
      sentFolder ? zohomailGet(`/accounts/${accountId}/messages/view`, { limit: 10, folderId: sentFolder.folderId }) : Promise.resolve({ data: [] })
    ]);
    const inboxList = (inboxData.data||[]).map(m=>({ id:m.messageId, subject:m.subject||'(no subject)', from:m.fromAddress||'', to:m.toAddress||'', date:m.receivedTime?new Date(parseInt(m.receivedTime)).toISOString():'', unread:!m.isRead }));
    const sentList  = (sentData.data||[]).map(m=>({ subject:m.subject||'', to:m.toAddress||'', date:m.sentDateInGMT?new Date(parseInt(m.sentDateInGMT)).toISOString():'' }));
    const client = new Anthropic({ apiKey });
    const prompt = `You are an intelligent email assistant for Frank Muland, owner of TECHSINNO (Pty) Ltd — an IT services, mechatronics, PLC/SCADA automation and IoT company in South Africa.

INBOX (received, newest first):
${JSON.stringify(inboxList.map(e=>({id:e.id,from:e.from,subject:e.subject,date:e.date,unread:e.unread})))}

RECENTLY SENT (to detect unanswered):
${JSON.stringify(sentList.map(e=>({subject:e.subject,to:e.to,date:e.date})))}

Today: ${new Date().toISOString()}

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

Return ONLY this JSON (no other text):
{"important":[{"id":"<inbox_id>","subject":"...","from":"...","priority":"urgent|high","reason":"why important, max 8 words","action":"reply|review|call|pay","painPoint":"specific explicit or likely problem","techsinnoSolution":"specific TECHSINNO fit","draft":"2-4 sentence draft response or action step that references the pain and next step"}],"unanswered":[{"id":"<inbox_id>","subject":"...","from":"...","daysSinceReceived":N,"reminderDays":1}],"opportunities":[{"id":"<inbox_id>","subject":"...","from":"...","description":"business opportunity, max 10 words","painPoint":"specific problem to solve"}]}

Rules:
- important: only emails needing Frank's action (clients, invoices, deadlines, complaints, service requests). Skip system/noreply unless billing.
- unanswered: received emails >1 day old with no matching subject reply in sent folder. reminderDays: 1=urgent, 3=high, 7=normal.
- opportunities: new client inquiries, partnership requests, job/project leads.
- draft: write as Frank from Techsinno, professional but brief. Mention the real issue and one practical next step.`;
    const response = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:1200, messages:[{role:'user',content:prompt}] });
    const text = (response.content[0]?.text||'{}').trim();
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { important:[], unanswered:[], opportunities:[] };
    return { success:true, important:result.important||[], unanswered:result.unanswered||[], opportunities:result.opportunities||[], emails:inboxList };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('gmail-ai-scan', async () => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const [inboxRes, sentRes] = await Promise.all([
      gmailGet('/messages', { maxResults: 15 }),
      gmailGet('/messages', { q: 'in:sent', maxResults: 10 })
    ]);
    const [inboxMsgs, sentMsgs] = await Promise.all([
      Promise.all((inboxRes.messages||[]).slice(0,12).map(m=>gmailGet(`/messages/${m.id}`,gmailMetadataParams('Subject', 'From', 'Date')))),
      Promise.all((sentRes.messages||[]).slice(0,8).map(m=>gmailGet(`/messages/${m.id}`,gmailMetadataParams('Subject', 'To', 'Date'))))
    ]);
    const parse = (m,keys) => { const h={}; (m.payload.headers||[]).forEach(x=>{h[x.name]=x.value;}); return keys.reduce((o,k)=>{o[k]=h[k]||'';return o;},{}); };
    const inboxList = inboxMsgs.map(m=>({ id:m.id, ...parse(m,['Subject','From','Date']), subject:parse(m,['Subject']).Subject||'(no subject)', from:parse(m,['From']).From||'', date:parse(m,['Date']).Date||'', unread:(m.labelIds||[]).includes('UNREAD') }));
    const sentList  = sentMsgs.map(m=>({ ...parse(m,['Subject','To','Date']), subject:parse(m,['Subject']).Subject||'', to:parse(m,['To']).To||'', date:parse(m,['Date']).Date||'' }));
    const client = new Anthropic({ apiKey });
    const prompt = `Email assistant for Frank Muland, TECHSINNO (Pty) Ltd, South Africa - industrial electronics, automation, IoT.

INBOX:
${JSON.stringify(inboxList.map(e=>({id:e.id,from:e.from,subject:e.subject,date:e.date,unread:e.unread})))}

SENT:
${JSON.stringify(sentList.map(e=>({subject:e.subject,to:e.to,date:e.date})))}

Today: ${new Date().toISOString()}

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

Return ONLY JSON: {"important":[{"id":"...","subject":"...","from":"...","priority":"urgent|high","reason":"max 8 words","action":"reply|review|call|pay","painPoint":"specific explicit or likely problem","techsinnoSolution":"specific TECHSINNO fit","draft":"2-4 sentence draft that references the pain and next step"}],"unanswered":[{"id":"...","subject":"...","from":"...","daysSinceReceived":N,"reminderDays":1}],"opportunities":[{"id":"...","subject":"...","from":"...","description":"max 10 words","painPoint":"specific problem to solve"}]}`;
    const response = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:1200, messages:[{role:'user',content:prompt}] });
    const text = (response.content[0]?.text||'{}').trim();
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { important:[], unanswered:[], opportunities:[] };
    return { success:true, important:result.important||[], unanswered:result.unanswered||[], opportunities:result.opportunities||[], emails:inboxList };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('ms-ai-scan', async () => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const [inboxData, sentData] = await Promise.all([
      msGet('/me/messages', { '$select':'subject,from,receivedDateTime,isRead', '$top':15, '$orderby':'receivedDateTime desc' }),
      msGet('/me/mailFolders/SentItems/messages', { '$select':'subject,toRecipients,sentDateTime', '$top':10, '$orderby':'sentDateTime desc' })
    ]);
    const inboxList = (inboxData.value||[]).map(m=>({ id:m.id, subject:m.subject||'(no subject)', from:m.from?.emailAddress?.address||'', date:m.receivedDateTime||'', unread:!m.isRead }));
    const sentList  = (sentData.value||[]).map(m=>({ subject:m.subject||'', to:(m.toRecipients||[]).map(r=>r.emailAddress?.address||'').join(', '), date:m.sentDateTime||'' }));
    const client = new Anthropic({ apiKey });
    const prompt = `Email assistant for Frank Muland, TECHSINNO (Pty) Ltd, South Africa - industrial electronics, automation, IoT.

INBOX:
${JSON.stringify(inboxList.map(e=>({id:e.id,from:e.from,subject:e.subject,date:e.date,unread:e.unread})))}

SENT:
${JSON.stringify(sentList)}

Today: ${new Date().toISOString()}

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

Return ONLY JSON: {"important":[{"id":"...","subject":"...","from":"...","priority":"urgent|high","reason":"max 8 words","action":"reply|review|call|pay","painPoint":"specific explicit or likely problem","techsinnoSolution":"specific TECHSINNO fit","draft":"2-4 sentence draft that references the pain and next step"}],"unanswered":[{"id":"...","subject":"...","from":"...","daysSinceReceived":N,"reminderDays":1}],"opportunities":[{"id":"...","subject":"...","from":"...","description":"max 10 words","painPoint":"specific problem to solve"}]}`;
    const response = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:1200, messages:[{role:'user',content:prompt}] });
    const text = (response.content[0]?.text||'{}').trim();
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { important:[], unanswered:[], opportunities:[] };
    return { success:true, important:result.important||[], unanswered:result.unanswered||[], opportunities:result.opportunities||[], emails:inboxList };
  } catch(e) { return { error: e.message }; }
});

// ─── HUNTER.IO EMAIL FINDER ───────────────────────────────────────────────────

ipcMain.handle('hunter-get-key', () => ({ key: store.get('hunter_api_key', '') }));
ipcMain.handle('hunter-save-key', (_, key) => { store.set('hunter_api_key', key); return true; });
ipcMain.handle('hunter-search', async (_, domain) => {
  try {
    const key = store.get('hunter_api_key');
    if (!key) return { error: 'No Hunter.io API key — add it in Settings.' };
    const r = await axios.get('https://api.hunter.io/v2/domain-search', {
      params: { domain, api_key: key, limit: 10 },
      timeout: 8000
    });
    const emails = (r.data?.data?.emails || [])
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .map(e => ({
        email:      e.value,
        name:       [e.first_name, e.last_name].filter(Boolean).join(' '),
        position:   e.position || '',
        confidence: e.confidence || 0
      }));
    const pattern = r.data?.data?.pattern || '';
    const org     = r.data?.data?.organization || '';
    return { success: true, emails, pattern, org, domain };
  } catch(e) {
    const msg = e.response?.data?.errors?.[0]?.details || e.response?.data?.error || e.message;
    return { error: msg };
  }
});

// ─── AI OUTREACH AGENT ────────────────────────────────────────────────────────

const crypto = require('crypto');
function uid() { return crypto.randomBytes(8).toString('hex'); }

const TECHSINNO_DIAGNOSTIC_OUTREACH_RULES = `
Act as a practical industrial problem-spotter for TECHSINNO, not a generic copywriter.

For every lead, sector, or company:
- Infer one likely operational pain from the sector/company context. Label it as "likely" unless the source explicitly says it.
- Tie the pain to one TECHSINNO service: PCB repair, PLC/SCADA automation, IoT monitoring, diagnostics, control-panel review, preventive maintenance.
- Suggest a low-friction first step Frank can offer.
- Keep tone technical, humble, and specific.
- Do not invent past clients, completed jobs, case studies, certifications, or guaranteed savings.
- Avoid generic phrases like "innovative solutions", "streamline your operations", "cutting-edge technology", "we understand your needs".
- Vary the opening line. Do not start multiple emails the same way.

Return drafts that make the company feel seen:
1. name the likely problem;
2. explain why it matters operationally;
3. offer a small practical next step.
`;

async function fetchUpworkRSS() {
  const queries = ['PLC SCADA South Africa', 'industrial automation South Africa', 'PCB electronics repair', 'IoT monitoring South Africa'];
  const results = []; const seen = new Set();
  for (const q of queries) {
    try {
      const r = await axios.get(`https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(q)}&sort=recency`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      const items = r.data.match(/<item>([\s\S]*?)<\/item>/g) || [];
      items.slice(0, 4).forEach(item => {
        const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || '';
        const link  = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() || '';
        const desc  = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,300) || '';
        if (title && link && !seen.has(link)) { seen.add(link); results.push({ platform:'Upwork', title, url:link, description:desc, query:q }); }
      });
    } catch(e) { /* skip */ }
  }
  return results;
}

ipcMain.handle('agent-get-queue', async () => {
  try {
    const apiBase = getApiBase();
    if (apiBase && store.get('auth_token')) {
      await ensureElectronToken();
      const token = store.get('auth_token');
      const res = await axios.get(`${apiBase}/api/agent/queue`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Techsinno-Token': token
        },
        timeout: 15000
      });
      if (res.data && res.data.success) {
        store.set('agent_queue', res.data.queue || []);
        store.set('agent_last_scan', res.data.lastScan || null);
      }
    }
  } catch {}
  return {
    queue: store.get('agent_queue', []),
    lastScan: store.get('agent_last_scan', null),
    opportunities: store.get('agent_opportunities', [])
  };
});

async function agentCloudSaveQueue() {
  try {
    const apiBase = getApiBase();
    if (!apiBase || !store.get('auth_token')) return;
    await ensureElectronToken();
    const token = store.get('auth_token');
    await axios.put(`${apiBase}/api/agent/queue`, {
      queue: store.get('agent_queue', []),
      lastScan: store.get('agent_last_scan', null)
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Techsinno-Token': token,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  } catch {}
}

ipcMain.handle('agent-dismiss', async (_, id) => {
  const q = store.get('agent_queue', []);
  const i = q.findIndex(x => x.id === id);
  if (i !== -1) { q[i].status = 'dismissed'; store.set('agent_queue', q); }
  await agentCloudSaveQueue();
  return true;
});

ipcMain.handle('agent-clear-history', async () => {
  store.set('agent_queue', store.get('agent_queue', []).filter(i => i.status === 'pending'));
  await agentCloudSaveQueue();
  return true;
});

ipcMain.handle('agent-approve', async (_, item) => {
  try {
    let result = { success: true };
    if ((item.type === 'email_reply' || item.type === 'cold_email' || item.type === 'quote_draft') && item.to) {
      if (item.provider === 'zohomail') {
        const accountId = store.get('zohomail_account_id');
        if (!accountId) throw new Error('Zoho Mail not connected');
        const zmAliases = store.get('zohomail_aliases', []);
        const zmDefault = zmAliases.find(a => a.isDefault) || zmAliases[0];
        await zohomailPost(`/accounts/${accountId}/messages`, {
          fromAddress: item.from || (zmDefault ? zmDefault.address : 'frank@techsinno.com'),
          toAddress: item.to,
          subject: item.subject,
          content: item.body,
          mailFormat: 'plaintext'
        });
      } else if (item.provider === 'gmail') {
        const raw = Buffer.from(`To: ${item.to}\r\nSubject: ${item.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${item.body}`).toString('base64url');
        const token = await gmailEnsureToken();
        await axios.post(`${GMAIL_API_BASE}/messages/send`, { raw }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      } else {
        const token = await msEnsureToken();
        await axios.post(`${MS_API_BASE}/me/sendMail`, { message: { subject: item.subject, body: { contentType: 'Text', content: item.body }, toRecipients: [{ emailAddress: { address: item.to } }] } }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      }
    } else if (item.type === 'linkedin_post') {
      result = { approved: true };
    } else if (item.type === 'opportunity' && item.url) {
      shell.openExternal(item.url);
    }
    const q = store.get('agent_queue', []);
    const i = q.findIndex(x => x.id === item.id);
    if (i !== -1) { q[i].status = 'approved'; q[i].approvedAt = Date.now(); store.set('agent_queue', q); }
    await agentCloudSaveQueue();
    return result;
  } catch(e) {
    const q = store.get('agent_queue', []);
    const i = q.findIndex(x => x.id === item.id);
    if (i !== -1) { q[i].status = 'error'; q[i].errorMsg = e.message; store.set('agent_queue', q); }
    await agentCloudSaveQueue();
    return { error: e.message };
  }
});

ipcMain.handle('agent-run-scan', async () => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const client = new Anthropic({ apiKey });
    const newItems = []; const errors = [];
    const existingIds = new Set(store.get('agent_queue', []).map(i => i.emailId || i.url).filter(Boolean));

    // 1 — Zoho Mail (frank@techsinno.com) unread business leads
    if (store.get('zohomail_access_token')) {
      try {
        const accountId = store.get('zohomail_account_id');
        const data = await zohomailGet(`/accounts/${accountId}/messages/view`, { limit: 10, sortcolumn: 'date', sortorder: 'desc' });
        const unread = (data.data || []).filter(m => !m.isRead);
        if (unread.length) {
          const emailData = unread.map(m => ({ id: m.messageId, subject: m.subject||'(no subject)', from: m.fromAddress||'', snippet: m.summary||'' }));
          const r = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:2000, messages:[{role:'user',content:`You are Frank Muland's AI agent for TECHSINNO (Pty) Ltd, Kuilsriver, Western Cape, SA. Services: PCB repair, factory automation (PLC/SCADA), IoT monitoring. Reg: 2022/364165/07. Business email: frank@techsinno.com.

Find business-relevant unread emails (leads, quote requests, client queries, important business matters). Skip newsletters and automated notifications.
${JSON.stringify(emailData)}

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

For each qualifying email, diagnose the real business/technical issue before drafting a reply. Also extract company and contact name from the sender. Return ONLY valid JSON array:
[{"emailId":"id","type":"email_reply","priority":1-5,"flagType":"lead|quote_request|urgent|follow_up","reason":"why important (max 8 words)","toAddress":"sender email","companyName":"company name from email/signature or domain (best guess)","contactName":"sender's name","industry":"manufacturing|mining|agriculture|logistics|energy|food_processing|construction|other","painPoint":"specific likely or explicit operational problem","evidence":"email phrase/domain/sector used; say assumption if inferred","techsinnoSolution":"which TECHSINNO service fits and why","nextStep":"small practical next step to offer","subject":"specific Re: subject","body":"professional reply (3-5 sentences) that references the painPoint and nextStep. End with:\\nBest regards,\\nFrank Muland\\nTECHSINNO (Pty) Ltd\\nfrank@techsinno.com\\nwww.techsinno.com"}]
Return [] if none qualify.`}] });
          const m = (r.content[0]?.text||'[]').trim().match(/\[[\s\S]*\]/);
          (m ? JSON.parse(m[0]) : []).forEach(item => {
            if (!existingIds.has(item.emailId)) {
              newItems.push({ id:uid(), type:'email_reply', source:'zohomail', emailId:item.emailId, priority:item.priority||3, flagType:item.flagType||'lead', title:item.subject, reason:item.reason, to:item.toAddress||'', subject:item.subject, body:item.body, provider:'zohomail', companyName:item.companyName||'', contactName:item.contactName||'', industry:item.industry||'other', painPoint:item.painPoint||'', evidence:item.evidence||'', techsinnoSolution:item.techsinnoSolution||'', nextStep:item.nextStep||'', status:'pending', createdAt:Date.now() });
              existingIds.add(item.emailId);
            }
          });
        }
      } catch(e) { errors.push('Zoho Mail: '+e.message); }
    }

    // 1b — Gmail unread leads (fallback if Gmail also connected)
    if (store.get('gmail_access_token')) {
      try {
        const res = await gmailGet('/messages', { maxResults: 10, q: 'is:unread -from:noreply -from:no-reply' });
        const msgs = await Promise.all((res.messages || []).slice(0, 8).map(m => gmailGet(`/messages/${m.id}`, gmailMetadataParams('Subject', 'From', 'Date'))) );
        const emailData = msgs.map(m => { const h={}; (m.payload.headers||[]).forEach(x=>{h[x.name]=x.value;}); return {id:m.id,subject:h.Subject||'(no subject)',from:h.From||'',snippet:m.snippet||''}; });
        const r = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:2000, messages:[{role:'user',content:`You are Frank Muland's AI agent for TECHSINNO (Pty) Ltd, Kuilsriver, Western Cape, SA. Services: PCB repair, factory automation (PLC/SCADA), IoT monitoring. Reg: 2022/364165/07.

Find business-relevant unread emails (leads, quote requests, client queries, important business matters). Skip newsletters and automated notifications.
${JSON.stringify(emailData)}

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

For each qualifying email, diagnose the real business/technical issue before drafting a reply. Also extract company and contact name from the sender. Return ONLY valid JSON array:
[{"emailId":"id","type":"email_reply","priority":1-5,"flagType":"lead|quote_request|urgent|follow_up","reason":"why important (max 8 words)","toAddress":"sender email","companyName":"company name from email/signature or domain (best guess)","contactName":"sender's name","industry":"manufacturing|mining|agriculture|logistics|energy|food_processing|construction|other","painPoint":"specific likely or explicit operational problem","evidence":"email phrase/domain/sector used; say assumption if inferred","techsinnoSolution":"which TECHSINNO service fits and why","nextStep":"small practical next step to offer","subject":"specific Re: subject","body":"professional reply (3-5 sentences) that references the painPoint and nextStep. End with:\\nBest regards,\\nFrank Muland\\nTECHSINNO (Pty) Ltd\\nfrank@techsinno.com\\nwww.techsinno.com"}]
Return [] if none qualify.`}] });
        const m = (r.content[0]?.text||'[]').trim().match(/\[[\s\S]*\]/);
        (m ? JSON.parse(m[0]) : []).forEach(item => {
          if (!existingIds.has(item.emailId)) {
            newItems.push({ id:uid(), type:'email_reply', source:'gmail', emailId:item.emailId, priority:item.priority||3, flagType:item.flagType||'lead', title:item.subject, reason:item.reason, to:item.toAddress||'', subject:item.subject, body:item.body, provider:'gmail', companyName:item.companyName||'', contactName:item.contactName||'', industry:item.industry||'other', painPoint:item.painPoint||'', evidence:item.evidence||'', techsinnoSolution:item.techsinnoSolution||'', nextStep:item.nextStep||'', status:'pending', createdAt:Date.now() });
            existingIds.add(item.emailId);
          }
        });
      } catch(e) { errors.push('Gmail: '+e.message); }
    }

    // 2 — Upwork opportunities
    try {
      const jobs = await fetchUpworkRSS();
      if (jobs.length) {
        const r = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:1500, messages:[{role:'user',content:`TECHSINNO (Pty) Ltd — PCB repair, factory automation (PLC/SCADA), IoT monitoring, Western Cape SA.
From these Upwork jobs pick the top 3 most relevant (relevance >= 6):
${JSON.stringify(jobs.map(j=>({title:j.title,description:j.description,url:j.url})))}
Return ONLY valid JSON array:
[{"title":"job title","url":"url","relevance":1-10,"reason":"why relevant (8 words)","bidProposal":"2-3 sentence professional bid from Frank Muland at TECHSINNO"}]
Return [] if none qualify.`}] });
        const m = (r.content[0]?.text||'[]').trim().match(/\[[\s\S]*\]/);
        (m ? JSON.parse(m[0]) : []).forEach(item => {
          if (!existingIds.has(item.url)) {
            newItems.push({ id:uid(), type:'opportunity', source:'upwork', priority:Math.ceil((10-item.relevance)/2), flagType:'opportunity', title:item.title, reason:item.reason, url:item.url, platform:'Upwork', body:item.bidProposal, status:'pending', createdAt:Date.now() });
            existingIds.add(item.url);
          }
        });
        store.set('agent_opportunities', jobs.slice(0,10));
      }
    } catch(e) { errors.push('Upwork: '+e.message); }

    // 3 — LinkedIn posts (2)
    try {
      const r = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:1600, messages:[{role:'user',content:`Write 2 LinkedIn posts for Frank Muland, founder of TECHSINNO (Pty) Ltd, Kuilsriver, Western Cape, SA. Services offered: PCB board repair, factory automation (PLC/SCADA), IoT monitoring. Business is newly launched and has not yet completed client jobs.

STRICT RULES — these posts must NOT:
- Mention any past clients, jobs, case studies, or success stories (we have none yet)
- Use phrases like "we recently", "last week", "a client came to us", "we fixed", "we deployed for"
- Invent or imply any completed work

Posts MUST:
- Be written in first person as Frank (founder)
- Identify a REAL, well-known pain point in SA industry (load shedding damage to PLCs, PCB failures from power surges, lack of local repair options, high cost of importing replacement boards, factory downtime)
- Explain clearly what TECHSINNO offers as a solution to that specific problem
- Position TECHSINNO as available and ready to help — not as someone who has already helped
- Sound like a knowledgeable engineer sharing expertise, not a marketing agency
- Be 3-4 short paragraphs, end with 5-7 relevant hashtags
- Vary topics: one about PCB repair/electronics, one about automation/IoT/monitoring

Return ONLY valid JSON array:
[{"topic":"short topic name","content":"full post text with hashtags"}]`}] });
      const m = (r.content[0]?.text||'[]').trim().match(/\[[\s\S]*\]/);
      (m ? JSON.parse(m[0]) : []).forEach(item => {
        newItems.push({ id:uid(), type:'linkedin_post', source:'generated', priority:3, flagType:'content', title:'LinkedIn: '+item.topic, reason:'AI-drafted post', body:item.content, status:'pending', createdAt:Date.now() });
      });
    } catch(e) { errors.push('LinkedIn posts: '+e.message); }

    // 4 — Cold outreach emails (2, targeting sectors) with suggested targets
    try {
      const r = await client.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens:2600, messages:[{role:'user',content:`Create 2 diagnostic outreach opportunities for Frank Muland, TECHSINNO (Pty) Ltd, targeting Western Cape businesses.

${TECHSINNO_DIAGNOSTIC_OUTREACH_RULES}

Target different sectors each time from: manufacturing, food processing, farming/agriculture, cold storage, medical devices, packaging, wineries, fisheries.

For each sector:
- Identify a likely operational problem that companies in that sector actually face in the Western Cape/South Africa.
- Explain why that problem hurts operations.
- Match it to a specific TECHSINNO service.
- Give Frank a small first-step offer.
- Draft a short email that feels written for that sector, not a template.

For each sector also provide 5 target-company ideas in the Western Cape, South Africa. If you are not fully sure a company is a perfect fit, mark it as "verify". Include the job title/persona Frank should contact, not a made-up person's name.

Return ONLY valid JSON array:
[{
  "targetSector": "sector name",
  "painPoint": "specific likely operational problem",
  "evidence": "sector/company reason; label assumptions",
  "techsinnoSolution": "specific TECHSINNO service and why it fits",
  "nextStep": "small practical first step",
  "subject": "specific subject line",
  "body": "email body, 4-6 short sentences, referencing the painPoint and nextStep, ending with:\\nBest regards,\\nFrank Muland\\nTECHSINNO (Pty) Ltd\\n+27 XX XXX XXXX\\nfrank@techsinno.com\\nwww.techsinno.com\\nKuilsriver, Western Cape",
  "contactTitle": "e.g. Maintenance Manager or Operations Engineer",
  "targets": [
    {"company": "Company Name", "website": "www.example.co.za", "area": "Cape Town / Paarl / Stellenbosch / etc", "contactTitle": "Maintenance Manager", "confidence": "known|verify"}
  ]
}]`}] });
      const m = (r.content[0]?.text||'[]').trim().match(/\[[\s\S]*\]/);
      (m ? JSON.parse(m[0]) : []).forEach(item => {
        newItems.push({ id:uid(), type:'cold_email', source:'generated', priority:4, flagType:'outreach', title:'Problem scout: '+item.targetSector, reason:item.painPoint||('Targeting '+item.targetSector+' sector'), to:'', subject:item.subject, body:item.body, provider:'zohomail', targetSector:item.targetSector, contactTitle:item.contactTitle||'', targets:item.targets||[], painPoint:item.painPoint||'', evidence:item.evidence||'', techsinnoSolution:item.techsinnoSolution||'', nextStep:item.nextStep||'', status:'pending', createdAt:Date.now() });
      });
    } catch(e) { errors.push('Cold emails: '+e.message); }

    // 5 — Enhance Upwork queries using website services if available
    const wsServices = store.get('website_services', {});
    if (wsServices.services && wsServices.services.length) {
      try {
        const extraQuery = wsServices.services.slice(0, 3).join(' OR ') + ' South Africa';
        const r2 = await axios.get(`https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(extraQuery)}&sort=recency`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const items2 = r2.data.match(/<item>([\s\S]*?)<\/item>/g) || [];
        items2.slice(0, 3).forEach(item => {
          const title = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || '';
          const link  = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() || '';
          const desc  = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g,' ').trim().slice(0,300) || '';
          if (title && link && !existingIds.has(link)) {
            newItems.push({ id:uid(), type:'opportunity', source:'website_match', priority:2, flagType:'opportunity', title, reason:'Matches your website services', url:link, platform:'Upwork (website match)', body:desc, status:'pending', createdAt:Date.now() });
            existingIds.add(link);
          }
        });
      } catch(e) { errors.push('Website-enhanced search: '+e.message); }
    }

    // 6 — Manual task reminders
    const manualTasks = store.get('manual_tasks', []);
    const now2 = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    manualTasks.filter(t => t.status !== 'done' && t.deadline).forEach(task => {
      const dl = new Date(task.deadline).getTime();
      const overdue = dl < now2;
      const soon = dl < now2 + threeDays;
      const remId = 'task_' + task.id;
      if ((overdue || soon) && !existingIds.has(remId)) {
        const daysLeft = Math.ceil((dl - now2) / 86400000);
        newItems.push({ id:uid(), type:'task_reminder', source:'manual_task', taskId:task.id, priority:overdue?1:2, flagType:overdue?'urgent':'follow_up', title:(overdue?'OVERDUE: ':'Due soon: ')+task.title, reason:overdue?'Task is overdue':'Due in '+Math.abs(daysLeft)+' day(s)', body:task.description||'', status:'pending', createdAt:Date.now() });
        existingIds.add(remId);
      }
    });

    const merged = [...store.get('agent_queue', []), ...newItems];
    store.set('agent_queue', merged);
    store.set('agent_last_scan', Date.now());
    await agentCloudSaveQueue();

    // Auto-create CRM entries for email leads and cold email targets
    let crmCreated = 0;
    const apiBase = getApiBase();
    if (apiBase && store.get('auth_token')) {
      try {
        await ensureElectronToken();
        const token = store.get('auth_token');
        const headers = {
          Authorization: `Bearer ${token}`,
          'X-Techsinno-Token': token,
          'Content-Type': 'application/json'
        };

        // Get existing CRM emails to avoid duplicates
        let existingEmails = new Set();
        try {
          const crmRes = await axios.get(`${apiBase}/api/clients`, { headers });
          ((crmRes.data && crmRes.data.clients) || []).forEach(c => {
            if (c.email) existingEmails.add(c.email.toLowerCase());
          });
        } catch {}

        // Create CRM entries from email leads
        for (const item of newItems) {
          if ((item.flagType === 'lead' || item.flagType === 'quote_request') && item.to && !existingEmails.has(item.to.toLowerCase())) {
            try {
              await axios.post(`${apiBase}/api/clients`, {
                companyName: item.companyName || item.to.split('@')[1]?.split('.')[0] || 'Unknown',
                contactName: item.contactName || '',
                email: item.to,
                source: item.source === 'gmail' ? 'website' : 'cold_email',
                industry: item.industry || 'other',
                status: 'lead',
                notes: `Auto-captured from ${item.provider || 'email'} scan: ${item.reason || item.title || ''}`
              }, { headers });
              existingEmails.add(item.to.toLowerCase());
              crmCreated++;
            } catch {}
          }

          // Also create CRM entries from cold email target companies
          if (item.type === 'cold_email' && item.targets && item.targets.length) {
            for (const target of item.targets) {
              const targetKey = (target.company || '').toLowerCase();
              if (targetKey && !existingEmails.has(targetKey)) {
                try {
                  await axios.post(`${apiBase}/api/clients`, {
                    companyName: target.company,
                    contactName: item.contactTitle || '',
                    industry: item.targetSector === 'food processing' ? 'food_processing' : (item.targetSector || 'other'),
                    source: 'cold_email',
                    status: 'lead',
                    notes: `AI-generated target (${item.targetSector || 'general'}). ${target.area || ''}. Contact role: ${target.contactTitle || 'N/A'}`
                  }, { headers });
                  existingEmails.add(targetKey);
                  crmCreated++;
                } catch {}
              }
            }
          }
        }
      } catch {}
    }

    return { success:true, newItems:newItems.length, crmCreated, errors, pendingTotal:merged.filter(i=>i.status==='pending').length };
  } catch(e) { return { error: e.message }; }
});

// ─── CLOUDFLARE ANALYTICS ────────────────────────────────────────────────────

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

ipcMain.handle('cf-get-config', () => ({
  apiToken: store.get('cf_api_token', ''),
  zoneId:   store.get('cf_zone_id', ''),
  configured: !!(store.get('cf_api_token') && store.get('cf_zone_id'))
}));

ipcMain.handle('cf-save-config', (_, { apiToken, zoneId }) => {
  store.set('cf_api_token', apiToken);
  store.set('cf_zone_id', zoneId);
  return true;
});

ipcMain.handle('cf-get-traffic', async () => {
  try {
    const token  = store.get('cf_api_token');
    const zoneId = store.get('cf_zone_id');
    if (!token || !zoneId) return { error: 'Cloudflare not configured' };
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const until = new Date().toISOString().split('T')[0];
    const query = `{
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequests1dGroups(limit: 7, filter: { date_geq: "${since}", date_leq: "${until}" }) {
            sum { pageViews requests bytes threats }
            uniq { uniques }
          }
        }
      }
    }`;
    const res = await axios.post('https://api.cloudflare.com/client/v4/graphql',
      { query },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (res.data.errors) throw new Error(res.data.errors[0]?.message || 'GraphQL error');
    const groups = res.data.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    const totals = groups.reduce((acc, g) => ({
      pageviews:      acc.pageviews      + (g.sum.pageViews || 0),
      requests:       acc.requests       + (g.sum.requests  || 0),
      bandwidth:      acc.bandwidth      + (g.sum.bytes     || 0),
      threats:        acc.threats        + (g.sum.threats   || 0),
      uniqueVisitors: acc.uniqueVisitors + (g.uniq.uniques  || 0)
    }), { pageviews: 0, requests: 0, bandwidth: 0, threats: 0, uniqueVisitors: 0 });
    return { success: true, ...totals, period: '7 days' };
  } catch(e) { return { error: e.message }; }
});

// ─── WEBSITE JOBS / SERVICES FETCH ───────────────────────────────────────────

ipcMain.handle('fetch-website-jobs', async () => {
  try {
    const res = await axios.get('https://www.techsinno.com', {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const text = res.data
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);

    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { success: true, services: [], jobTypes: [], targetMarkets: [], text };

    const client = new Anthropic({ apiKey });
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: `Extract the key services and offerings from this TECHSINNO company website. Return ONLY valid JSON:
{"services":["service 1","service 2"],"jobTypes":["project/job type 1"],"targetMarkets":["market 1"]}

Content: ${text}` }]
    });
    const m = (r.content[0]?.text || '{}').trim().match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    store.set('website_services', parsed);
    return { success: true, ...parsed, text: text.slice(0, 500) };
  } catch(e) { return { error: e.message }; }
});

// ─── AGENT RESET ─────────────────────────────────────────────────────────────

ipcMain.handle('agent-reset', async () => {
  store.set('agent_queue', []);
  store.set('agent_last_scan', null);
  await agentCloudSaveQueue();
  return true;
});

// ─── MANUAL TASKS ────────────────────────────────────────────────────────────

ipcMain.handle('manual-tasks-get', () => store.get('manual_tasks', []));

ipcMain.handle('manual-tasks-upsert', (_, task) => {
  const tasks = store.get('manual_tasks', []);
  const idx = tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) tasks[idx] = task;
  else tasks.unshift({ ...task, id: uid(), createdAt: Date.now() });
  store.set('manual_tasks', tasks);
  return true;
});

ipcMain.handle('manual-tasks-delete', (_, id) => {
  store.set('manual_tasks', store.get('manual_tasks', []).filter(t => t.id !== id));
  return true;
});

// ─── ZOHO JOB CARDS ──────────────────────────────────────────────────────────

ipcMain.handle('zoho-get-quotes', async () => {
  try {
    const [estRes, invRes] = await Promise.all([
      zohoGet('/estimates', { per_page: 50, sort_column: 'date', sort_order: 'descending' }).catch(() => ({ estimates: [] })),
      zohoGet('/invoices', { per_page: 50, sort_column: 'date', sort_order: 'descending' }).catch(() => ({ invoices: [] }))
    ]);
    return {
      success: true,
      estimates: (estRes.estimates || []).map(e => ({
        id: e.estimate_id, number: e.estimate_number, client: e.customer_name,
        amount: e.total, date: e.date, status: e.status, type: 'estimate'
      })),
      invoices: (invRes.invoices || []).filter(i => i.status !== 'paid').map(i => ({
        id: i.invoice_id, number: i.invoice_number, client: i.customer_name,
        amount: i.total, date: i.date, status: i.status, type: 'invoice'
      }))
    };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('job-card-create', async (_, { docId, docType }) => {
  try {
    const apiKey = store.get('anthropic_api_key');
    if (!apiKey) return { error: 'No Claude API key — add it in Settings.' };
    const endpoint = docType === 'estimate' ? `/estimates/${docId}` : `/invoices/${docId}`;
    const data = await zohoGet(endpoint);
    const doc = data.estimate || data.invoice || {};
    const lineItems = (doc.line_items || []).map(l => ({
      name: l.name, description: l.description, quantity: l.quantity,
      unit: l.unit, rate: l.rate, amount: l.item_total
    }));
    const client = new Anthropic({ apiKey });
    const prompt = `You are a senior technical advisor for TECHSINNO (Pty) Ltd — mechatronics and industrial electronics, Kuilsriver, Western Cape, SA. Services: PCB board repair, factory automation (PLC/SCADA), IoT monitoring.

Create a job card for this ${docType === 'estimate' ? 'quote' : 'invoice'}:
Client: ${doc.customer_name || 'Unknown'}
Document: ${doc.estimate_number || doc.invoice_number || docId}
Date: ${doc.date || ''}
Total: R${doc.total || 0}
Notes: ${doc.notes || doc.terms || ''}
Line items:
${JSON.stringify(lineItems, null, 2)}

Return ONLY valid JSON:
{
  "jobTitle": "concise job title (max 8 words)",
  "summary": "2-3 sentence technical summary",
  "partsNeeded": [{"item":"name","spec":"specs/part number","qty":1,"estimatedCostZAR":0,"saSuppliers":["RS Components SA"]}],
  "toolsRequired": ["tool"],
  "laborSteps": ["step 1","step 2"],
  "estimatedHours": 0,
  "outsourceOptions": [{"task":"what","reason":"why","suggestedProviders":["SA provider"]}],
  "approach": "3-4 sentence practical recommended approach",
  "costBreakdown": {"parts":0,"labor":0,"contingency":0,"total":0},
  "risks": ["risk"],
  "priority": "high|medium|low",
  "tags": ["PCB","PLC"]
}

SA suppliers: RS Components SA (rsonline.co.za), Micro Robotics (robotics.org.za), BEF Electronics, Communica (communica.co.za), PME Electronics, Altronics SA, DigiKey (international). Labor rate: R450/hr.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = (response.content[0]?.text || '{}').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'AI failed to generate job card — try again' };
    const jobData = JSON.parse(match[0]);
    const card = {
      id: uid(), docId, docType,
      docNumber: doc.estimate_number || doc.invoice_number || '',
      client: doc.customer_name || '', docDate: doc.date || '',
      docTotal: doc.total || 0, lineItems, ...jobData,
      createdAt: Date.now(), status: 'active'
    };
    const cards = store.get('job_cards', []);
    cards.unshift(card);
    store.set('job_cards', cards);
    return { success: true, card };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('job-cards-get', () => ({ cards: store.get('job_cards', []) }));

ipcMain.handle('job-card-delete', (_, id) => {
  store.set('job_cards', store.get('job_cards', []).filter(c => c.id !== id));
  return true;
});
