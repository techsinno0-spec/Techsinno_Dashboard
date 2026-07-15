let webAgentQueue = [];
let webAgentLastScan = null;
let webAgentLastErrors = [];
let webAgentTab = 0;
let webManualTasks = [];
let webAgentJobCards = [];

const webAgentTypeLabel = {
  email_reply:'Lead reply', cold_email:'Cold email', quote_draft:'Quote draft', linkedin_post:'LinkedIn post',
  opportunity:'Opportunity', task_reminder:'Task reminder', admin_task:'Admin task', admin_recommendation:'Admin recommendation',
  task_assignment:'Task assignment', job_abnormality:'Job abnormality', lead_followup:'Lead follow-up', service_suggestion:'Service suggestion',
  invoice_overdue:'Overdue invoice'
};
const webAgentTypeIcon  = {
  email_reply:'ti-mail', cold_email:'ti-send', quote_draft:'ti-file-invoice', linkedin_post:'ti-brand-linkedin',
  opportunity:'ti-briefcase', task_reminder:'ti-bell', admin_task:'ti-clipboard-check', admin_recommendation:'ti-bulb',
  task_assignment:'ti-user-plus', job_abnormality:'ti-alert-triangle', lead_followup:'ti-phone-call', service_suggestion:'ti-sparkles',
  invoice_overdue:'ti-cash'
};
const webAgentTypeColor = {
  email_reply:'var(--brand-mid)', cold_email:'var(--accent)', quote_draft:'#3fb950', linkedin_post:'#0a66c2',
  opportunity:'#a371f7', task_reminder:'#f85149', admin_task:'#5fa8c4', admin_recommendation:'#a371f7',
  task_assignment:'#3fb950', job_abnormality:'#f85149', lead_followup:'var(--accent)', service_suggestion:'#ff8a65',
  invoice_overdue:'#f85149'
};
const webAgentFlagColor = { lead:'#3fb950', quote_request:'var(--accent)', urgent:'#f85149', blocked:'#f85149', follow_up:'var(--brand-mid)', outreach:'var(--accent)', content:'var(--brand-mid)', opportunity:'#a371f7', admin:'#5fa8c4' };

async function render_agent() {
  const el = document.getElementById('page-agent');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace" id="webAgentLastScan">Never scanned</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">Claude scans your emails and platforms, prepares everything — you just approve</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" id="webAgentScanBtn" style="display:flex;align-items:center;gap:6px" onclick="webAgentRunScan()"><i class="ti ti-refresh"></i> Run full scan</button>
      <button class="btn bo bsm" id="webAgentBriefingBtn" onclick="webAgentSendBriefing()" title="Compose and email the morning briefing now"><i class="ti ti-mail-forward"></i> Email briefing</button>
      <button class="btn bo bsm" style="color:#f85149;border-color:rgba(248,81,73,.3)" onclick="webAgentReset()" title="Clear cloud queue"><i class="ti ti-trash"></i> Reset all</button>
    </div>
  </div>
  <div id="webAgentErrors"></div>
  <div class="g4" style="margin-bottom:14px">
    <div class="stat"><div class="slbl">Pending approval</div><div class="sval ca" id="webAgPending">—</div><div class="ssub">ready for your review</div></div>
    <div class="stat"><div class="slbl">Emails prepared</div><div class="sval cb" id="webAgEmails">—</div><div class="ssub">replies + chasers + outreach</div></div>
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
    <button class="wtab" id="webAgTab6" onclick="webAgentSetTab(6)">History</button>
  </div>
  <div id="webAgentTabContent"><div class="spin"></div> Loading...</div>`;
  const adminStat = document.getElementById('webAgOpps');
  if (adminStat) {
    adminStat.id = 'webAgAdmin';
    const box = adminStat.closest('.stat');
    if (box) {
      const label = box.querySelector('.slbl');
      const sub = box.querySelector('.ssub');
      if (label) label.textContent = 'Admin alerts';
      if (sub) sub.textContent = 'tasks + jobs + CRM';
    }
  }
  const intro = document.getElementById('webAgentLastScan')?.nextElementSibling;
  if (intro) intro.textContent = 'Claude watches admin, tasks, jobs, money, leads and email, then proposes the next move for approval';
  const adminTab = document.getElementById('webAgTab2');
  if (adminTab) adminTab.textContent = 'Admin review';
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
    webAgentLastErrors = (data && data.lastErrors) || [];
  } catch {
    webAgentQueue = [];
    webAgentLastScan = null;
    webAgentLastErrors = [];
  }
  const last = document.getElementById('webAgentLastScan');
  if (last) last.textContent = webAgentLastScan ? 'Last scan: ' + webAgentFmtTime(webAgentLastScan) : 'Never scanned — run full scan in Electron to start';
  webAgentRenderErrors();
  webAgentUpdateStats();
  webAgentRenderTab();
}

function webAgentRenderErrors() {
  const el = document.getElementById('webAgentErrors');
  if (!el) return;
  if (!webAgentLastErrors.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.06);padding:10px 12px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:600;color:#f85149;margin-bottom:5px"><i class="ti ti-alert-triangle"></i> Last scan reported ${webAgentLastErrors.length} problem(s)</div>
    ${webAgentLastErrors.map(e => `<div style="font-size:11px;color:var(--text2);line-height:1.5">• ${escHtml(e)}</div>`).join('')}
    <div style="font-size:10px;color:var(--text3);margin-top:5px">These sources returned nothing this scan — fix the connection in Settings, then run a new scan.</div>
  </div>`;
}

