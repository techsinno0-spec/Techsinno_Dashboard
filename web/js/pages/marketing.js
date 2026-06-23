function render_marketing() {
  if (!isManager()) return;
  const el = document.getElementById('page-marketing');
  el.innerHTML = '<div class="spin"></div>';
  loadMarketing();
}

async function loadMarketing() {
  const el = document.getElementById('page-marketing');
  try {
    const [dashData, campData] = await Promise.all([
      apiGet('/marketing/dashboard'),
      apiGet('/campaigns')
    ]);
    renderMarketingPage(el, dashData, (campData && campData.campaigns) || []);
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load marketing data</div>';
  }
}

function renderMarketingPage(el, data, campaigns) {
  const s = data.summary || {};
  const sc = data.sourceCounts || {};
  const stc = data.statusCounts || {};
  const cm = data.campaignMetrics || {};

  const sourceLabels = { linkedin: 'LinkedIn', cold_email: 'Cold Email', referral: 'Referral', website: 'Website', event: 'Event', other: 'Other' };
  const sourceColors = { linkedin: '#0A66C2', cold_email: 'var(--brand-mid)', referral: '#3fb950', website: 'var(--accent)', event: '#e0a040', other: 'var(--text3)' };
  const maxSource = Math.max(1, ...Object.values(sc));

  let sourceBars = '';
  Object.keys(sourceLabels).forEach(k => {
    const count = sc[k] || 0;
    if (count === 0) return;
    const pct = Math.round((count / maxSource) * 100);
    sourceBars += `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span>${sourceLabels[k]}</span><span style="font-family:'DM Mono',monospace;color:var(--text2)">${count}</span></div>
      <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${sourceColors[k]};border-radius:3px"></div></div>
    </div>`;
  });

  const funnelStages = [
    { label: 'Leads', count: stc.lead || 0, color: 'var(--text3)' },
    { label: 'Contacted', count: stc.contacted || 0, color: 'var(--brand-mid)' },
    { label: 'Quoted', count: stc.quoted || 0, color: 'var(--accent)' },
    { label: 'Negotiating', count: stc.negotiating || 0, color: '#e0a040' },
    { label: 'Won', count: stc.won || 0, color: '#3fb950' }
  ];
  const maxFunnel = Math.max(1, ...funnelStages.map(f => f.count));

  let funnelHtml = '';
  funnelStages.forEach(f => {
    const pct = Math.max(10, Math.round((f.count / maxFunnel) * 100));
    funnelHtml += `<div style="text-align:center;flex:1">
      <div style="font-size:16px;font-weight:700;color:${f.color}">${f.count}</div>
      <div style="height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;margin:4px 0"><div style="height:100%;width:${pct}%;background:${f.color};border-radius:4px;margin:0 auto"></div></div>
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${f.label}</div>
    </div>`;
  });

  const months = data.monthlyLeads || {};
  const sortedMonths = Object.keys(months).sort().slice(-6);
  const maxMonth = Math.max(1, ...sortedMonths.map(m => months[m]));
  let trendHtml = '';
  sortedMonths.forEach(m => {
    const count = months[m];
    const pct = Math.round((count / maxMonth) * 100);
    const label = new Date(m + '-01').toLocaleDateString('en-ZA', { month: 'short' });
    trendHtml += `<div style="flex:1;text-align:center">
      <div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text2);margin-bottom:4px">${count}</div>
      <div style="height:80px;display:flex;align-items:flex-end;justify-content:center"><div style="width:20px;height:${pct}%;background:var(--brand-mid);border-radius:3px 3px 0 0;min-height:4px"></div></div>
      <div style="font-size:9px;color:var(--text3);margin-top:4px">${label}</div>
    </div>`;
  });

  const campStatusColors = { planning: 'b-pending', active: 'b-in_progress', paused: 'b-blocked', completed: 'b-done' };
  let campRows = '';
  campaigns.forEach(c => {
    campRows += `<div class="user-row">
      <div class="user-info">
        <div class="user-name">${escHtml(c.name)}</div>
        <div class="user-meta">${escHtml(c.type.replace('_', ' '))} · ${escHtml((c.channels || []).join(', ') || 'no channels')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="text-align:center;min-width:40px"><div style="font-size:13px;font-weight:600">${c.metrics ? c.metrics.leadsGenerated : 0}</div><div style="font-size:8px;color:var(--text3);font-family:'DM Mono',monospace">LEADS</div></div>
        <div style="text-align:center;min-width:40px"><div style="font-size:13px;font-weight:600;color:#3fb950">${c.metrics ? c.metrics.conversions : 0}</div><div style="font-size:8px;color:var(--text3);font-family:'DM Mono',monospace">WON</div></div>
        <span class="bdg ${campStatusColors[c.status] || ''}">${c.status}</span>
        <button class="btn bsm bo" onclick="editCampaign('${c.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button>
        <button class="btn bsm bdng" onclick="deleteCampaign('${c.id}')"><i class="ti ti-trash" style="font-size:12px"></i></button>
      </div>
    </div>`;
  });

  el.innerHTML = `
    <div class="g4">
      <div class="stat"><div class="slbl">Total Leads</div><div class="sval">${s.totalLeads || 0}</div><div class="ssub">${s.followUpsDue || 0} follow-ups due</div></div>
      <div class="stat"><div class="slbl">Conversion Rate</div><div class="sval cb">${s.conversionRate || 0}%</div><div class="ssub">lead → won</div></div>
      <div class="stat"><div class="slbl">Pipeline Value</div><div class="sval ca">R${Math.round(s.pipelineValue || 0).toLocaleString()}</div><div class="ssub">active deals</div></div>
      <div class="stat"><div class="slbl">Revenue Won</div><div class="sval cg">R${Math.round(s.revenueWon || 0).toLocaleString()}</div><div class="ssub">closed deals</div></div>
    </div>

    <div class="g3">
      <div class="card">
        <div class="ctitle">Lead Sources</div>
        ${sourceBars || '<div style="font-size:11px;color:var(--text3)">No lead data yet</div>'}
      </div>
      <div class="card">
        <div class="ctitle">Pipeline Funnel</div>
        <div style="display:flex;gap:4px;align-items:flex-end">${funnelHtml}</div>
      </div>
      <div class="card">
        <div class="ctitle">Monthly Leads</div>
        ${trendHtml ? `<div style="display:flex;gap:4px;align-items:flex-end">${trendHtml}</div>` : '<div style="font-size:11px;color:var(--text3)">Not enough data yet</div>'}
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="ctitle" style="margin-bottom:0">Campaigns (${campaigns.length})</div>
        <button class="btn bsm" onclick="showCampaignForm()"><i class="ti ti-plus" style="font-size:11px"></i> New Campaign</button>
      </div>
      ${campRows || '<div class="empty-state"><i class="ti ti-speakerphone"></i>No campaigns yet</div>'}
    </div>

    ${cm.sent > 0 ? `<div class="card">
      <div class="ctitle">Campaign Totals</div>
      <div class="g3" style="margin-bottom:0">
        <div style="text-align:center"><div style="font-size:18px;font-weight:700">${cm.sent}</div><div style="font-size:10px;color:var(--text3)">Sent</div></div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--brand-mid)">${cm.replied}</div><div style="font-size:10px;color:var(--text3)">Replied</div></div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#3fb950">R${Math.round(cm.revenue).toLocaleString()}</div><div style="font-size:10px;color:var(--text3)">Revenue</div></div>
      </div>
    </div>` : ''}

    <div id="campaignForm"></div>`;
}

