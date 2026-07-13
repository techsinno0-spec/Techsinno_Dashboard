const SERVICES = [
  { key: 'zoho_books', label: 'Zoho Books', icon: 'ti-chart-bar', fields: ['clientId', 'clientSecret', 'region', 'orgId'], note: 'Bookkeeping, invoices, expenses, reports. Owner-only.' },
  { key: 'zoho_mail', label: 'Zoho Mail', icon: 'ti-mail', fields: ['clientId', 'clientSecret', 'region'], note: 'Primary company mailbox for customer replies and AI email scans.' },
  { key: 'gmail', label: 'Gmail', icon: 'ti-brand-gmail', fields: ['clientId', 'clientSecret', 'email'], note: 'Google mailbox connection for shared inbox workflows. Use the Gmail account you want the dashboard to read.' },
  { key: 'outlook', label: 'Outlook', icon: 'ti-brand-windows', fields: ['clientId', 'clientSecret'], note: 'Microsoft mailbox connection for shared inbox workflows.' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin', fields: ['clientId', 'clientSecret'], note: 'Company page/social publishing connection.' },
  { key: 'claude', label: 'Claude AI', icon: 'ti-robot', fields: ['apiKey'], note: 'AI assistant key used for drafts, scans, suggestions, and analysis.' },
  { key: 'hunter', label: 'Hunter.io', icon: 'ti-search', fields: ['apiKey'], note: 'Email finder for outreach lead discovery.' },
  { key: 'cloudflare', label: 'Cloudflare', icon: 'ti-cloud', fields: ['apiKey', 'zoneId'], note: 'Website analytics for techsinno.com traffic.' },
  { key: 'onedrive', label: 'OneDrive', icon: 'ti-cloud-upload', fields: ['clientId', 'clientSecret'], note: 'Optional Microsoft/OneDrive file sync and backup connection.' },
  { key: 'account_details', label: 'Account Details', icon: 'ti-building', fields: ['companyName', 'registrationNumber', 'email', 'phone', 'address', 'website', 'ownerName'], note: 'Company identity, primary email, and address.' }
];

const FIELD_LABELS = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  orgId: 'Organization ID',
  apiKey: 'API Key',
  zoneId: 'Zone ID',
  region: 'Region',
  companyName: 'Company Name',
  registrationNumber: 'Registration Number',
  email: 'Primary Email',
  phone: 'Phone',
  address: 'Address',
  website: 'Website',
  ownerName: 'Owner Name'
};

const CONFIG_CACHE = {};
const OAUTH_SERVICES = ['zoho_books', 'zoho_mail', 'gmail', 'outlook'];
const PUBLIC_DASHBOARD_BASE = 'https://nice-bay-095935e10.7.azurestaticapps.net';
const OAUTH_POLLERS = {};

async function render_settings() {
  if (!isOwner()) return;
  const el = document.getElementById('page-settings');

  el.innerHTML = `
    <p style="color:var(--text3);font-size:12px;margin-bottom:16px">
      Manage API credentials for integrations. Secrets are stored encrypted in Azure Cosmos DB.
    </p>
    <div id="settings-service-rows" style="max-width:680px;display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
      ${SERVICES.map(renderSettingsRow).join('')}
    </div>
    <div id="settings-detail-label" style="display:none;font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase;margin:16px 0 8px">
      Detailed settings
    </div>
    <div id="settings-detail-area" style="max-width:680px">
      ${SERVICES.map(renderSettingsDetail).join('')}
    </div>
  `;

  SERVICES.forEach(svc => loadServiceConfig(svc.key));
}

function renderSettingsRow(svc) {
  return `<div class="card" id="cfg-row-${svc.key}" style="padding:12px 14px;cursor:pointer" onclick="toggleServiceConfig('${svc.key}')">
    <div style="display:flex;align-items:center;gap:8px">
      <i class="ti ${svc.icon}" style="font-size:16px;color:var(--brand-mid)"></i>
      <span style="font-weight:600;font-size:13px">${svc.label}</span>
      <span id="cfg-status-${svc.key}" class="badge" style="margin-left:auto;font-size:9px;padding:2px 6px">...</span>
      <i class="ti ti-chevron-down" id="cfg-chev-${svc.key}" style="font-size:14px;color:var(--text3);transition:transform .2s"></i>
    </div>
    <div id="cfg-row-note-${svc.key}" style="display:none;margin-top:8px;color:var(--text3);font-size:11px;line-height:1.5">${svc.note}</div>
  </div>`;
}

