const SERVICES = [
  { key: 'zoho_books', label: 'Zoho Books', icon: 'ti-chart-bar', fields: ['clientId', 'clientSecret', 'orgId'], note: 'Bookkeeping, invoices, expenses, reports. Owner-only.' },
  { key: 'zoho_mail', label: 'Zoho Mail', icon: 'ti-mail', fields: ['clientId', 'clientSecret', 'region'], note: 'Primary company mailbox for customer replies and AI email scans.' },
  { key: 'gmail', label: 'Gmail', icon: 'ti-brand-gmail', fields: ['clientId', 'clientSecret'], note: 'Google mailbox connection for shared inbox workflows.' },
  { key: 'outlook', label: 'Outlook', icon: 'ti-brand-windows', fields: ['clientId', 'clientSecret'], note: 'Microsoft mailbox connection for shared inbox workflows.' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin', fields: ['clientId', 'clientSecret'], note: 'Company page/social publishing connection.' },
  { key: 'claude', label: 'Claude AI', icon: 'ti-robot', fields: ['apiKey'], note: 'AI assistant key used for drafts, scans, suggestions, and analysis.' },
  { key: 'hunter', label: 'Hunter.io', icon: 'ti-search', fields: ['apiKey'], note: 'Email finder for outreach lead discovery.' },
  { key: 'cloudflare', label: 'Cloudflare', icon: 'ti-cloud', fields: ['apiKey', 'zoneId'], note: 'Website analytics for techsinno.com traffic.' },
  { key: 'onedrive', label: 'OneDrive', icon: 'ti-cloud-upload', fields: ['clientId', 'clientSecret'], note: 'Optional Microsoft/OneDrive file sync and backup connection.' },
  { key: 'account', label: 'Account Details', icon: 'ti-building', fields: [], note: 'Company identity, primary email, and address.' }
];

const FIELD_LABELS = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  orgId: 'Organization ID',
  apiKey: 'API Key',
  zoneId: 'Zone ID',
  region: 'Region'
};

const CONFIG_CACHE = {};

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
  if (svc.key === 'account') return renderAccountDetail();
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
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
      <button class="btn bsm" onclick="saveServiceConfig('${svc.key}')">Save</button>
      ${['zoho_mail','gmail','outlook'].includes(svc.key) ? `<button class="btn bsm bo" onclick="connectServiceEmail('${svc.key}')">Connect / authorise</button>` : ''}
    </div>
  </div>`;
}

function renderAccountDetail() {
  return `<div class="card" id="cfg-detail-account" style="display:none;padding:14px">
    <div class="ctitle"><i class="ti ti-building" style="color:var(--brand-mid);margin-right:5px"></i>Account details</div>
    <div class="ri"><i class="ti ti-building" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">TECHSINNO (Pty) Ltd</div><div style="font-size:10px;color:var(--text3)">Reg: 2022/364165/07 · Tax: 9234848266</div></div></div>
    <div class="ri"><i class="ti ti-mail" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">frank@techsinno.com <span style="font-size:9px;background:rgba(26,107,138,.2);color:var(--brand-mid);padding:1px 5px;border-radius:8px;font-family:'DM Mono',monospace">PRIMARY</span></div><div style="font-size:10px;color:var(--text3)">Zoho Mail · www.techsinno.com · outgoing customer mail</div></div></div>
    <div class="ri"><i class="ti ti-brand-gmail" style="color:#ea4335;font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">techsinno0@gmail.com</div><div style="font-size:10px;color:var(--text3)">Google account · also used for Microsoft 365 / OneDrive</div></div></div>
    <div class="ri"><i class="ti ti-map-pin" style="color:var(--brand-mid);font-size:13px;flex-shrink:0"></i><div><div style="font-size:12px;color:var(--text)">Kuilsriver, Western Cape, 7580</div><div style="font-size:10px;color:var(--text3)">6 Marais St, Unit 19, Kuilenoord Complex</div></div></div>
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

async function connectServiceEmail(key) {
  await saveServiceConfig(key);
  try {
    const data = await apiGet('/email/connect/' + key);
    if (!data?.url) { ntf('Failed to get authorization URL'); return; }
    const popup = window.open(data.url, 'email_auth', 'width=600,height=700,scrollbars=yes');
    window.addEventListener('message', function handler(e) {
      if (e.data?.type === 'email-auth') {
        window.removeEventListener('message', handler);
        if (e.data.success) {
          ntf(e.data.message || 'Connected!');
          loadServiceConfig(key);
        } else {
          ntf(e.data.message || 'Connection failed');
        }
      }
    });
    if (!popup) ntf('Popup blocked. Allow popups for this dashboard.');
  } catch {
    ntf('Failed to initiate connection');
  }
}

async function loadServiceConfig(key) {
  if (key === 'account') {
    const badge = document.getElementById('cfg-status-account');
    if (badge) {
      badge.textContent = 'Info';
      badge.style.background = 'var(--card-hover)';
      badge.style.color = 'var(--text3)';
    }
    return;
  }
  const badge = document.getElementById(`cfg-status-${key}`);
  try {
    const data = await apiGet(`/config/${key}`);
    const cfg = data && data.config;
    CONFIG_CACHE[key] = cfg || {};
    setConfigBadge(key, cfg);

    const svc = SERVICES.find(s => s.key === key);
    svc.fields.forEach(f => {
      const input = document.getElementById(`cfg-${key}-${f}`);
      if (input && cfg && cfg[f]) input.value = cfg[f];
    });
  } catch {
    if (badge) {
      badge.textContent = 'Error';
      badge.style.color = '#f85149';
    }
  }
}

function setConfigBadge(key, cfg) {
  const badge = document.getElementById(`cfg-status-${key}`);
  if (!badge) return;
  if (cfg && cfg.connected) {
    badge.textContent = 'Connected';
    badge.style.background = '#3fb95020';
    badge.style.color = '#3fb950';
  } else if (cfg && (cfg.clientId || cfg.apiKey)) {
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
  const body = {};
  svc.fields.forEach(f => {
    const input = document.getElementById(`cfg-${key}-${f}`);
    const v = input ? input.value.trim() : '';
    if (v) body[f] = v;
  });

  if (Object.keys(body).length === 0) { ntf('Enter at least one field'); return; }

  try {
    const data = await apiPut(`/config/${key}`, body);
    if (data && data.success) {
      ntf(`${svc.label} saved`);
      loadServiceConfig(key);
    } else {
      ntf((data && data.error) || 'Save failed');
    }
  } catch {
    ntf('Failed to save config');
  }
}
