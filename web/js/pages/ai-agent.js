let webAgentQueue = [];
let webAgentLastScan = null;
let webAgentTab = 0;

const webAgentTypeLabel = { email_reply:'Lead reply', cold_email:'Cold email', quote_draft:'Quote draft', linkedin_post:'LinkedIn post', opportunity:'Opportunity', task_reminder:'Task reminder' };
const webAgentTypeIcon  = { email_reply:'ti-mail', cold_email:'ti-send', quote_draft:'ti-file-invoice', linkedin_post:'ti-brand-linkedin', opportunity:'ti-briefcase', task_reminder:'ti-bell' };
const webAgentTypeColor = { email_reply:'var(--brand-mid)', cold_email:'var(--accent)', quote_draft:'#3fb950', linkedin_post:'#0a66c2', opportunity:'#a371f7', task_reminder:'#f85149' };
const webAgentFlagColor = { lead:'#3fb950', quote_request:'var(--accent)', urgent:'#f85149', follow_up:'var(--brand-mid)', outreach:'var(--accent)', content:'var(--brand-mid)', opportunity:'#a371f7' };

async function render_agent() {
  const el = document.getElementById('page-agent');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace" id="webAgentLastScan">Never scanned</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">Claude scans your emails and platforms, prepares everything — you just approve</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" id="webAgentScanBtn" style="display:flex;align-items:center;gap:6px" onclick="webAgentRunScan()"><i class="ti ti-refresh"></i> Run full scan</button>
      <button class="btn bo bsm" style="color:#f85149;border-color:rgba(248,81,73,.3)" onclick="webAgentReset()" title="Clear cloud queue"><i class="ti ti-trash"></i> Reset all</button>
    </div>
  </div>
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="slbl">Pending approval</div><div class="sval ca" id="webAgPending">—</div><div class="ssub">ready for your review</div></div>
    <div class="stat"><div class="slbl">Emails prepared</div><div class="sval cb" id="webAgEmails">—</div><div class="ssub">replies + cold outreach</div></div>
    <div class="stat"><div class="slbl">LinkedIn posts</div><div class="sval cg" id="webAgPosts">—</div><div class="ssub">ready to publish</div></div>
    <div class="stat"><div class="slbl">Opportunities</div><div class="sval" id="webAgOpps">—</div><div class="ssub">Upwork + platforms</div></div>
  </div>
  <div class="wtabs" style="margin-bottom:12px">
    <button class="wtab active" id="webAgTab0" onclick="webAgentSetTab(0)">Pending queue</button>
    <button class="wtab" id="webAgTab1" onclick="webAgentSetTab(1)">Opportunities</button>
    <button class="wtab" id="webAgTab2" onclick="webAgentSetTab(2)">History</button>
    <button class="wtab" id="webAgTab3" onclick="webAgentSetTab(3)"><i class="ti ti-world" style="font-size:11px;margin-right:3px"></i>Website jobs</button>
    <button class="wtab" id="webAgTab4" onclick="webAgentSetTab(4)"><i class="ti ti-checklist" style="font-size:11px;margin-right:3px"></i>My Tasks</button>
    <button class="wtab" id="webAgTab5" onclick="webAgentSetTab(5)"><i class="ti ti-file-description" style="font-size:11px;margin-right:3px"></i>Job Cards</button>
  </div>
  <div id="webAgentTabContent"><div class="spin"></div> Loading...</div>`;
  await webAgentLoadQueue();
}

function webAgentFmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-ZA', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

async function webAgentLoadQueue() {
  try {
    const data = await apiGet('/agent/queue');
    webAgentQueue = (data && data.queue) || [];
    webAgentLastScan = data && data.lastScan;
  } catch {
    webAgentQueue = [];
    webAgentLastScan = null;
  }
  const last = document.getElementById('webAgentLastScan');
  if (last) last.textContent = webAgentLastScan ? 'Last scan: ' + webAgentFmtTime(webAgentLastScan) : 'Never scanned — run full scan in Electron to start';
  webAgentUpdateStats();
  webAgentRenderTab();
}

function webAgentUpdateStats() {
  const pending = webAgentQueue.filter(i => i.status === 'pending');
  const emails = pending.filter(i => ['email_reply','cold_email','quote_draft'].includes(i.type));
  const posts = pending.filter(i => i.type === 'linkedin_post');
  const opps = pending.filter(i => i.type === 'opportunity');
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('webAgPending', pending.length);
  set('webAgEmails', emails.length);
  set('webAgPosts', posts.length);
  set('webAgOpps', opps.length);
}

function webAgentSetTab(tab) {
  webAgentTab = tab;
  [0,1,2,3,4,5].forEach(i => document.getElementById('webAgTab' + i)?.classList.toggle('active', i === tab));
  webAgentRenderTab();
}

function webAgentRenderTab() {
  const el = document.getElementById('webAgentTabContent');
  if (!el) return;
  if (webAgentTab === 0) el.innerHTML = webAgentRenderPending();
  else if (webAgentTab === 1) el.innerHTML = webAgentRenderOpportunities();
  else if (webAgentTab === 2) el.innerHTML = webAgentRenderHistory();
  else if (webAgentTab === 3) el.innerHTML = webAgentRenderWebsiteJobs();
  else if (webAgentTab === 4) el.innerHTML = '<div class="card"><div style="font-size:12px;color:var(--text2)">My Tasks are available from the Weekly tasks / Team Tasks pages.</div></div>';
  else el.innerHTML = '<div class="card"><div style="font-size:12px;color:var(--text2)">Job Cards are available from the Job Tasks page.</div></div>';
}

function webAgentRenderPending() {
  const items = webAgentQueue.filter(i => i.status === 'pending').sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return `<div class="card" style="text-align:center;padding:30px"><i class="ti ti-check" style="font-size:32px;color:#3fb950;display:block;margin-bottom:8px"></i><div style="font-size:13px;color:var(--text2)">Queue is empty.</div><div style="font-size:11px;color:var(--text3);margin-top:4px">Run full scan in Electron to find leads, prepare emails and LinkedIn posts.</div></div>`;
  const groups = {};
  items.forEach(i => { if (!groups[i.type]) groups[i.type] = []; groups[i.type].push(i); });
  return Object.entries(groups).map(([type, list]) => `<div style="margin-bottom:16px">
    <div class="fl" style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
      <i class="ti ${webAgentTypeIcon[type] || 'ti-file'}" style="color:${webAgentTypeColor[type] || 'var(--text2)'}"></i>
      <span>${webAgentTypeLabel[type] || type} (${list.length})</span>
    </div>
    ${list.map(webAgentRenderItem).join('')}
  </div>`).join('');
}

function webAgentRenderItem(item) {
  const flagColor = webAgentFlagColor[item.flagType] || 'var(--text3)';
  const preview = (item.body || '').slice(0, 180).replace(/\n/g, ' ');
  const diagnostic = (item.painPoint || item.evidence || item.techsinnoSolution || item.nextStep) ? `<div style="background:rgba(95,168,196,.08);border:1px solid rgba(95,168,196,.18);border-radius:var(--radius-sm);padding:8px 10px;margin:7px 0">
    <div style="font-size:10px;color:var(--brand-mid);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">Problem spotted</div>
    ${item.painPoint ? `<div style="font-size:11px;color:var(--text);margin-bottom:3px"><strong>Pain:</strong> ${escHtml(item.painPoint)}</div>` : ''}
    ${item.evidence ? `<div style="font-size:10px;color:var(--text2);margin-bottom:3px"><strong>Evidence/assumption:</strong> ${escHtml(item.evidence)}</div>` : ''}
    ${item.techsinnoSolution ? `<div style="font-size:10px;color:var(--text2);margin-bottom:3px"><strong>TECHSINNO fit:</strong> ${escHtml(item.techsinnoSolution)}</div>` : ''}
    ${item.nextStep ? `<div style="font-size:10px;color:var(--accent)"><strong>First step:</strong> ${escHtml(item.nextStep)}</div>` : ''}
  </div>` : '';
  return `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid ${flagColor};border-radius:var(--radius);padding:11px 13px;margin-bottom:8px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.title || item.subject || '(untitled)')}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${escHtml(item.reason || '')}</div>
      </div>
      <button class="btn bsm bo" onclick="webAgentDismiss('${item.id}')">Skip</button>
    </div>
    ${item.to ? `<div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:5px">To: ${escHtml(item.to)}</div>` : ''}
    ${diagnostic}
    <div style="font-size:11px;color:var(--text2);line-height:1.5;margin:6px 0 9px;background:var(--bg4);padding:7px 9px;border-radius:var(--radius-sm)">${escHtml(preview)}${item.body && item.body.length > 180 ? '…' : ''}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${item.url ? `<button class="btn bsm" onclick="window.open('${item.url}','_blank')"><i class="ti ti-external-link"></i> View</button>` : ''}
      <button class="btn bsm bo" onclick="webAgentCopy('${item.id}')"><i class="ti ti-copy"></i> Copy</button>
    </div>
  </div>`;
}

function webAgentRenderOpportunities() {
  const opps = webAgentQueue.filter(i => i.type === 'opportunity' && i.status !== 'dismissed');
  if (!opps.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No opportunities yet.</div>';
  return opps.map(webAgentRenderItem).join('');
}

function webAgentRenderHistory() {
  const done = webAgentQueue.filter(i => ['approved','dismissed','error'].includes(i.status));
  if (!done.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No history yet.</div>';
  return done.map(i => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(i.title || i.subject || '(untitled)')}</div><div style="font-size:10px;color:var(--text3)">${escHtml(i.status)}</div></div></div>`).join('');
}

