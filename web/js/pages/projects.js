// â”€â”€â”€ PROJECTS PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let projFilter = 'all';
let projDetailId = null;
let _allProjects = [];

async function render_projects() {
  const el = document.getElementById('page-projects');
  const role = getUser().role;

  el.innerHTML = '<div class="spin"></div> Loading projects...';

  try {
    const data = await apiGet('/projects');
    const projects = (data && data.projects) || [];
    _allProjects = projects;

    let html = '';

    // Filter tabs
    html += `<div class="wtabs">
      <div class="wtab ${projFilter === 'all' ? 'active' : ''}" onclick="setProjFilter('all')">All</div>
      <div class="wtab ${projFilter === 'planning' ? 'active' : ''}" onclick="setProjFilter('planning')">Planning</div>
      <div class="wtab ${projFilter === 'active' ? 'active' : ''}" onclick="setProjFilter('active')">Active</div>
      <div class="wtab ${projFilter === 'on_hold' ? 'active' : ''}" onclick="setProjFilter('on_hold')">On Hold</div>
      <div class="wtab ${projFilter === 'completed' ? 'active' : ''}" onclick="setProjFilter('completed')">Completed</div>
    </div>`;

    if (isManager()) {
      html += `<div style="margin-bottom:14px">
        <button class="btn" onclick="showCreateProject()"><i class="ti ti-plus" style="font-size:13px"></i> New Project</button>
      </div>
      <div id="createProjForm" style="display:none"></div>`;
    }

    const filtered = projFilter === 'all' ? projects : projects.filter(p => p.status === projFilter);

    if (filtered.length === 0) {
      html += '<div class="empty-state"><i class="ti ti-layout-kanban"></i>No projects found</div>';
    } else {
      filtered.forEach(proj => {
        const phases = proj.phases || [];
        const donePhases = phases.filter(p => p.status === 'done').length;
        const phaseProgress = phases.length > 0 ? Math.round((donePhases / phases.length) * 100) : null;
        const assigned = (proj.assignedTo || []).slice(0, 4);
        const jobCards = proj.linkedJobCards || [];

        html += `<div class="card" style="margin-bottom:8px;cursor:pointer" onclick="toggleProjDetail('${proj.id}')">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
                ${projStatusBadge(proj.status)}
                ${proj.targetDate ? `<span style="font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)">Target: ${formatDate(proj.targetDate)}</span>` : ''}
              </div>
              <div style="font-size:13px;font-weight:500;color:var(--text)">${escHtml(proj.name)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px">
                <i class="ti ti-building" style="font-size:10px"></i> ${escHtml(proj.clientName || 'â€”')}
                ${phases.length > 0 ? ` &nbsp;Â·&nbsp; ${donePhases}/${phases.length} phases` : ''}
                ${jobCards.length > 0 ? ` &nbsp;Â·&nbsp; <i class="ti ti-clipboard-list" style="font-size:10px"></i> ${jobCards.length} job card${jobCards.length !== 1 ? 's' : ''}` : ''}
              </div>
              ${phaseProgress !== null ? `<div style="margin-top:8px;max-width:300px">
                <div class="pt"><div class="pf pf-accent" style="width:${phaseProgress}%"></div></div>
              </div>` : ''}
            </div>
            <div style="display:flex;gap:3px;align-items:center;flex-shrink:0">
              ${assigned.map(uid => `<div title="${escHtml(getUserName(uid))}" style="width:24px;height:24px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff">${initials(getUserName(uid))}</div>`).join('')}
              ${proj.assignedTo && proj.assignedTo.length > 4 ? `<div style="font-size:10px;color:var(--text3)">+${proj.assignedTo.length - 4}</div>` : ''}
            </div>
          </div>
          <div id="proj-detail-${proj.id}" style="display:none" onclick="event.stopPropagation()"></div>
        </div>`;
      });
    }

    el.innerHTML = html;
    if (projDetailId) {
      const el2 = document.getElementById('proj-detail-' + projDetailId);
      if (el2) {
        el2.style.display = 'block';
        renderProjDetail(projDetailId, _allProjects.find(p => p.id === projDetailId));
      }
    }

  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load projects</div>';
  }
}

function setProjFilter(f) {
  projFilter = f;
  projDetailId = null;
  render_projects();
}