function webAgentUpdateStats() {
  const pending = webAgentQueue.filter(i => i.status === 'pending');
  const emails = pending.filter(i => ['email_reply','cold_email','quote_draft','invoice_overdue'].includes(i.type));
  const posts = pending.filter(i => i.type === 'linkedin_post');
  const admin = pending.filter(i => ['admin_task','admin_recommendation','task_assignment','job_abnormality','lead_followup','service_suggestion'].includes(i.type));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('webAgPending', pending.length);
  set('webAgEmails', emails.length);
  set('webAgPosts', posts.length);
  set('webAgAdmin', admin.length);
}

function webAgentSetTab(tab) {
  webAgentTab = tab;
  [0,1,2,3,4,5,6].forEach(i => document.getElementById('webAgTab' + i)?.classList.toggle('active', i === tab));
  webAgentRenderTab();
}

function webAgentRenderTab() {
  const el = document.getElementById('webAgentTabContent');
  if (!el) return;
  if (webAgentTab === 0) el.innerHTML = webAgentRenderPending();
  else if (webAgentTab === 1) el.innerHTML = webAgentRenderOpportunities();
  else if (webAgentTab === 2) el.innerHTML = webAgentRenderAdminReview();
  else if (webAgentTab === 3) el.innerHTML = webAgentRenderWebsiteJobs();
  else if (webAgentTab === 4) { el.innerHTML = '<div class="card"><div class="spin"></div> Loading tasks...</div>'; webAgentRenderMyTasks(el); }
  else if (webAgentTab === 5) { el.innerHTML = '<div class="card"><div class="spin"></div> Loading job cards...</div>'; webAgentRenderJobCards(el); }
  else el.innerHTML = webAgentRenderHistory();
}

