// ─── JOB CARDS PAGE ───────────────────────────────────────────────────────────
let jcFilter = 'active';
let jcDetailId = null;
let _allJobCards = [];

async function render_job_cards() {
  const el = document.getElementById('page-job-cards');
  const role = getUser().role;

  el.innerHTML = '<div class="spin"></div> Loading job cards...';

  try {
    const data = await apiGet('/job-cards');
    const cards = (data && data.jobCards) || [];
    _allJobCards = cards;

    let html = '';

    // Filter tabs
    html += `<div class="wtabs">
      <div class="wtab ${jcFilter === 'all' ? 'active' : ''}" onclick="setJCFilter('all')">All</div>
      <div class="wtab ${jcFilter === 'active' ? 'active' : ''}" onclick="setJCFilter('active')">Job active</div>
      <div class="wtab ${jcFilter === 'pending' ? 'active' : ''}" onclick="setJCFilter('pending')">Job pending / blocked</div>
      <div class="wtab ${jcFilter === 'completed' ? 'active' : ''}" onclick="setJCFilter('completed')">Job done</div>
    </div>`;

    if (role === 'manager') {
      html += `<div style="margin-bottom:14px">
        <button class="btn" onclick="showCreateJobCard()"><i class="ti ti-plus" style="font-size:13px"></i> New Job Card</button>
      </div>
      <div id="createJCForm" style="display:none"></div>`;
    }

    const filtered = jcFilter === 'all' ? cards : cards.filter(c => {
      const status = c.status === 'active' ? 'open' : c.status;
      if (jcFilter === 'active') return ['open', 'in_progress'].includes(status);
      if (jcFilter === 'pending') return ['on_hold', 'blocked', 'pending'].includes(status);
      if (jcFilter === 'completed') return status === 'completed';
      return status === jcFilter;
    });

    if (filtered.length === 0) {
      html += '<div class="empty-state"><i class="ti ti-clipboard-list"></i>No job cards found</div>';
    } else {
      filtered.forEach(jc => {
        const tasks = jc.tasks || [];
        const doneTasks = tasks.filter(t => t.status === 'done').length;
        const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : null;
        const assigned = (jc.assignedTo || []).slice(0, 4);

        html += `<div class="card" style="margin-bottom:8px;cursor:pointer" onclick="toggleJCDetail('${jc.id}')">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                <span style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)">${escHtml(jc.jobNumber)}</span>
                ${jcStatusBadge(jc.status === 'active' ? 'open' : jc.status)}
              </div>
              <div style="font-size:13px;font-weight:500;color:var(--text)">${escHtml(jc.title)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px">
                <i class="ti ti-building" style="font-size:10px"></i> ${escHtml(jc.clientName || '—')}
                ${jc.site ? ' &nbsp;·&nbsp; <i class="ti ti-map-pin" style="font-size:10px"></i> ' + escHtml(jc.site) : ''}
                ${tasks.length > 0 ? ' &nbsp;·&nbsp; ' + doneTasks + '/' + tasks.length + ' tasks done' : ''}
              </div>
              ${progress !== null ? `<div style="margin-top:8px;max-width:300px">
                <div class="pt"><div class="pf pf-brand" style="width:${progress}%"></div></div>
                <div style="font-size:10px;color:var(--text3);margin-top:3px">${progress}% progress</div>
              </div>` : ''}
              ${(jc.status === 'on_hold' || jc.status === 'blocked') && (jc.blockReason || jc.blockedReason || jc.notes?.length) ? `<div style="font-size:10px;color:#f85149;margin-top:5px">Block: ${escHtml(jc.blockReason || jc.blockedReason || jc.notes?.[jc.notes.length - 1]?.text || 'Waiting for update')}</div>` : ''}
              ${jc.status === 'completed' ? `<div style="font-size:10px;color:#3fb950;margin-top:5px">Completed${jc.completionSignOff ? ' · report signed off' : ''}</div>` : ''}
            </div>
            <div style="display:flex;gap:3px;align-items:center;flex-shrink:0">
              ${assigned.map(uid => `<div title="${escHtml(getUserName(uid))}" style="width:24px;height:24px;border-radius:50%;background:var(--brand);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${initials(getUserName(uid))}</div>`).join('')}
              ${jc.assignedTo && jc.assignedTo.length > 4 ? `<div style="font-size:10px;color:var(--text3)">+${jc.assignedTo.length - 4}</div>` : ''}
            </div>
          </div>
          <div id="jc-detail-${jc.id}" style="display:none" onclick="event.stopPropagation()"></div>
        </div>`;
      });
    }

    el.innerHTML = html;
    if (jcDetailId) {
      const el2 = document.getElementById('jc-detail-' + jcDetailId);
      if (el2) {
        el2.style.display = 'block';
        renderJCDetail(jcDetailId, _allJobCards.find(c => c.id === jcDetailId));
      }
    }

  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load job cards</div>';
  }
}

function setJCFilter(f) {
  jcFilter = f;
  jcDetailId = null;
  render_job_cards();
}

function toggleJCDetail(id) {
  if (jcDetailId === id) {
    jcDetailId = null;
    const el = document.getElementById('jc-detail-' + id);
    if (el) el.style.display = 'none';
    return;
  }
  if (jcDetailId) {
    const prev = document.getElementById('jc-detail-' + jcDetailId);
    if (prev) prev.style.display = 'none';
  }
  jcDetailId = id;
  const el = document.getElementById('jc-detail-' + id);
  if (el) {
    el.style.display = 'block';
    renderJCDetail(id, _allJobCards.find(c => c.id === id));
  }
}

function renderJCDetail(id, jc) {
  if (!jc) return;
  const el = document.getElementById('jc-detail-' + id);
  if (!el) return;
  const role = getUser().role;
  const tasks = jc.tasks || [];
  const notes = jc.notes || [];
  const parts = jc.parts || [];

  let html = '<div class="task-detail">';

  // Meta info
  if (jc.description) {
    html += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${escHtml(jc.description)}</div>`;
  }
  html += `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;color:var(--text3)">
    ${jc.clientContact ? `<span><i class="ti ti-phone" style="font-size:10px"></i> ${escHtml(jc.clientContact)}</span>` : ''}
    ${jc.site ? `<span><i class="ti ti-map-pin" style="font-size:10px"></i> ${escHtml(jc.site)}</span>` : ''}
    <span>Created ${formatDate(jc.createdAt)}</span>
    ${jc.completionSignOff ? `<span style="color:#3fb950"><i class="ti ti-circle-check" style="font-size:10px"></i> Signed off ${formatDate(jc.completionSignOff.at)}</span>` : ''}
  </div>`;

  // Status change (manager only)
  if (role === 'manager') {
    html += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <span class="flbl" style="margin:0;padding-top:2px">Status:</span>
      ${['open', 'in_progress', 'on_hold', 'completed'].map(s =>
        `<button class="btn bsm ${jc.status === s ? '' : 'bo'}" onclick="updateJCStatus('${id}','${s}')">${s.replace('_', ' ')}</button>`
      ).join('')}
    </div>`;
  }

  // Assigned team
  html += `<div class="fl" style="margin-bottom:6px">Assigned Team</div>
  <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
    ${(jc.assignedTo || []).map(uid => `<div style="display:flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:3px 8px;font-size:11px">
      <div style="width:18px;height:18px;border-radius:50%;background:var(--brand);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff">${initials(getUserName(uid))}</div>
      ${escHtml(getUserName(uid))}
    </div>`).join('')}
    ${role === 'manager' ? `<select id="jcAssignAdd-${id}" style="font-size:11px;padding:3px 6px" onchange="addJCAssignee('${id}', this.value)">
      <option value="">+ Assign</option>
      ${appUsers.filter(u => u.active && !(jc.assignedTo || []).includes(u.id)).map(u => `<option value="${u.id}">${escHtml(u.displayName)}</option>`).join('')}
    </select>` : ''}
  </div>`;

  // Tasks
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div class="fl" style="margin:0">Tasks</div>
    ${role === 'manager' ? `<button class="btn bsm bo" onclick="showAddJCTask('${id}')"><i class="ti ti-plus" style="font-size:11px"></i> Add Task</button>` : ''}
  </div>`;
  html += `<div id="jcTaskForm-${id}" style="display:none;margin-bottom:8px"></div>`;

  if (tasks.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">No tasks added yet</div>';
  } else {
    html += '<div style="margin-bottom:12px">';
    tasks.forEach(t => {
      const canUpdate = role === 'manager' || t.assignedTo === getUser().sub;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text);${t.status === 'done' ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escHtml(t.title)}</div>
          <div style="font-size:10px;color:var(--text3)">${escHtml(getUserName(t.assignedTo))}</div>
        </div>
        ${canUpdate ? `<select style="font-size:10px;padding:2px 4px" onchange="updateJCTaskStatus('${id}','${t.id}',this.value)">
          ${['pending','in_progress','done'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}
        </select>` : `<span class="bdg b-${t.status}">${t.status.replace('_',' ')}</span>`}
        ${role === 'manager' ? `<button class="btn bsm bdng bo" style="padding:2px 6px" onclick="deleteJCTask('${id}','${t.id}')"><i class="ti ti-trash" style="font-size:10px"></i></button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  // Parts / materials
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div class="fl" style="margin:0">Parts & Materials</div>
    ${role === 'manager' ? `<button class="btn bsm bo" onclick="showAddJCPart('${id}')"><i class="ti ti-plus" style="font-size:11px"></i> Add</button>` : ''}
  </div>`;
  html += `<div id="jcPartForm-${id}" style="display:none;margin-bottom:8px"></div>`;
  if (parts.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">No parts logged</div>';
  } else {
    html += '<div style="margin-bottom:12px">';
    parts.forEach((p, idx) => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
        <div style="flex:1"><span style="color:var(--text)">${escHtml(p.name)}</span>${p.qty ? `<span style="color:var(--text3)"> × ${escHtml(p.qty)}</span>` : ''}${p.note ? `<span style="color:var(--text3)"> — ${escHtml(p.note)}</span>` : ''}</div>
        ${role === 'manager' ? `<button class="btn bsm bdng bo" style="padding:2px 6px" onclick="deleteJCPart('${id}',${idx})"><i class="ti ti-trash" style="font-size:10px"></i></button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  // Notes timeline
  html += '<div class="fl">Progress Notes</div>';
  if (notes.length > 0) {
    notes.slice().reverse().forEach(n => {
      html += `<div class="note-item">
        <div class="note-meta">${escHtml(n.authorName || getUserName(n.author))} · ${timeAgo(n.timestamp)}</div>
        <div class="note-text">${escHtml(n.text)}</div>
      </div>`;
    });
  } else {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">No notes yet</div>';
  }
  html += `<div class="note-form">
    <textarea id="jcNote-${id}" placeholder="Add a progress note..."></textarea>
    <button class="btn bsm" onclick="addJCNote('${id}')">Add</button>
  </div>`;

  // Manager actions
  if (role === 'manager') {
    html += `<div style="display:flex;gap:6px;margin-top:14px;border-top:1px solid var(--border);padding-top:10px;flex-wrap:wrap">
      ${jc.status === 'completed' && !jc.completionSignOff ? `<button class="btn bsm" style="background:var(--green)" onclick="signOffJC('${id}')"><i class="ti ti-circle-check" style="font-size:12px"></i> Sign Off</button>` : ''}
      <button class="btn bsm bdng bo" onclick="deleteJC('${id}')"><i class="ti ti-trash" style="font-size:12px"></i> Delete</button>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

// ─── FILTERS & HELPERS ─────────────────────────────────────────────────────────
function jcStatusBadge(status) {
  const map = { open: 'b-pending', in_progress: 'b-in_progress', on_hold: 'b-medium', completed: 'b-done' };
  return `<span class="bdg ${map[status] || 'b-pending'}">${(status || '').replace('_', ' ')}</span>`;
}

// ─── CREATE JOB CARD ───────────────────────────────────────────────────────────
function showCreateJobCard() {
  const el = document.getElementById('createJCForm');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="ctitle">New Job Card</div>
    <div class="flbl">Job Title *</div>
    <input type="text" id="jcNewTitle" placeholder="e.g. Control Panel Installation – Site A" style="width:100%">
    <div class="flbl">Description</div>
    <textarea id="jcNewDesc" placeholder="Scope of work, site conditions, special requirements..." style="width:100%"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <div style="flex:1">
        <div class="flbl">Client Name *</div>
        <input type="text" id="jcNewClient" placeholder="Company or person name" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Client Contact</div>
        <input type="text" id="jcNewContact" placeholder="Phone / email" style="width:100%">
      </div>
    </div>
    <div class="flbl">Site / Location</div>
    <input type="text" id="jcNewSite" placeholder="Where will the work be done?" style="width:100%">
    <div class="flbl">Assign Team Members</div>
    <div id="jcNewAssignList" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
      ${appUsers.filter(u => u.active).map(u => `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${u.id}" name="jcAssign"> ${escHtml(u.displayName)}
      </label>`).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-top:14px">
      <button class="btn" onclick="submitCreateJobCard()">Create Job Card</button>
      <button class="btn bo" onclick="document.getElementById('createJCForm').style.display='none'">Cancel</button>
    </div>
  </div>`;
}

async function submitCreateJobCard() {
  const title = document.getElementById('jcNewTitle').value.trim();
  const clientName = document.getElementById('jcNewClient').value.trim();
  if (!title) { ntf('Job title is required'); return; }
  if (!clientName) { ntf('Client name is required'); return; }

  const checked = [...document.querySelectorAll('input[name="jcAssign"]:checked')].map(i => i.value);

  const payload = {
    title,
    description: document.getElementById('jcNewDesc').value.trim(),
    clientName,
    clientContact: document.getElementById('jcNewContact').value.trim(),
    site: document.getElementById('jcNewSite').value.trim(),
    assignedTo: checked
  };

  const data = await apiPost('/job-cards', payload);
  if (data && data.jobCard) {
    ntf('Job card created — ' + data.jobCard.jobNumber);
    document.getElementById('createJCForm').style.display = 'none';
    render_job_cards();
  } else {
    ntf((data && data.error) || 'Failed to create job card');
  }
}

// ─── STATUS UPDATE ─────────────────────────────────────────────────────────────
async function updateJCStatus(id, status) {
  const data = await apiPut('/job-cards/' + id, { status });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Status updated');
  render_job_cards();
}

// ─── ASSIGN TEAM MEMBER ────────────────────────────────────────────────────────
async function addJCAssignee(jcId, userId) {
  if (!userId) return;
  const jc = _allJobCards.find(c => c.id === jcId);
  if (!jc) return;
  const current = jc.assignedTo || [];
  if (current.includes(userId)) return;
  const data = await apiPut('/job-cards/' + jcId, { assignedTo: [...current, userId] });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Team member added');
  render_job_cards();
}

// ─── TASKS ─────────────────────────────────────────────────────────────────────
function showAddJCTask(jcId) {
  const el = document.getElementById('jcTaskForm-' + jcId);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="display:flex;gap:6px;align-items:flex-start;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px">
    <input type="text" id="jcTaskTitle-${jcId}" placeholder="Task description" style="flex:1">
    <select id="jcTaskAssign-${jcId}" style="width:130px">
      <option value="">Assign to...</option>
      ${((_allJobCards.find(c => c.id === jcId) || {}).assignedTo || []).map(uid => `<option value="${uid}">${escHtml(getUserName(uid))}</option>`).join('')}
      ${appUsers.filter(u => u.active && !((_allJobCards.find(c => c.id === jcId) || {}).assignedTo || []).includes(u.id)).map(u => `<option value="${u.id}">${escHtml(u.displayName)}</option>`).join('')}
    </select>
    <button class="btn bsm" onclick="submitAddJCTask('${jcId}')">Add</button>
    <button class="btn bsm bo" onclick="document.getElementById('jcTaskForm-${jcId}').style.display='none'">✕</button>
  </div>`;
}

async function submitAddJCTask(jcId) {
  const title = document.getElementById('jcTaskTitle-' + jcId).value.trim();
  const assignedTo = document.getElementById('jcTaskAssign-' + jcId).value;
  if (!title) { ntf('Task description is required'); return; }
  const data = await apiPut('/job-cards/' + jcId, { addTask: { title, assignedTo } });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Task added');
  render_job_cards();
}

async function updateJCTaskStatus(jcId, taskId, status) {
  const data = await apiPut('/job-cards/' + jcId, { updateTask: { taskId, status } });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Task updated');
  render_job_cards();
}

async function deleteJCTask(jcId, taskId) {
  const data = await apiPut('/job-cards/' + jcId, { deleteTask: taskId });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Task removed');
  render_job_cards();
}

// ─── PARTS ─────────────────────────────────────────────────────────────────────
function showAddJCPart(jcId) {
  const el = document.getElementById('jcPartForm-' + jcId);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="display:flex;gap:6px;align-items:flex-start;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px">
    <input type="text" id="jcPartName-${jcId}" placeholder="Part / material name" style="flex:2">
    <input type="text" id="jcPartQty-${jcId}" placeholder="Qty" style="width:60px">
    <input type="text" id="jcPartNote-${jcId}" placeholder="Note (optional)" style="flex:1">
    <button class="btn bsm" onclick="submitAddJCPart('${jcId}')">Add</button>
    <button class="btn bsm bo" onclick="document.getElementById('jcPartForm-${jcId}').style.display='none'">✕</button>
  </div>`;
}

async function submitAddJCPart(jcId) {
  const name = document.getElementById('jcPartName-' + jcId).value.trim();
  if (!name) { ntf('Part name is required'); return; }
  const data = await apiPut('/job-cards/' + jcId, {
    addPart: {
      name,
      qty: document.getElementById('jcPartQty-' + jcId).value.trim(),
      note: document.getElementById('jcPartNote-' + jcId).value.trim()
    }
  });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Part added');
  render_job_cards();
}

async function deleteJCPart(jcId, idx) {
  const data = await apiPut('/job-cards/' + jcId, { deletePart: idx });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Part removed');
  render_job_cards();
}

// ─── NOTES ─────────────────────────────────────────────────────────────────────
async function addJCNote(jcId) {
  const textarea = document.getElementById('jcNote-' + jcId);
  const text = textarea.value.trim();
  if (!text) return;
  const data = await apiPut('/job-cards/' + jcId, { addNote: text });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Note added');
  render_job_cards();
}

// ─── SIGN OFF ──────────────────────────────────────────────────────────────────
async function signOffJC(jcId) {
  if (!confirm('Sign off this job card as completed? This confirms all work is done.')) return;
  const data = await apiPut('/job-cards/' + jcId, { signOff: true });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Job card signed off');
  render_job_cards();
}

// ─── DELETE ────────────────────────────────────────────────────────────────────
async function deleteJC(jcId) {
  const jc = _allJobCards.find(c => c.id === jcId);
  if (!confirm('Delete job card "' + (jc ? jc.jobNumber + ' – ' + jc.title : jcId) + '"? This cannot be undone.')) return;
  const data = await apiDelete('/job-cards/' + jcId);
  if (data && data.error) { ntf(data.error); return; }
  jcDetailId = null;
  ntf('Job card deleted');
  render_job_cards();
}