function toggleProjDetail(id) {
  if (projDetailId === id) {
    projDetailId = null;
    const el = document.getElementById('proj-detail-' + id);
    if (el) el.style.display = 'none';
    return;
  }
  if (projDetailId) {
    const prev = document.getElementById('proj-detail-' + projDetailId);
    if (prev) prev.style.display = 'none';
  }
  projDetailId = id;
  const el = document.getElementById('proj-detail-' + id);
  if (el) {
    el.style.display = 'block';
    renderProjDetail(id, _allProjects.find(p => p.id === id));
  }
}

function renderProjDetail(id, proj) {
  if (!proj) return;
  const el = document.getElementById('proj-detail-' + id);
  if (!el) return;
  const role = getUser().role;
  const phases = proj.phases || [];
  const notes = proj.notes || [];
  const linkedJCs = proj.linkedJobCards || [];

  let html = '<div class="task-detail">';

  // Description & dates
  if (proj.description) {
    html += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${escHtml(proj.description)}</div>`;
  }
  html += `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;color:var(--text3)">
    ${proj.startDate ? `<span><i class="ti ti-calendar-event" style="font-size:10px"></i> Started ${formatDate(proj.startDate)}</span>` : ''}
    ${proj.targetDate ? `<span><i class="ti ti-flag" style="font-size:10px"></i> Target ${formatDate(proj.targetDate)}</span>` : ''}
    <span>Created ${formatDate(proj.createdAt)}</span>
  </div>`;

  // Status change
  if (isManager()) {
    html += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <span class="flbl" style="margin:0;padding-top:2px">Status:</span>
      ${['planning', 'active', 'on_hold', 'completed'].map(s =>
        `<button class="btn bsm ${proj.status === s ? '' : 'bo'}" onclick="updateProjStatus('${id}','${s}')">${s.replace('_', ' ')}</button>`
      ).join('')}
    </div>`;
  }

  // Assigned team
  html += `<div class="fl" style="margin-bottom:6px">Project Team</div>
  <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
    ${(proj.assignedTo || []).map(uid => `<div style="display:flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:3px 8px;font-size:11px">
      <div style="width:18px;height:18px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff">${initials(getUserName(uid))}</div>
      ${escHtml(getUserName(uid))}
    </div>`).join('')}
    ${isManager() ? `<select id="projAssignAdd-${id}" style="font-size:11px;padding:3px 6px" onchange="addProjAssignee('${id}', this.value)">
      <option value="">+ Assign</option>
      ${appUsers.filter(u => u.active && !(proj.assignedTo || []).includes(u.id)).map(u => `<option value="${u.id}">${escHtml(u.displayName)}</option>`).join('')}
    </select>` : ''}
  </div>`;

  // Phases
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div class="fl" style="margin:0">Project Phases</div>
    ${isManager() ? `<button class="btn bsm bo" onclick="showAddPhase('${id}')"><i class="ti ti-plus" style="font-size:11px"></i> Add Phase</button>` : ''}
  </div>`;
  html += `<div id="projPhaseForm-${id}" style="display:none;margin-bottom:8px"></div>`;

  if (phases.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">No phases defined yet</div>';
  } else {
    html += '<div style="margin-bottom:12px">';
    phases.forEach((ph, idx) => {
      const icon = ph.status === 'done' ? 'ti-circle-check' : ph.status === 'in_progress' ? 'ti-circle-half-2' : 'ti-circle';
      const col = ph.status === 'done' ? '#3fb950' : ph.status === 'in_progress' ? 'var(--brand-mid)' : 'var(--text3)';
      html += `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <i class="ti ${icon}" style="font-size:16px;color:${col};flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text);${ph.status === 'done' ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escHtml(ph.name)}</div>
          ${ph.dueDate ? `<div style="font-size:10px;color:var(--text3)">Due ${formatDate(ph.dueDate)}</div>` : ''}
        </div>
        ${isManager() || (proj.assignedTo || []).includes(getUser().sub) ? `<select style="font-size:10px;padding:2px 4px" onchange="updatePhaseStatus('${id}',${idx},this.value)">
          ${['pending','in_progress','done'].map(s => `<option value="${s}" ${ph.status === s ? 'selected' : ''}>${s.replace('_',' ')}</option>`).join('')}
        </select>` : `<span class="bdg b-${ph.status}">${ph.status.replace('_',' ')}</span>`}
        ${isManager() ? `<button class="btn bsm bdng bo" style="padding:2px 6px" onclick="deletePhase('${id}',${idx})"><i class="ti ti-trash" style="font-size:10px"></i></button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  // Linked Job Cards
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div class="fl" style="margin:0">Linked Job Cards</div>
    ${isManager() && _allJobCards.length > 0 ? `<select id="projLinkJC-${id}" style="font-size:11px;padding:3px 6px" onchange="linkJobCardToProject('${id}', this.value)">
      <option value="">+ Link Job Card</option>
      ${_allJobCards.filter(jc => !linkedJCs.includes(jc.id)).map(jc => `<option value="${jc.id}">${escHtml(jc.jobNumber)} â€“ ${escHtml(jc.title)}</option>`).join('')}
    </select>` : ''}
  </div>`;

  if (linkedJCs.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">No job cards linked</div>';
  } else {
    html += '<div style="margin-bottom:12px">';
    linkedJCs.forEach(jcId => {
      const jc = _allJobCards.find(c => c.id === jcId);
      if (!jc) return;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <i class="ti ti-clipboard-list" style="font-size:14px;color:var(--text3);flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text)">${escHtml(jc.jobNumber)} â€“ ${escHtml(jc.title)}</div>
          <div style="font-size:10px;color:var(--text3)">${escHtml(jc.clientName)} ${jcStatusBadge(jc.status)}</div>
        </div>
        ${isManager() ? `<button class="btn bsm bo" style="padding:2px 6px" onclick="unlinkJCFromProject('${id}','${jcId}')"><i class="ti ti-unlink" style="font-size:10px"></i></button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  // Notes
  html += '<div class="fl">Notes</div>';
  if (notes.length > 0) {
    notes.slice().reverse().forEach(n => {
      html += `<div class="note-item">
        <div class="note-meta">${escHtml(n.authorName || getUserName(n.author))} Â· ${timeAgo(n.timestamp)}</div>
        <div class="note-text">${escHtml(n.text)}</div>
      </div>`;
    });
  } else {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">No notes yet</div>';
  }
  html += `<div class="note-form">
    <textarea id="projNote-${id}" placeholder="Add a project note..."></textarea>
    <button class="btn bsm" onclick="addProjNote('${id}')">Add</button>
  </div>`;

  // Manager delete
  if (isManager()) {
    html += `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
      <button class="btn bsm bdng bo" onclick="deleteProject('${id}')"><i class="ti ti-trash" style="font-size:12px"></i> Delete Project</button>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
}

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function projStatusBadge(status) {
  const map = { planning: 'b-low', active: 'b-in_progress', on_hold: 'b-medium', completed: 'b-done' };
  return `<span class="bdg ${map[status] || 'b-low'}">${(status || '').replace('_', ' ')}</span>`;
}

// â”€â”€â”€ CREATE PROJECT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showCreateProject() {
  const el = document.getElementById('createProjForm');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const today = new Date().toISOString().split('T')[0];
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="ctitle">New Project</div>
    <div class="flbl">Project Name *</div>
    <input type="text" id="projNewName" placeholder="e.g. Automated Irrigation System â€“ Farm X" style="width:100%">
    <div class="flbl">Description</div>
    <textarea id="projNewDesc" placeholder="Project scope, objectives, deliverables..." style="width:100%"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <div style="flex:1">
        <div class="flbl">Client Name *</div>
        <input type="text" id="projNewClient" placeholder="Company or person" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Initial Status</div>
        <select id="projNewStatus" style="width:100%">
          <option value="planning">Planning</option>
          <option value="active">Active</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <div style="flex:1">
        <div class="flbl">Start Date</div>
        <input type="date" id="projNewStart" value="${today}" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Target Completion</div>
        <input type="date" id="projNewTarget" style="width:100%">
      </div>
    </div>
    <div class="flbl">Assign Team Members</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
      ${appUsers.filter(u => u.active).map(u => `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${u.id}" name="projAssign"> ${escHtml(u.displayName)}
      </label>`).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-top:14px">
      <button class="btn" onclick="submitCreateProject()">Create Project</button>
      <button class="btn bo" onclick="document.getElementById('createProjForm').style.display='none'">Cancel</button>
    </div>
  </div>`;
}

async function submitCreateProject() {
  const name = document.getElementById('projNewName').value.trim();
  const clientName = document.getElementById('projNewClient').value.trim();
  if (!name) { ntf('Project name is required'); return; }
  if (!clientName) { ntf('Client name is required'); return; }

  const checked = [...document.querySelectorAll('input[name="projAssign"]:checked')].map(i => i.value);

  const payload = {
    name,
    description: document.getElementById('projNewDesc').value.trim(),
    clientName,
    status: document.getElementById('projNewStatus').value,
    startDate: document.getElementById('projNewStart').value || null,
    targetDate: document.getElementById('projNewTarget').value || null,
    assignedTo: checked
  };

  const data = await apiPost('/projects', payload);
  if (data && data.project) {
    ntf('Project created');
    document.getElementById('createProjForm').style.display = 'none';
    render_projects();
  } else {
    ntf((data && data.error) || 'Failed to create project');
  }
}

// â”€â”€â”€ STATUS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function updateProjStatus(id, status) {
  const data = await apiPut('/projects/' + id, { status });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Status updated');
  render_projects();
}

// â”€â”€â”€ TEAM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function addProjAssignee(projId, userId) {
  if (!userId) return;
  const proj = _allProjects.find(p => p.id === projId);
  if (!proj) return;
  const current = proj.assignedTo || [];
  if (current.includes(userId)) return;
  const data = await apiPut('/projects/' + projId, { assignedTo: [...current, userId] });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Team member added');
  render_projects();
}

// â”€â”€â”€ PHASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showAddPhase(projId) {
  const el = document.getElementById('projPhaseForm-' + projId);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="display:flex;gap:6px;align-items:flex-start;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px">
    <input type="text" id="phName-${projId}" placeholder="Phase name (e.g. Site Survey, Installation, Testing)" style="flex:2">
    <input type="date" id="phDue-${projId}" placeholder="Due date" style="flex:1">
    <button class="btn bsm" onclick="submitAddPhase('${projId}')">Add</button>
    <button class="btn bsm bo" onclick="document.getElementById('projPhaseForm-${projId}').style.display='none'">âœ•</button>
  </div>`;
}

async function submitAddPhase(projId) {
  const name = document.getElementById('phName-' + projId).value.trim();
  if (!name) { ntf('Phase name is required'); return; }
  const data = await apiPut('/projects/' + projId, {
    addPhase: { name, dueDate: document.getElementById('phDue-' + projId).value || null }
  });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Phase added');
  render_projects();
}

async function updatePhaseStatus(projId, phaseIdx, status) {
  const data = await apiPut('/projects/' + projId, { updatePhase: { index: phaseIdx, status } });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Phase updated');
  render_projects();
}

async function deletePhase(projId, phaseIdx) {
  const data = await apiPut('/projects/' + projId, { deletePhase: phaseIdx });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Phase removed');
  render_projects();
}

// â”€â”€â”€ JOB CARD LINKING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function linkJobCardToProject(projId, jcId) {
  if (!jcId) return;
  const proj = _allProjects.find(p => p.id === projId);
  if (!proj) return;
  const current = proj.linkedJobCards || [];
  if (current.includes(jcId)) return;
  const data = await apiPut('/projects/' + projId, { linkedJobCards: [...current, jcId] });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Job card linked');
  render_projects();
}

async function unlinkJCFromProject(projId, jcId) {
  const proj = _allProjects.find(p => p.id === projId);
  if (!proj) return;
  const updated = (proj.linkedJobCards || []).filter(id => id !== jcId);
  const data = await apiPut('/projects/' + projId, { linkedJobCards: updated });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Job card unlinked');
  render_projects();
}

// â”€â”€â”€ NOTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function addProjNote(projId) {
  const textarea = document.getElementById('projNote-' + projId);
  const text = textarea.value.trim();
  if (!text) return;
  const data = await apiPut('/projects/' + projId, { addNote: text });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Note added');
  render_projects();
}

// â”€â”€â”€ DELETE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function deleteProject(projId) {
  const proj = _allProjects.find(p => p.id === projId);
  if (!confirm('Delete project "' + (proj ? proj.name : projId) + '"? This cannot be undone.')) return;
  const data = await apiDelete('/projects/' + projId);
  if (data && data.error) { ntf(data.error); return; }
  projDetailId = null;
  ntf('Project deleted');
  render_projects();
}