function webAgentRenderPending() {
  const items = webAgentQueue.filter(i => i.status === 'pending').sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return `<div class="card" style="text-align:center;padding:30px"><i class="ti ti-check" style="font-size:32px;color:#3fb950;display:block;margin-bottom:8px"></i><div style="font-size:13px;color:var(--text2)">Queue is empty.</div><div style="font-size:11px;color:var(--text3);margin-top:4px">Run full scan to find leads, prepare emails, chase invoices and review admin.</div></div>`;
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
  const actionBtn = item.action && item.action.kind ? `<button class="btn bsm" onclick="webAgentRunAction('${item.id}')"><i class="ti ti-player-play"></i> ${escHtml(item.action.label || 'Approve action')}</button>` : '';
  const sendable = ['email_reply', 'cold_email', 'invoice_overdue'].includes(item.type) && item.to && item.provider;
  const sendBtn = sendable ? `<button class="btn bsm" onclick="webAgentReviewSend('${item.id}')"><i class="ti ti-send"></i> Review &amp; send</button>` : '';
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
      ${sendBtn}
      ${actionBtn}
      ${item.url ? `<button class="btn bsm" onclick="window.open('${item.url}','_blank')"><i class="ti ti-external-link"></i> View</button>` : ''}
      <button class="btn bsm bo" onclick="webAgentCopy('${item.id}')"><i class="ti ti-copy"></i> Copy</button>
    </div>
    <div id="agsend-${item.id}" data-open="0"></div>
  </div>`;
}

// Inline editor: review the AI-drafted email, tweak it, then send via the real mail endpoint.
function webAgentReviewSend(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  const box = document.getElementById('agsend-' + id);
  if (!box) return;
  if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = '0'; return; }
  box.dataset.open = '1';
  box.innerHTML = `
    <div style="margin-top:8px;padding:10px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--radius-sm)">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">TO · via ${escHtml(item.provider || '')}</div>
      <input id="agsend-to-${id}" type="email" value="${escHtml(item.to || '')}" style="width:100%;font-size:12px;margin-bottom:6px;box-sizing:border-box">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">SUBJECT</div>
      <input id="agsend-subject-${id}" type="text" value="${escHtml(item.subject || '')}" style="width:100%;font-size:12px;margin-bottom:6px;box-sizing:border-box">
      <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-bottom:4px">MESSAGE</div>
      <textarea id="agsend-body-${id}" style="width:100%;font-size:12px;min-height:160px;resize:vertical;box-sizing:border-box">${escHtml(item.body || '')}</textarea>
      <div id="agsend-err-${id}" style="font-size:11px;color:#f85149;margin-top:6px"></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn bsm" id="agsend-btn-${id}" onclick="webAgentSendEmail('${id}')"><i class="ti ti-send"></i> Send now</button>
        <button class="btn bsm bo" onclick="webAgentReviewSend('${id}')">Close</button>
      </div>
    </div>`;
}

async function webAgentSendEmail(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item) return;
  const provider = item.provider;
  const to = document.getElementById('agsend-to-' + id)?.value.trim();
  const subject = document.getElementById('agsend-subject-' + id)?.value.trim();
  const body = document.getElementById('agsend-body-' + id)?.value;
  const err = document.getElementById('agsend-err-' + id);
  const setErr = (t) => { if (err) err.textContent = t; };

  if (!provider) return setErr('No email provider on this item');
  if (!to) return setErr('Recipient is required');
  if (!subject) return setErr('Subject is required');
  if (!confirm(`Send this email via ${provider} to ${to}?`)) return;
  setErr('');

  const btn = document.getElementById('agsend-btn-' + id);
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Sending...'; }

  try {
    const data = await apiPost(`/email/send/${provider}`, { to, subject, body });
    if (data && data.error) {
      setErr(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Send now'; }
      return;
    }
    webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'approved', approvedAt: Date.now() } : i);
    await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
    ntf('Email sent');
    webAgentUpdateStats();
    webAgentRenderTab();
  } catch {
    setErr('Failed to send email');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Send now'; }
  }
}

function webAgentRenderOpportunities() {
  const opps = webAgentQueue.filter(i => i.type === 'opportunity' && i.status !== 'dismissed');
  if (!opps.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No opportunities yet.<div style="font-size:11px;color:var(--text3);margin-top:6px">Note: Upwork discontinued its public RSS job feeds in Aug 2024, so the old Upwork leg has been retired. A rebuilt sourcing leg (tenders + search) is planned.</div></div>';
  return opps.map(webAgentRenderItem).join('');
}

function webAgentRenderAdminReview() {
  const adminTypes = ['admin_task','admin_recommendation','task_assignment','job_abnormality','lead_followup','service_suggestion','invoice_overdue'];
  const items = webAgentQueue
    .filter(i => adminTypes.includes(i.type) && i.status !== 'dismissed')
    .sort((a,b) => (a.priority || 9) - (b.priority || 9));
  if (!items.length) return '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No admin alerts yet. Run a full scan to review tasks, jobs, CRM, invoices and next actions.</div>';
  return items.map(webAgentRenderItem).join('');
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

async function webAgentLoadManualTasks() {
  const state = await syncLoad();
  webManualTasks = (state && state.data && Array.isArray(state.data.manualTasks)) ? state.data.manualTasks : [];
  return state && state.data ? state.data : {};
}

async function webAgentSaveManualTasks() {
  const saved = await syncSave({ manualTasks: webManualTasks });
  if (!saved || saved.error || saved.success === false) throw new Error(saved && saved.error ? saved.error : 'Cloud sync failed');
}

async function webAgentRenderMyTasks(el) {
  try {
    await webAgentLoadManualTasks();
    el.innerHTML = webAgentMyTasksHtml();
  } catch {
    el.innerHTML = '<div class="card" style="color:#f85149;font-size:12px">Failed to load shared tasks.</div>';
  }
}

function webAgentMyTasksHtml() {
  const rows = webManualTasks.length ? webManualTasks.map(t => {
    const done = t.status === 'done';
    const due = t.deadline ? new Date(t.deadline + (t.time ? 'T' + t.time : 'T00:00')) : null;
    const overdue = due && due.getTime() < Date.now() && !done;
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 11px;background:var(--bg3);border:1px solid ${overdue ? 'rgba(248,81,73,.4)' : 'var(--border)'};border-radius:var(--radius);margin-bottom:6px;opacity:${done ? '.55' : '1'}">
      <input type="checkbox" ${done ? 'checked' : ''} onchange="webAgentToggleManualTask('${t.id}',this.checked)" style="width:15px;height:15px;flex-shrink:0;cursor:pointer;margin-top:2px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text);text-decoration:${done ? 'line-through' : 'none'}">${escHtml(t.title || '')}</div>
        ${t.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(t.description)}</div>` : ''}
        <div style="font-size:10px;color:${overdue ? '#f85149' : 'var(--text3)'};font-family:'DM Mono',monospace;margin-top:4px">${overdue ? 'OVERDUE · ' : ''}${t.deadline || 'No deadline'}${t.time ? ' · ' + t.time : ''} · ${escHtml(t.priority || 'medium')}</div>
      </div>
      <button class="btn bo bsm" onclick="webAgentDeleteManualTask('${t.id}')">Delete</button>
    </div>`;
  }).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:18px">No tasks yet — add one below.</div>';

  return `<div class="card" style="margin-bottom:12px">
    <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:10px"><i class="ti ti-plus"></i> Add shared task</div>
    <div style="display:grid;grid-template-columns:1fr 150px 150px 130px;gap:8px;margin-bottom:8px">
      <input id="webMtTitle" type="text" placeholder="Task title *" style="font-size:12px">
      <input id="webMtDeadline" type="date" style="font-size:12px">
      <input id="webMtTime" type="time" style="font-size:12px">
      <select id="webMtPriority" style="font-size:12px"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select>
    </div>
    <textarea id="webMtDesc" placeholder="Description / notes (optional)" style="width:100%;font-size:12px;min-height:52px;resize:vertical;margin-bottom:8px;box-sizing:border-box"></textarea>
    <div style="text-align:right"><button class="btn bsm" onclick="webAgentAddManualTask()"><i class="ti ti-plus"></i> Add task</button></div>
  </div>${rows}`;
}

async function webAgentAddManualTask() {
  const title = document.getElementById('webMtTitle')?.value.trim();
  if (!title) return ntf('Task title is required');
  const previous = [...webManualTasks];
  webManualTasks.unshift({
    id: 'mt_' + Date.now().toString(36),
    title,
    description: document.getElementById('webMtDesc')?.value.trim() || '',
    deadline: document.getElementById('webMtDeadline')?.value || '',
    time: document.getElementById('webMtTime')?.value || '',
    priority: document.getElementById('webMtPriority')?.value || 'medium',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not saved to cloud'); return; }
  webAgentRenderTab();
  ntf('Task added');
}

async function webAgentToggleManualTask(id, done) {
  const previous = [...webManualTasks];
  webManualTasks = webManualTasks.map(t => t.id === id ? { ...t, status: done ? 'done' : 'pending', updatedAt: Date.now() } : t);
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not saved to cloud'); return; }
  webAgentRenderTab();
}

async function webAgentDeleteManualTask(id) {
  const previous = [...webManualTasks];
  webManualTasks = webManualTasks.filter(t => t.id !== id);
  try { await webAgentSaveManualTasks(); }
  catch(e) { webManualTasks = previous; ntf('Task was not deleted from cloud'); return; }
  webAgentRenderTab();
  ntf('Task deleted');
}

async function webAgentRenderJobCards(el) {
  try {
    const data = await apiGet('/job-cards');
    webAgentJobCards = (data && data.jobCards) || [];
    if (!webAgentJobCards.length) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:30px;color:var(--text2)">No job cards yet.</div>';
      return;
    }
    el.innerHTML = webAgentJobCards.map(c => `<div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(c.title || c.jobTitle || '(untitled)')}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px">${escHtml(c.jobNumber || c.docNumber || '')} · ${escHtml(c.clientName || c.client || 'Unknown client')} · ${escHtml(c.status || 'open')}</div>
          ${(c.description || c.summary) ? `<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-top:7px">${escHtml(c.description || c.summary)}</div>` : ''}
        </div>
        <button class="btn bo bsm" onclick="webAgentDeleteJobCard('${c.id}')">Delete</button>
      </div>
    </div>`).join('');
  } catch {
    el.innerHTML = '<div class="card" style="color:#f85149;font-size:12px">Failed to load job cards.</div>';
  }
}

async function webAgentDeleteJobCard(id) {
  if (!confirm('Delete this job card?')) return;
  await apiDelete('/job-cards/' + id);
  webAgentRenderTab();
  ntf('Job card deleted');
}

async function webAgentDismiss(id) {
  webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'dismissed' } : i);
  await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
  webAgentUpdateStats();
  webAgentRenderTab();
}

async function webAgentRunAction(id) {
  const item = webAgentQueue.find(i => i.id === id);
  if (!item || !item.action || !item.action.kind) return;
  if (!confirm(`Approve AI action: ${item.action.label || item.title || 'Run action'}?`)) return;

  try {
    if (item.action.kind === 'create_task') {
      const payload = item.action.payload || {};
      if (!payload.title || !payload.assignedTo) {
        ntf('AI action is missing task title or assignee');
        return;
      }
      const data = await apiPost('/tasks', payload);
      if (data && data.error) {
        ntf(data.error);
        return;
      }
      webAgentQueue = webAgentQueue.map(i => i.id === id ? { ...i, status: 'approved', approvedAt: Date.now() } : i);
      await apiPut('/agent/queue', { queue: webAgentQueue, lastScan: webAgentLastScan });
      ntf('Task created from AI recommendation');
      webAgentUpdateStats();
      webAgentRenderTab();
      return;
    }
    ntf('This AI action is not supported yet');
  } catch {
    ntf('AI action failed');
  }
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
    else ntf(`Scan complete · ${data.newItems || 0} new item(s)${(data.errors && data.errors.length) ? ` · ${data.errors.length} warning(s)` : ''}`);
    await webAgentLoadQueue();
  } catch {
    ntf('Cloud scan failed');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh"></i> Run full scan'; }
}

async function webAgentSendBriefing() {
  if (!confirm('Compose and email the briefing now?')) return;
  const btn = document.getElementById('webAgentBriefingBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="width:12px;height:12px;border-width:2px"></div> Building...'; }
  ntf('Composing briefing...');
  try {
    const data = await apiPost('/agent/briefing', {});
    if (data && data.error) ntf(data.error);
    else ntf(`Briefing sent to ${data.sentTo} via ${data.provider}`);
  } catch {
    ntf('Briefing failed');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Email briefing'; }
}