function showCampaignForm(existing) {
  const c = existing || {};
  document.getElementById('campaignForm').innerHTML = `<div class="card" style="margin-top:14px">
    <div class="ctitle">${c.id ? 'Edit' : 'New'} Campaign</div>
    <div style="display:flex;gap:8px">
      <div style="flex:2"><div class="flbl">Name *</div><input type="text" id="cmpName" style="width:100%" value="${c.name || ''}"></div>
      <div style="flex:1"><div class="flbl">Type</div><select id="cmpType" style="width:100%">
        <option value="cold_outreach" ${c.type === 'cold_outreach' ? 'selected' : ''}>Cold Outreach</option>
        <option value="social_media" ${c.type === 'social_media' ? 'selected' : ''}>Social Media</option>
        <option value="referral" ${c.type === 'referral' ? 'selected' : ''}>Referral</option>
        <option value="event" ${c.type === 'event' ? 'selected' : ''}>Event</option>
        <option value="content_marketing" ${c.type === 'content_marketing' ? 'selected' : ''}>Content Marketing</option>
      </select></div>
    </div>
    <div style="display:flex;gap:8px">
      <div style="flex:1"><div class="flbl">Start Date</div><input type="date" id="cmpStart" style="width:100%" value="${c.startDate ? c.startDate.substring(0, 10) : ''}"></div>
      <div style="flex:1"><div class="flbl">End Date</div><input type="date" id="cmpEnd" style="width:100%" value="${c.endDate ? c.endDate.substring(0, 10) : ''}"></div>
      <div style="flex:1"><div class="flbl">Budget (R)</div><input type="number" id="cmpBudget" style="width:100%" value="${c.budget || 0}"></div>
    </div>
    <div class="flbl">Target Audience</div>
    <input type="text" id="cmpAudience" style="width:100%" value="${c.targetAudience || ''}" placeholder="e.g. Mid-size manufacturers in Western Cape">
    <div class="flbl">Channels</div>
    <div style="display:flex;gap:10px;margin-top:4px;margin-bottom:8px">
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="cmpCh" value="linkedin" ${(c.channels || []).includes('linkedin') ? 'checked' : ''}> LinkedIn</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="cmpCh" value="email" ${(c.channels || []).includes('email') ? 'checked' : ''}> Email</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="cmpCh" value="facebook" ${(c.channels || []).includes('facebook') ? 'checked' : ''}> Facebook</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="cmpCh" value="instagram" ${(c.channels || []).includes('instagram') ? 'checked' : ''}> Instagram</label>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" class="cmpCh" value="phone" ${(c.channels || []).includes('phone') ? 'checked' : ''}> Phone</label>
    </div>
    ${c.id ? `
    <div class="fl">METRICS</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <div style="flex:1"><div class="flbl">Sent</div><input type="number" id="cmpSent" style="width:100%" value="${c.metrics ? c.metrics.sent : 0}"></div>
      <div style="flex:1"><div class="flbl">Opened</div><input type="number" id="cmpOpened" style="width:100%" value="${c.metrics ? c.metrics.opened : 0}"></div>
      <div style="flex:1"><div class="flbl">Replied</div><input type="number" id="cmpReplied" style="width:100%" value="${c.metrics ? c.metrics.replied : 0}"></div>
      <div style="flex:1"><div class="flbl">Leads</div><input type="number" id="cmpLeads" style="width:100%" value="${c.metrics ? c.metrics.leadsGenerated : 0}"></div>
      <div style="flex:1"><div class="flbl">Won</div><input type="number" id="cmpConv" style="width:100%" value="${c.metrics ? c.metrics.conversions : 0}"></div>
      <div style="flex:1"><div class="flbl">Revenue</div><input type="number" id="cmpRevenue" style="width:100%" value="${c.metrics ? c.metrics.revenue : 0}"></div>
    </div>
    <div class="flbl">Status</div>
    <select id="cmpStatus" style="width:100%">
      <option value="planning" ${c.status === 'planning' ? 'selected' : ''}>Planning</option>
      <option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option>
      <option value="paused" ${c.status === 'paused' ? 'selected' : ''}>Paused</option>
      <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Completed</option>
    </select>
    <input type="hidden" id="cmpEditId" value="${c.id}">` : ''}
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" onclick="submitCampaign()">${c.id ? 'Update' : 'Create'}</button>
      <button class="btn bo" onclick="document.getElementById('campaignForm').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

async function submitCampaign() {
  const name = document.getElementById('cmpName').value.trim();
  if (!name) { ntf('Name is required'); return; }

  const channels = [];
  document.querySelectorAll('.cmpCh:checked').forEach(cb => channels.push(cb.value));

  const body = {
    name,
    type: document.getElementById('cmpType').value,
    startDate: document.getElementById('cmpStart').value || null,
    endDate: document.getElementById('cmpEnd').value || null,
    budget: document.getElementById('cmpBudget').value,
    targetAudience: document.getElementById('cmpAudience').value.trim(),
    channels
  };

  const editId = document.getElementById('cmpEditId');
  if (editId) {
    body.status = document.getElementById('cmpStatus').value;
    body.metrics = {
      sent: parseInt(document.getElementById('cmpSent').value) || 0,
      opened: parseInt(document.getElementById('cmpOpened').value) || 0,
      replied: parseInt(document.getElementById('cmpReplied').value) || 0,
      leadsGenerated: parseInt(document.getElementById('cmpLeads').value) || 0,
      conversions: parseInt(document.getElementById('cmpConv').value) || 0,
      revenue: parseInt(document.getElementById('cmpRevenue').value) || 0
    };
    await apiCall('PUT', '/campaigns/' + editId.value, body);
    ntf('Campaign updated');
  } else {
    await apiCall('POST', '/campaigns', body);
    ntf('Campaign created');
  }
  document.getElementById('campaignForm').innerHTML = '';
  loadMarketing();
}

async function editCampaign(id) {
  const data = await apiGet('/campaigns');
  const campaigns = (data && data.campaigns) || [];
  const c = campaigns.find(x => x.id === id);
  if (c) showCampaignForm(c);
}

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign?')) return;
  await apiCall('DELETE', '/campaigns/' + id);
  ntf('Campaign deleted');
  loadMarketing();
}