function renderSettingsDetail(svc) {
  if (svc.key === 'account_details') return renderAccountDetail();
  return `<div class="card" id="cfg-detail-${svc.key}" style="display:none;padding:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <i class="ti ${svc.icon}" style="font-size:16px;color:var(--brand-mid)"></i>
      <div>
        <div class="ctitle" style="margin-bottom:1px">${svc.label}</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.5">${svc.note}</div>
      </div>
    </div>
    ${svc.fields.map(f => `
      <div class="flbl">${FIELD_LABELS[f]}</div>
      ${fieldInput(svc.key, f)}
    `).join('')}
    ${oauthRedirectHint(svc.key)}
    ${OAUTH_SERVICES.includes(svc.key) ? `<div id="cfg-oauth-result-${svc.key}" style="display:none;margin:0 0 10px"></div>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
      <button class="btn bsm" onclick="saveServiceConfig('${svc.key}')">Save</button>
      ${OAUTH_SERVICES.includes(svc.key) ? `
        <button class="btn bsm bo" id="cfg-connect-${svc.key}" onclick="connectServiceOAuth('${svc.key}')"><i class="ti ti-plug-connected" style="font-size:11px"></i> Connect / authorise</button>
        <button class="btn bsm bdng" id="cfg-disconnect-${svc.key}" style="display:none" onclick="disconnectServiceOAuth('${svc.key}')"><i class="ti ti-plug-off" style="font-size:11px"></i> Disconnect</button>
      ` : ''}
    </div>
  </div>`;
}

function renderAccountDetail() {
  return `<div class="card" id="cfg-detail-account_details" style="display:none;padding:14px">
    <div class="ctitle"><i class="ti ti-building" style="color:var(--brand-mid);margin-right:5px"></i>Account details</div>
    <div class="ri"><i class="ti ti-building" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">TECHSINNO (Pty) Ltd</div><div style="font-size:10px;color:var(--text3)">Reg: 2022/364165/07 · Tax: 9234848266</div></div></div>
    <div class="ri"><i class="ti ti-mail" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">frank@techsinno.com <span style="font-size:9px;background:rgba(26,107,138,.2);color:var(--brand-mid);padding:1px 5px;border-radius:8px;font-family:'DM Mono',monospace">PRIMARY</span></div><div style="font-size:10px;color:var(--text3)">Zoho Mail · www.techsinno.com · outgoing customer mail</div></div></div>
    <div class="ri"><i class="ti ti-brand-gmail" style="color:#ea4335;font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">techsinno0@gmail.com</div><div style="font-size:10px;color:var(--text3)">Google account · also used for Microsoft 365 / OneDrive</div></div></div>
    <div class="ri"><i class="ti ti-map-pin" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">Kuilsriver, Western Cape, 7580</div><div style="font-size:10px;color:var(--text3)">6 Marais St, Unit 19, Kuilenoord Complex</div></div></div>
    ${['companyName', 'registrationNumber', 'email', 'phone', 'address', 'website', 'ownerName'].map(f => `
      <div class="flbl">${FIELD_LABELS[f]}</div>
      ${fieldInput('account_details', f)}
    `).join('')}
    <button class="btn bsm" onclick="saveServiceConfig('account_details')">Save account details</button>
  </div>`;
}

function fieldInput(key, field) {
  if (field === 'region') {
    return `<select id="cfg-${key}-${field}" style="width:100%;margin-bottom:8px">
      <option value="com">zoho.com (US/Global)</option>
      <option value="eu">zoho.eu (Europe/Africa)</option>
      <option value="in">zoho.in (India)</option>
      <option value="au">zoho.com.au (Australia)</option>
      <option value="jp">zoho.jp (Japan)</option>
    </select>`;
  }
  const type = field.includes('Secret') || field === 'apiKey' ? 'password' : 'text';
  return `<input type="${type}" id="cfg-${key}-${field}" style="width:100%;margin-bottom:8px" placeholder="${FIELD_LABELS[field]}">`;
}

function cloudBaseForRedirect() {
  const electronBase = window.__TECHSINNO_ELECTRON_API_BASE ? String(window.__TECHSINNO_ELECTRON_API_BASE).replace(/\/+$/, '') : '';
  if (electronBase && !electronBase.includes('.azurewebsites.net')) return electronBase;
  if (location.protocol === 'file:' || location.origin === 'null') return PUBLIC_DASHBOARD_BASE;
  if (location.origin.includes('.azurewebsites.net')) return PUBLIC_DASHBOARD_BASE;
  return location.origin.replace(/\/+$/, '');
}

function oauthRedirectPath(key) {
  return {
    zoho_books: '/api/zoho-books/callback',
    zoho_mail: '/api/email/callback/zoho_mail',
    gmail: '/api/email/callback/gmail',
    outlook: '/api/email/callback/outlook'
  }[key] || '';
}

function oauthRedirectUri(key) {
  const path = oauthRedirectPath(key);
  return path ? cloudBaseForRedirect() + path : '';
}

function oauthRedirectHint(key) {
  if (!OAUTH_SERVICES.includes(key)) return '';
  const uri = oauthRedirectUri(key);
  const provider = key.startsWith('zoho') ? 'Zoho API Console' : (key === 'gmail' ? 'Google Cloud Console' : 'Microsoft Azure app registration');
  const mismatchNote = key === 'gmail'
    ? `<div style="font-size:10px;color:#f0b429;line-height:1.45;margin-top:6px">
        Google error 400 redirect_uri_mismatch means this exact URI is missing under OAuth Client > Authorized redirect URIs.
      </div>`
    : '';
  return `<div class="ri" style="align-items:flex-start;margin:2px 0 10px">
    <i class="ti ti-link" style="color:var(--brand-mid);font-size:13px;flex-shrink:0;margin-top:2px"></i>
    <div style="min-width:0;flex:1">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase">Redirect URI for ${provider}</div>
      <code id="cfg-redirect-${key}" style="display:block;overflow:auto;margin-top:4px;color:var(--brand-mid);font-size:11px">${uri}</code>
      ${mismatchNote}
    </div>
    <button class="btn bsm bo" type="button" onclick="copyOAuthRedirect('${key}')">Copy</button>
  </div>`;
}

async function copyOAuthRedirect(key) {
  const text = document.getElementById(`cfg-redirect-${key}`)?.textContent || oauthRedirectUri(key);
  try {
    await navigator.clipboard.writeText(text);
    ntf('Redirect URI copied');
  } catch {
    ntf(text);
  }
}

async function openExternalUrl(url) {
  if (!url) return;
  if (window.techsinno && typeof window.techsinno.openUrl === 'function') {
    await window.techsinno.openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyTextToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    ntf(`${label} copied`);
  } catch {
    ntf(text);
  }
}

function renderOAuthResult(key, data) {
  const el = document.getElementById(`cfg-oauth-result-${key}`);
  if (!el || !data?.url) return;
  const mismatchNote = key === 'gmail' && data.redirectUri
    ? `<div style="font-size:10px;color:#f0b429;line-height:1.45;margin-top:6px">
        If Google blocks sign-in, add <code style="color:#f0b429">${escHtml(data.redirectUri)}</code> to the OAuth client's Authorized redirect URIs.
      </div>`
    : '';
  el.style.display = 'block';
  el.innerHTML = `<div class="ri" style="align-items:flex-start;margin:2px 0 0">
    <i class="ti ti-external-link" style="color:var(--brand-mid);font-size:13px;flex-shrink:0;margin-top:2px"></i>
    <div style="min-width:0;flex:1">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase">Authorisation link</div>
      <code style="display:block;overflow:auto;margin-top:4px;color:var(--text2);font-size:10px;max-height:52px">${escHtml(data.url)}</code>
      ${mismatchNote}
    </div>
    <div style="display:flex;gap:5px;flex-shrink:0">
      <button class="btn bsm bo" type="button" onclick="copyTextToClipboard(${jsArg(data.url)}, 'Auth link')">Copy</button>
      <button class="btn bsm bo" type="button" onclick="openExternalUrl(${jsArg(data.url)})">Open</button>
    </div>
  </div>`;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollOAuthConnection(key) {
  if (OAUTH_POLLERS[key]) return;
  OAUTH_POLLERS[key] = true;
  const svc = SERVICES.find(s => s.key === key);
  const deadline = Date.now() + 120000;
  try {
    while (Date.now() < deadline) {
      await wait(4000);
      const data = await apiGet(`/config/${key}`);
      const cfg = data && data.config;
      CONFIG_CACHE[key] = cfg || {};
      setConfigBadge(key, cfg);
      updateOAuthButtons(key, cfg);
      if (cfg && cfg.connected && !cfg.reconnectRequired) {
        ntf(`${svc?.label || 'Service'} connected`);
        if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();
        return;
      }
    }
  } finally {
    OAUTH_POLLERS[key] = false;
  }
}

function collectServiceConfig(key) {
  const svc = SERVICES.find(s => s.key === key);
  const body = {};
  svc.fields.forEach(f => {
    const input = document.getElementById(`cfg-${key}-${f}`);
    const v = input ? input.value.trim() : '';
    if (v) body[f] = v;
  });
  return body;
}

async function saveServiceConfigIfEntered(key) {
  const body = collectServiceConfig(key);
  if (Object.keys(body).length === 0) return true;
  const data = await apiPut(`/config/${key}`, body);
  if (data && data.success) {
    loadServiceConfig(key);
    if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();
    return true;
  }
  ntf((data && data.error) || 'Save failed');
  return false;
}

async function connectServiceOAuth(key) {
  const saved = await saveServiceConfigIfEntered(key);
  if (!saved) return;
  try {
    const params = new URLSearchParams();
    const regionValue = document.getElementById(`cfg-${key}-region`)?.value;
    const accountValue = document.getElementById(`cfg-${key}-email`)?.value.trim();
    if (regionValue) params.set('region', regionValue);
    if (key === 'gmail' && accountValue) params.set('account', accountValue);
    const qs = params.toString();
    const query = qs ? `?${qs}` : '';
    const data = key === 'zoho_books'
      ? await apiGet('/zoho-books/connect' + query)
      : await apiGet('/email/connect/' + key + query);
    if (!data?.url) { ntf('Failed to get authorization URL'); return; }
    if (data.redirectUri) {
      const redirectEl = document.getElementById(`cfg-redirect-${key}`);
      if (redirectEl) redirectEl.textContent = data.redirectUri;
    }
    renderOAuthResult(key, data);
    pollOAuthConnection(key);
    const popup = window.open(data.url, `${key}_auth`, 'width=640,height=760,scrollbars=yes');
    const expectedType = key === 'zoho_books' ? 'zoho-books-auth' : 'email-auth';
    window.addEventListener('message', function handler(e) {
      if (e.data?.type === expectedType) {
        window.removeEventListener('message', handler);
        if (e.data.success) {
          ntf(e.data.message || 'Connected!');
          loadServiceConfig(key);
          if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();
        } else {
          ntf(e.data.message || 'Connection failed');
        }
      }
    });
    if (!popup) {
      ntf('Popup blocked. Opening in browser.');
      await openExternalUrl(data.url);
    }
  } catch {
    ntf('Failed to initiate connection');
  }
}

async function connectServiceEmail(key) {
  return connectServiceOAuth(key);
}

async function loadServiceConfig(key) {
  const badge = document.getElementById(`cfg-status-${key}`);
  try {
    const data = await apiGet(`/config/${key}`);
    const cfg = data && data.config;
    CONFIG_CACHE[key] = cfg || {};
    setConfigBadge(key, cfg);
    updateOAuthButtons(key, cfg);
    if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();

    const svc = SERVICES.find(s => s.key === key);
    svc.fields.forEach(f => {
      const input = document.getElementById(`cfg-${key}-${f}`);
      if (input && cfg && cfg[f]) input.value = cfg[f];
      else if (input && (f === 'clientSecret' || f === 'apiKey') && cfg && (cfg.hasClientSecret || cfg.hasApiKey)) {
        input.placeholder = 'Configured on server - enter new value to replace';
      }
    });
  } catch {
    if (badge) {
      badge.textContent = 'Error';
      badge.style.color = '#f85149';
    }
  }
}

function updateOAuthButtons(key, cfg) {
  if (!OAUTH_SERVICES.includes(key)) return;
  const connectBtn = document.getElementById(`cfg-connect-${key}`);
  const disconnectBtn = document.getElementById(`cfg-disconnect-${key}`);
  const connected = !!(cfg && cfg.connected);
  if (connectBtn) connectBtn.innerHTML = connected || cfg?.reconnectRequired
    ? '<i class="ti ti-refresh" style="font-size:11px"></i> Reconnect / authorise'
    : '<i class="ti ti-plug-connected" style="font-size:11px"></i> Connect / authorise';
  if (disconnectBtn) disconnectBtn.style.display = connected || cfg?.reconnectRequired ? '' : 'none';
}

function setConfigBadge(key, cfg) {
  const badge = document.getElementById(`cfg-status-${key}`);
  if (!badge) return;
  if (cfg && cfg.reconnectRequired) {
    badge.textContent = 'Reconnect';
    badge.style.background = 'rgba(248,81,73,.14)';
    badge.style.color = '#f85149';
  } else if (cfg && cfg.connected) {
    badge.textContent = 'Connected';
    badge.style.background = '#3fb95020';
    badge.style.color = '#3fb950';
  } else if (cfg && (cfg.configured || cfg.clientId || cfg.hasApiKey || cfg.hasClientSecret)) {
    badge.textContent = 'Configured';
    badge.style.background = 'var(--brand-mid-20)';
    badge.style.color = 'var(--brand-mid)';
  } else {
    badge.textContent = 'Not set';
    badge.style.background = 'var(--card-hover)';
    badge.style.color = 'var(--text3)';
  }
}

function toggleServiceConfig(key) {
  const note = document.getElementById(`cfg-row-note-${key}`);
  const detail = document.getElementById(`cfg-detail-${key}`);
  const chev = document.getElementById(`cfg-chev-${key}`);
  const visible = detail && detail.style.display !== 'none';

  document.querySelectorAll('[id^="cfg-row-note-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('[id^="cfg-detail-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('[id^="cfg-chev-"]').forEach(el => el.style.transform = '');
  const label = document.getElementById('settings-detail-label');
  if (label) label.style.display = 'none';

  if (!visible) {
    if (label) label.style.display = 'block';
    if (note) note.style.display = 'block';
    if (detail) {
      detail.style.display = 'block';
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      detail.style.boxShadow = '0 0 0 1px var(--brand-mid)';
      setTimeout(() => { detail.style.boxShadow = ''; }, 900);
    }
    if (chev) chev.style.transform = 'rotate(180deg)';
  }
}

async function saveServiceConfig(key) {
  const svc = SERVICES.find(s => s.key === key);
  const body = collectServiceConfig(key);

  if (Object.keys(body).length === 0) { ntf('Enter at least one field'); return; }

  try {
    const data = await apiPut(`/config/${key}`, body);
    if (data && data.success) {
      ntf(`${svc.label} saved`);
      loadServiceConfig(key);
      if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();
    } else {
      ntf((data && data.error) || 'Save failed');
    }
  } catch {
    ntf('Failed to save config');
  }
}

async function disconnectServiceOAuth(key) {
  if (!confirm('Disconnect this service so it can be reconnected?')) return;
  try {
    const data = key === 'zoho_books'
      ? await apiPut('/config/zoho_books', { accessToken: null, refreshToken: null, tokenExpiry: null, connected: false })
      : await apiPost('/email/disconnect/' + key);
    if (data && data.error) {
      ntf(data.error);
      return;
    }
    ntf('Disconnected');
    await loadServiceConfig(key);
    if (key.startsWith('zoho') && typeof updateZohoHeaderStatus === 'function') updateZohoHeaderStatus();
  } catch {
    ntf('Failed to disconnect');
  }
}
