const SERVICES = [
  { key: 'zoho_books', label: 'Zoho Books', icon: 'ti-chart-bar', fields: ['clientId', 'clientSecret', 'orgId'] },
  { key: 'zoho_mail', label: 'Zoho Mail', icon: 'ti-mail', fields: ['clientId', 'clientSecret', 'region'] },
  { key: 'gmail', label: 'Gmail', icon: 'ti-brand-gmail', fields: ['clientId', 'clientSecret'] },
  { key: 'outlook', label: 'Outlook', icon: 'ti-brand-windows', fields: ['clientId', 'clientSecret'] },
  { key: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin', fields: ['clientId', 'clientSecret'] },
  { key: 'claude', label: 'Claude AI', icon: 'ti-robot', fields: ['apiKey'] },
  { key: 'hunter', label: 'Hunter.io', icon: 'ti-search', fields: ['apiKey'] },
  { key: 'cloudflare', label: 'Cloudflare', icon: 'ti-cloud', fields: ['apiKey', 'zoneId'] },
  { key: 'onedrive', label: 'OneDrive', icon: 'ti-cloud-upload', fields: ['clientId', 'clientSecret'] }
];

const FIELD_LABELS = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  orgId: 'Organization ID',
  apiKey: 'API Key',
  zoneId: 'Zone ID',
  region: 'Region'
};

async function render_settings() {
  if (!isOwner()) return;
  const el = document.getElementById('page-settings');

  let html = '<div style="max-width:680px">';
  html += '<p style="color:var(--text3);font-size:12px;margin-bottom:16px">Manage API credentials for integrations. Secrets are stored encrypted in Azure Cosmos DB.</p>';

  SERVICES.forEach(svc => {
    html += `<div class="card" id="cfg-${svc.key}" style="margin-bottom:10px;padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleServiceConfig('${svc.key}')">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="ti ${svc.icon}" style="font-size:16px;color:var(--brand-mid)"></i>
          <span style="font-weight:500;font-size:13px">${svc.label}</span>
          <span id="cfg-status-${svc.key}" class="badge" style="font-size:9px;padding:2px 6px">...</span>
        </div>
        <i class="ti ti-chevron-down" id="cfg-chev-${svc.key}" style="font-size:14px;color:var(--text3);transition:transform .2s"></i>
      </div>
      <div id="cfg-form-${svc.key}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        ${svc.fields.map(f => `
          <div class="flbl">${FIELD_LABELS[f]}</div>
          <input type="${f.includes('Secret') || f === 'apiKey' ? 'password' : 'text'}" id="cfg-${svc.key}-${f}" style="width:100%;margin-bottom:6px" placeholder="${FIELD_LABELS[f]}">
        `).join('')}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          <button class="btn bsm" onclick="saveServiceConfig('${svc.key}')">Save</button>
          ${['zoho_mail','gmail','outlook'].includes(svc.key) ? `<button class="btn bsm bo" onclick="connectServiceEmail('${svc.key}')">Connect / authorise</button>` : ''}
        </div>
      </div>
    </div>`;
  });

  html += '</div>';
  el.innerHTML = html;

  SERVICES.forEach(svc => loadServiceConfig(svc.key));
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
  } catch {
    ntf('Failed to initiate connection');
  }
}

async function loadServiceConfig(key) {
  const badge = document.getElementById(`cfg-status-${key}`);
  try {
    const data = await apiGet(`/config/${key}`);
    const cfg = data && data.config;
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

    const svc = SERVICES.find(s => s.key === key);
    svc.fields.forEach(f => {
      const input = document.getElementById(`cfg-${key}-${f}`);
      if (input && cfg && cfg[f]) input.value = cfg[f];
    });
  } catch {
    badge.textContent = 'Error';
    badge.style.color = '#f85149';
  }
}

function toggleServiceConfig(key) {
  const form = document.getElementById(`cfg-form-${key}`);
  const chev = document.getElementById(`cfg-chev-${key}`);
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'block';
  chev.style.transform = visible ? '' : 'rotate(180deg)';
}

async function saveServiceConfig(key) {
  const svc = SERVICES.find(s => s.key === key);
  const body = {};
  svc.fields.forEach(f => {
    const v = document.getElementById(`cfg-${key}-${f}`).value.trim();
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