function webAgentRenderWebsiteJobs() {
  const jobs = webAgentQueue.filter(i => i.source === 'website_match' && i.status !== 'dismissed');
  if (!jobs.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No website-matched jobs yet.</div>';
  return jobs.map(webAgentRenderItem).join('');
}

async function webAgentDismiss(id) {
  webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'dismissed' } : i);
  await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
  webAgentUpdateStats();
  webAgentRenderTab();
}

async function webAgentReset() {
  if (!confirm('Clear the shared AI queue?')) return;
  webAgentQueue = [];
  webAgentLastScan = null;
  await apiPut('/agent/queue', { queue: [], lastScan: null });
  webAgentUpdateStats();
  webAgentRenderTab();
}

function webAgentCopy(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  navigator.clipboard.writeText([item.subject, item.body].filter(Boolean).join('\n\n'));
  ntf('Copied');
}

async function webAgentRunScan() {
  const btn = document.getElementById('webAgentScanBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Scanning...'; }
  ntf('Cloud AI scan started...');
  try {
    const data = await apiPost('/agent/scan', {});
    if (data && data.error) ntf(data.error);
    else ntf(`Scan complete · ${data.newItems || 0} new item(s)`);
    await webAgentLoadQueue();
  } catch {
    ntf('Cloud scan failed');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh"></i> Run full scan'; }
}
