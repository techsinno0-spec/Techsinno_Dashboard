let _crmClients = [];
let _crmFilter = 'all';
let _crmSearch = '';
let _crmDetail = null;

function render_crm() {
  if (!isManager()) return;
  const el = document.getElementById('page-crm');
  el.innerHTML = '<div class="spin"></div>';
  loadCRM();
}

async function loadCRM() {
  const el = document.getElementById('page-crm');
  try {
    const data = await apiGet('/clients');
    _crmClients = (data && data.clients) || [];
    renderCRMPage(el);
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load CRM</div>';
  }
}

function renderCRMPage(el) {
  const statuses = ['lead', 'contacted', 'quoted', 'negotiating', 'won', 'lost'];
  const counts = {};
  statuses.forEach(s => counts[s] = _crmClients.filter(c => c.status === s).length);
  const now = new Date();
  const followUpsDue = _crmClients.filter(c => c.followUpDate && new Date(c.followUpDate) <= now && c.status !== 'won' && c.status !== 'lost').length;
  const pipelineValue = _crmClients.filter(c => !['won', 'lost'].includes(c.status)).reduce((s, c) => s + (c.estimatedValue || 0), 0);

  let filtered = _crmClients;
  if (_crmFilter !== 'all') filtered = filtered.filter(c => c.status === _crmFilter);
  if (_crmSearch) {
    const q = _crmSearch.toLowerCase();
    filtered = filtered.filter(c => (c.companyName + ' ' + c.contactName + ' ' + c.email).toLowerCase().includes(q));
  }

  const statusColors = { lead: 'var(--text3)', contacted: 'var(--brand-mid)', quoted: 'var(--accent)', negotiating: '#e0a040', won: '#3fb950', lost: '#f85149' };

  let rows = '';
  filtered.forEach(c => {
    const overdue = c.followUpDate && new Date(c.followUpDate) <= now && c.status !== 'won' && c.status !== 'lost';
    rows += `<div class="user-row" style="cursor:pointer;${overdue ? 'border-color:rgba(248,81,73,.4)' : ''}" onclick="showCRMDetail('${c.id}')">
      <div class="user-avatar" style="background:${statusColors[c.status] || 'var(--brand)'}">${escHtml((c.companyName || '?').charAt(0).toUpperCase())}</div>
      <div class="user-info">
        <div class="user-name">${escHtml(c.companyName)}</div>
        <div class="user-meta">${escHtml(c.contactName || 'No contact')}${c.email ? ' · ' + escHtml(c.email) : ''}</div>
      </div>
      <div style="text-align:right">
        <span class="bdg b-${c.status === 'won' ? 'done' : c.status === 'lost' ? 'blocked' : c.status === 'quoted' ? 'pending' : 'in_progress'}">${c.status}</span>
        ${c.estimatedValue ? `<div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px">R${Math.round(c.estimatedValue).toLocaleString()}</div>` : ''}
      </div>
      ${overdue ? '<i class="ti ti-alert-triangle" style="color:#f85149;font-size:14px" title="Follow-up overdue"></i>' : ''}
    </div>`;
  });

  el.innerHTML = `
    <div class="g4">
      <div class="stat"><div class="slbl">Total Leads</div><div class="sval">${_crmClients.length}</div><div class="ssub">${followUpsDue} follow-ups due</div></div>
      <div class="stat"><div class="slbl">Pipeline</div><div class="sval cb">${counts.contacted + counts.quoted + counts.negotiating}</div><div class="ssub">R${Math.round(pipelineValue).toLocaleString()} value</div></div>
      <div class="stat"><div class="slbl">Won</div><div class="sval cg">${counts.won}</div><div class="ssub">closed deals</div></div>
      <div class="stat"><div class="slbl">Conversion</div><div class="sval ca">${_crmClients.length ? Math.round(counts.won / _crmClients.length * 100) : 0}%</div><div class="ssub">lead → won</div></div>
    </div>
    <div style="display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap">
      <div class="wtabs">
        <span class="wtab ${_crmFilter === 'all' ? 'active' : ''}" onclick="_crmFilter='all';renderCRMPage(document.getElementById('page-crm'))">All (${_crmClients.length})</span>
        ${statuses.map(s => `<span class="wtab ${_crmFilter === s ? 'active' : ''}" onclick="_crmFilter='${s}';renderCRMPage(document.getElementById('page-crm'))">${s} (${counts[s]})</span>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <input type="text" placeholder="Search clients..." value="${_crmSearch}" oninput="_crmSearch=this.value;renderCRMPage(document.getElementById('page-crm'))" style="flex:1">
      <button class="btn" onclick="showAddClientForm()"><i class="ti ti-plus" style="font-size:12px"></i> Add Lead</button>
    </div>
    <div id="crmClientList">${rows || '<div class="empty-state"><i class="ti ti-address-book"></i>No clients yet. Add your first lead!</div>'}</div>
    <div id="crmDetail"></div>
    <div id="crmForm"></div>`;
}

function showAddClientForm() {
  const el = document.getElementById('crmForm');
  el.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="ctitle">Add New Lead</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><div class="flbl">Company Name *</div><input type="text" id="crmCompany" style="width:100%"></div>
      <div style="flex:1;min-width:200px"><div class="flbl">Contact Name</div><input type="text" id="crmContact" style="width:100%"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><div class="flbl">Email</div><input type="email" id="crmEmail" style="width:100%"></div>
      <div style="flex:1;min-width:150px"><div class="flbl">Phone</div><input type="text" id="crmPhone" style="width:100%"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div style="flex:1"><div class="flbl">Industry</div><select id="crmIndustry" style="width:100%"><option value="manufacturing">Manufacturing</option><option value="mining">Mining</option><option value="agriculture">Agriculture</option><option value="logistics">Logistics</option><option value="energy">Energy</option><option value="food_processing">Food Processing</option><option value="construction">Construction</option><option value="other">Other</option></select></div>
      <div style="flex:1"><div class="flbl">Source</div><select id="crmSource" style="width:100%"><option value="linkedin">LinkedIn</option><option value="cold_email">Cold Email</option><option value="referral">Referral</option><option value="website">Website</option><option value="event">Event</option><option value="other">Other</option></select></div>
      <div style="flex:1"><div class="flbl">Est. Value (R)</div><input type="number" id="crmValue" style="width:100%" placeholder="0"></div>
    </div>
    <div class="flbl">Notes</div>
    <textarea id="crmNotes" style="width:100%;height:60px"></textarea>
    <div class="flbl">Follow-up Date</div>
    <input type="datetime-local" id="crmFollowUp" style="width:100%">
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" onclick="submitNewClient()">Save Lead</button>
      <button class="btn bo" onclick="document.getElementById('crmForm').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

async function submitNewClient() {
  const company = document.getElementById('crmCompany').value.trim();
  if (!company) { ntf('Company name is required'); return; }

  const client = {
    companyName: company,
    contactName: document.getElementById('crmContact').value.trim(),
    email: document.getElementById('crmEmail').value.trim(),
    phone: document.getElementById('crmPhone').value.trim(),
    industry: document.getElementById('crmIndustry').value,
    source: document.getElementById('crmSource').value,
    estimatedValue: parseFloat(document.getElementById('crmValue').value) || 0,
    notes: document.getElementById('crmNotes').value.trim(),
    followUpDate: document.getElementById('crmFollowUp').value ? new Date(document.getElementById('crmFollowUp').value).toISOString() : null
  };

  await apiCall('POST', '/clients', client);
  ntf('Lead added!');
  document.getElementById('crmForm').innerHTML = '';
  loadCRM();
}

function showCRMDetail(clientId) {
  const c = _crmClients.find(x => x.id === clientId);
  if (!c) return;
  _crmDetail = c;

  const statuses = ['lead', 'contacted', 'quoted', 'negotiating', 'won', 'lost'];
  const interactions = (c.interactions || []).slice().reverse();

  const el = document.getElementById('crmDetail');
  el.innerHTML = `<div class="task-detail" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <h3>${escHtml(c.companyName)}</h3>
        <div style="font-size:12px;color:var(--text2)">${escHtml(c.contactName || '')}${c.email ? ' · ' + escHtml(c.email) : ''}${c.phone ? ' · ' + escHtml(c.phone) : ''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn bsm bdng" onclick="deleteClient('${c.id}')">Delete</button>
        <button class="btn bsm bo" onclick="document.getElementById('crmDetail').innerHTML=''">Close</button>
      </div>
    </div>
    <div class="flbl">Status</div>
    <div style="display:flex;gap:4px;margin-bottom:12px">
      ${statuses.map(s => `<button class="btn bsm ${c.status === s ? '' : 'bo'}" onclick="updateClientStatus('${c.id}','${s}')">${s}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <div><span class="flbl">Industry:</span> <span style="font-size:12px">${c.industry}</span></div>
      <div><span class="flbl">Source:</span> <span style="font-size:12px">${c.source}</span></div>
      <div><span class="flbl">Value:</span> <span style="font-size:12px">R${Math.round(c.estimatedValue || 0).toLocaleString()}</span></div>
      <div><span class="flbl">Follow-up:</span> <span style="font-size:12px;${c.followUpDate && new Date(c.followUpDate) <= new Date() ? 'color:#f85149' : ''}">${c.followUpDate ? formatDate(c.followUpDate) : 'Not set'}</span></div>
    </div>
    ${c.notes ? `<div class="flbl">Notes</div><div style="font-size:12px;color:var(--text2);margin-bottom:12px">${escHtml(c.notes)}</div>` : ''}
    <div class="flbl">Log Interaction</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <select id="crmInterType" style="flex:1"><option value="email">Email</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="linkedin">LinkedIn</option><option value="quote">Quote</option><option value="other">Other</option></select>
      <input type="text" id="crmInterSummary" placeholder="Summary..." style="flex:3">
      <button class="btn bsm" onclick="logInteraction('${c.id}')">Log</button>
    </div>
    <div class="flbl">Interaction History (${interactions.length})</div>
    ${interactions.length === 0 ? '<div style="font-size:11px;color:var(--text3)">No interactions yet</div>' :
      interactions.map(i => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        <span class="tag t-${i.type === 'email' ? 'a' : i.type === 'call' ? 'r' : i.type === 'meeting' ? 'i' : 'g'}">${i.type}</span>
        <span style="flex:1;font-size:12px">${escHtml(i.summary)}</span>
        <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${timeAgo(i.date)}</span>
      </div>`).join('')}
  </div>`;
}

async function updateClientStatus(id, status) {
  const data = await apiCall('PUT', '/clients/' + id, { status });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Status updated');
  loadCRM();
}

async function logInteraction(id) {
  const type = document.getElementById('crmInterType').value;
  const summary = document.getElementById('crmInterSummary').value.trim();
  if (!summary) { ntf('Summary is required'); return; }
  const data = await apiCall('PUT', '/clients/' + id, { addInteraction: { type, summary } });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Interaction logged');
  loadCRM();
}

async function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  await apiCall('DELETE', '/clients/' + id);
  ntf('Client deleted');
  document.getElementById('crmDetail').innerHTML = '';
  loadCRM();
}
