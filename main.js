const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
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

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

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

  if (Date.now() > expiry - 60000) {
    const refresh = store.get('zoho_refresh_token');
    if (!refresh) throw new Error('Not authenticated');
    const r = await axios.post(ZOHO_TOKEN_URL, null, {
      params: {
        grant_type: 'refresh_token',
        client_id: store.get('zoho_client_id'),
        client_secret: store.get('zoho_client_secret'),
        refresh_token: refresh
      }
    });
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
      zohoGet('/invoices', { status: 'all', per_page: 200 }),
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
    return { error: e.message };
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
    const token = await odEnsureToken();
    await axios.put(
      `${OD_API_BASE}/me/drive/root:/${OD_FILE_PATH}:/content`,
      JSON.stringify(data, null, 2),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, ts: new Date().toISOString() };
  } catch(e) { return { error: e.message }; }
});

ipcMain.handle('sync-load', async () => {
  try {
    const token = await odEnsureToken();
    const res = await axios.get(
      `${OD_API_BASE}/me/drive/root:/${OD_FILE_PATH}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { success: true, data: res.data };
  } catch(e) {
    if (e.response && e.response.status === 404) return { success: true, data: null };
    return { error: e.message };
  }
});

// ─── OPEN EXTERNAL URL ────────────────────────────────────────────────────────

ipcMain.handle('open-url', (_, u) => { shell.openExternal(u); return true; });

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
        gmailGet(`/messages/${m.id}`, { format: 'metadata', metadataHeaders: 'Subject,From,Date' })
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

ipcMain.handle('gmail-send', async (_, { to, subject, body }) => {
  try {
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
    await gmailPost('/messages/send', { raw });
    return { success: true };
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

ipcMain.handle('ms-send', async (_, { to, subject, body }) => {
  try {
    await msPost('/me/sendMail', { message: { subject, body: { contentType: 'Text', content: body }, toRecipients: [{ emailAddress: { address: to } }] } });
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
const LI_SCOPES    = 'r_liteprofile r_organization_social';

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
      axios.get(`${LI_API_BASE}/me`, { headers }).catch(() => null),
      orgId ? axios.get(`${LI_API_BASE}/organizations/${orgId}`, { headers }).catch(() => null) : Promise.resolve(null)
    ]);
    const followersRes = orgId ? await axios.get(
      `${LI_API_BASE}/networkSizes/urn%3Ali%3Aorganization%3A${orgId}?edgeType=CompanyFollowedByMember`,
      { headers }
    ).catch(() => null) : null;
    return {
      success: true,
      name: profile?.data?.localizedFirstName ? `${profile.data.localizedFirstName} ${profile.data.localizedLastName}` : '',
      orgName: org?.data?.localizedName || org?.data?.name?.localized?.en_US || '',
      followers: followersRes?.data?.firstDegreeSize || 0,
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
