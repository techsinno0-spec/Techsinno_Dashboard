let tasksFilter = 'all';
let tasksDetailId = null;
let _completionTask = null;
let _allTasks = [];
let weeklyPlanWeek = 0;
let teamTasksTab = 'tasks';

const WEB_WEEK_DEFAULTS = [
  { l: 'Week 1', t: [{ x: 'Open business bank account', g: 'admin', s: 'eve', d: false }, { x: 'Register on SARS eFiling', g: 'admin', s: 'eve', d: false }, { x: 'Update CIPC customer profile', g: 'admin', s: 'eve', d: false }] },
  { l: 'Week 2', t: [{ x: 'Audit tools vs needs', g: 'repair', s: 'wknd', d: false }, { x: 'Order missing test equipment', g: 'repair', s: 'wknd', d: false }, { x: 'Set up workshop space', g: 'repair', s: 'wknd', d: false }] },
  { l: 'Week 3', t: [{ x: 'Create LinkedIn company page', g: 'admin', s: 'eve', d: false }, { x: 'Build Linktree/Carrd website', g: 'admin', s: 'eve', d: false }, { x: 'Design service one-pager PDF', g: 'admin', s: 'eve', d: false }, { x: 'Send 5 LinkedIn connections', g: 'auto', s: 'eve', d: false }] },
  { l: 'Week 4', t: [{ x: 'List 20 target businesses', g: 'repair', s: 'eve', d: false }, { x: 'Send 10 cold outreach emails', g: 'repair', s: 'eve', d: false }, { x: 'Follow up LinkedIn connections', g: 'admin', s: 'eve', d: false }, { x: 'Publish brand story post', g: 'admin', s: 'eve', d: false }] },
  { l: 'Week 5-6', t: [{ x: 'Complete first repair job', g: 'repair', s: 'wknd', d: false }, { x: 'Write and publish case study', g: 'repair', s: 'eve', d: false }, { x: 'Ask client for referral', g: 'repair', s: 'eve', d: false }] },
  { l: 'Week 7-8', t: [{ x: 'Identify 15 automation targets', g: 'auto', s: 'eve', d: false }, { x: 'Send free audit offer on LinkedIn', g: 'auto', s: 'eve', d: false }, { x: 'Set up Google Business Profile', g: 'admin', s: 'eve', d: false }] },
  { l: 'Week 9-10', t: [{ x: 'Draft retainer proposal', g: 'auto', s: 'eve', d: false }, { x: 'Present retainer to best client', g: 'auto', s: 'wknd', d: false }, { x: 'Scope and price IoT pilot', g: 'iot', s: 'eve', d: false }] },
  { l: 'Week 11-12', t: [{ x: 'IoT pilot site visit', g: 'iot', s: 'wknd', d: false }, { x: 'Review 90-day revenue vs targets', g: 'admin', s: 'eve', d: false }, { x: 'Write Q2 plan', g: 'admin', s: 'eve', d: false }] }
];

async function render_tasks() {
  const el = document.getElementById('page-tasks');
  const role = getUser().role;
  if (isManager() && window._taskView !== 'team') {
    return renderWeeklyPlan();
  }

  el.innerHTML = '<div class="spin"></div> Loading tasks...';

  try {
    if (isManager() && window._taskView === 'team' && teamTasksTab === 'recurring') {
      return renderRecurringTasks(el);
    }

    const data = await apiGet('/tasks');
    const tasks = (data && data.tasks) || [];
    _allTasks = tasks;

    let html = '';

    if (isManager() && window._taskView === 'team') {
      html += `<div class="wtabs" style="margin-bottom:10px">
        <div class="wtab ${teamTasksTab === 'tasks' ? 'active' : ''}" onclick="teamTasksTab='tasks';render_tasks()">Individual tasks</div>
        <div class="wtab ${teamTasksTab === 'recurring' ? 'active' : ''}" onclick="teamTasksTab='recurring';render_tasks()">Recurring tasks</div>
      </div>`;
    }

    // Filter tabs
    html += `<div class="wtabs">
      <div class="wtab ${tasksFilter === 'all' ? 'active' : ''}" onclick="setTasksFilter('all')">All</div>
      <div class="wtab ${tasksFilter === 'pending' ? 'active' : ''}" onclick="setTasksFilter('pending')">Pending</div>
      <div class="wtab ${tasksFilter === 'in_progress' ? 'active' : ''}" onclick="setTasksFilter('in_progress')">In Progress</div>
      <div class="wtab ${tasksFilter === 'done' ? 'active' : ''}" onclick="setTasksFilter('done')">Done</div>
      <div class="wtab ${tasksFilter === 'blocked' ? 'active' : ''}" onclick="setTasksFilter('blocked')">Blocked</div>
    </div>`;

    // Create task button (manager only)
    if (isManager()) {
      html += `<div style="margin-bottom:14px">
        <button class="btn" onclick="showCreateTask()"><i class="ti ti-plus" style="font-size:13px"></i> Assign New Task</button>
      </div>`;
      html += `<div id="createTaskForm" style="display:none"></div>`;
    }

    // Task list
    const filtered = tasksFilter === 'all' ? tasks : tasks.filter(t => t.status === tasksFilter);

    if (filtered.length === 0) {
      html += '<div class="empty-state"><i class="ti ti-checklist"></i>No tasks found</div>';
    } else {
      html += '<div id="tasksList">';
      filtered.forEach(t => {
        const isOverdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date();
        html += `<div class="card" style="margin-bottom:8px;cursor:pointer;${isOverdue ? 'border-color:rgba(248,81,73,.3)' : ''}" onclick="toggleTaskDetail('${t.id}')">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:var(--text);${t.status === 'done' ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escHtml(t.title)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px">
                ${isManager() ? '<i class="ti ti-user" style="font-size:11px"></i> ' + escHtml(getUserName(t.assignedTo)) + ' Â· ' : ''}${t.deadline ? (isOverdue ? '<span style="color:#f85149">Overdue</span> Â· ' : '') + 'Due ' + formatDate(t.deadline) : 'No deadline'}
                ${t.notes && t.notes.length > 0 ? ' Â· <i class="ti ti-message" style="font-size:10px"></i> ' + t.notes.length : ''}
              </div>
            </div>
            <div style="display:flex;gap:5px;align-items:center">
              ${priorityBadge(t.priority)} ${statusBadge(t.status)} ${categoryTag(t.category)}
            </div>
          </div>
          <div id="detail-${t.id}" style="display:${tasksDetailId === t.id ? 'block' : 'none'}"></div>
        </div>`;
      });
      html += '</div>';
    }

    el.innerHTML = html;

    if (tasksDetailId) renderTaskDetail(tasksDetailId, tasks.find(t => t.id === tasksDetailId));
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load tasks</div>';
  }
}

async function getWeeklySyncState() {
  const state = await syncLoad();
  const data = (state && state.data) || {};
  if (!Array.isArray(data.tasks) || !data.tasks.length) data.tasks = WEB_WEEK_DEFAULTS.map(w => ({ ...w, t: w.t.map(t => ({ ...t })) }));
  if (!Array.isArray(data.goals)) data.goals = [];
  if (!Array.isArray(data.posts)) data.posts = [];
  return data;
}

async function saveWeeklySyncState(data) {
  await syncSave({
    tasks: data.tasks || [],
    goals: data.goals || [],
    posts: data.posts || []
  });
}

async function renderWeeklyPlan() {
  const el = document.getElementById('page-tasks');
  el.innerHTML = '<div class="spin"></div> Loading weekly plan...';
  try {
    const data = await getWeeklySyncState();
    const weeks = data.tasks;
    const week = weeks[weeklyPlanWeek] || weeks[0];
    let html = `<div class="wtabs">
      ${weeks.map((w, i) => `<button class="wtab ${i === weeklyPlanWeek ? 'active' : ''}" onclick="weeklyPlanWeek=${i};render_tasks()">${escHtml(w.l || ('Week ' + (i + 1)))}</button>`).join('')}
    </div>
    <div class="card">
      ${(week.t || []).map((t, i) => `<div class="tr">
        <input type="checkbox" ${t.d ? 'checked' : ''} onchange="toggleWeeklyTask(${weeklyPlanWeek},${i})">
        <div style="flex:1;font-size:12px;color:var(--text);${t.d ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escHtml(t.x || '')}</div>
        <span class="tag ${t.g === 'repair' ? 't-r' : t.g === 'auto' ? 't-a' : t.g === 'iot' ? 't-i' : 't-ad'}">${escHtml(t.g || 'admin')}</span>
        <span class="tag t-g">${t.s === 'wknd' ? 'Wknd' : 'Eve'}</span>
        <button class="btn bsm bo" onclick="removeWeeklyTask(${weeklyPlanWeek},${i})">Ã—</button>
      </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input id="weeklyTaskText" placeholder="Add a task..." style="flex:1">
        <select id="weeklyTaskCat"><option value="admin">Admin</option><option value="repair">Repair</option><option value="auto">Automation</option><option value="iot">IoT</option></select>
        <select id="weeklyTaskSlot"><option value="eve">Evening</option><option value="wknd">Weekend</option></select>
        <button class="btn bsm" onclick="addWeeklyTask()">+ Add</button>
      </div>
    </div>`;
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load weekly sync plan</div>';
  }
}

async function toggleWeeklyTask(weekIdx, taskIdx) {
  const data = await getWeeklySyncState();
  data.tasks[weekIdx].t[taskIdx].d = !data.tasks[weekIdx].t[taskIdx].d;
  await saveWeeklySyncState(data);
  render_tasks();
}

async function removeWeeklyTask(weekIdx, taskIdx) {
  const data = await getWeeklySyncState();
  data.tasks[weekIdx].t.splice(taskIdx, 1);
  await saveWeeklySyncState(data);
  render_tasks();
}

async function addWeeklyTask() {
  const input = document.getElementById('weeklyTaskText');
  const text = input.value.trim();
  if (!text) return;
  const data = await getWeeklySyncState();
  data.tasks[weeklyPlanWeek].t.push({
    x: text,
    g: document.getElementById('weeklyTaskCat').value,
    s: document.getElementById('weeklyTaskSlot').value,
    d: false
  });
  await saveWeeklySyncState(data);
  input.value = '';
  render_tasks();
}

async function renderRecurringTasks(el) {
  let html = `<div class="wtabs" style="margin-bottom:10px">
    <div class="wtab" onclick="teamTasksTab='tasks';render_tasks()">Individual tasks</div>
    <div class="wtab active" onclick="teamTasksTab='recurring';render_tasks()">Recurring tasks</div>
  </div>
  <div style="margin-bottom:14px">
    <button class="btn" onclick="showRecurringTaskForm()"><i class="ti ti-plus" style="font-size:13px"></i> New Recurring Task</button>
  </div>
  <div id="recurringTaskForm" style="display:none"></div>`;

  try {
    const data = await apiGet('/tasks/recurring');
    const rules = (data && data.rules) || [];
    if (!rules.length) {
      html += '<div class="empty-state"><i class="ti ti-repeat"></i>No recurring task rules yet</div>';
    } else {
      html += rules.map(r => {
        const schedule = r.frequency === 'weekly'
          ? `Weekly Â· day ${r.dayOfWeek}`
          : r.frequency === 'monthly'
            ? `Monthly Â· day ${r.dayOfMonth}`
            : 'Daily';
        return `<div class="card" style="margin-bottom:8px;opacity:${r.active === false ? '.55' : '1'}">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:var(--text)">${escHtml(r.title)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px">
                <i class="ti ti-repeat" style="font-size:10px"></i> ${escHtml(schedule)}
                Â· ${escHtml(getUserName(r.assignedTo))}
                Â· ${escHtml(r.category || 'general')}
                Â· ${escHtml(r.priority || 'medium')}
                ${r.active === false ? ' Â· paused' : ''}
              </div>
            </div>
            <button class="btn bsm bo" onclick="toggleRecurringTask('${r.id}',${r.active === false})">${r.active === false ? 'Resume' : 'Pause'}</button>
            <button class="btn bsm bdng" onclick="deleteRecurringTask('${r.id}')">Delete</button>
          </div>
        </div>`;
      }).join('');
    }
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load recurring tasks</div>';
  }
}

function showRecurringTaskForm() {
  const el = document.getElementById('recurringTaskForm');
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="ctitle">Create Recurring Task</div>
    <div class="flbl">Title *</div>
    <input id="recTaskTitle" style="width:100%" placeholder="Task title">
    <div class="flbl">Person in charge *</div>
    <select id="recTaskAssign" style="width:100%">
      <option value="">Select person</option>
      ${appUsers.filter(u => u.active).map(u => `<option value="${u.id}">${escHtml(u.displayName)}</option>`).join('')}
    </select>
    <div style="display:flex;gap:8px;margin-top:8px">
      <div style="flex:1"><div class="flbl">Frequency</div><select id="recTaskFreq" style="width:100%" onchange="document.getElementById('recWeeklyRow').style.display=this.value==='weekly'?'block':'none';document.getElementById('recMonthlyRow').style.display=this.value==='monthly'?'block':'none'"><option value="daily">Daily</option><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option></select></div>
      <div style="flex:1"><div class="flbl">Priority</div><select id="recTaskPriority" style="width:100%"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div>
      <div style="flex:1"><div class="flbl">Category</div><select id="recTaskCategory" style="width:100%"><option value="general">General</option><option value="admin">Admin</option><option value="repair">Repair</option><option value="auto">Automation</option><option value="iot">IoT</option></select></div>
    </div>
    <div id="recWeeklyRow"><div class="flbl">Day of week</div><select id="recTaskDay" style="width:100%"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select></div>
    <div id="recMonthlyRow" style="display:none"><div class="flbl">Day of month</div><input id="recTaskMonthDay" type="number" min="1" max="31" value="1" style="width:100%"></div>
    <div class="flbl">Description</div>
    <textarea id="recTaskDesc" style="width:100%" placeholder="Optional notes"></textarea>
    <div style="display:flex;gap:6px;margin-top:12px"><button class="btn" onclick="submitRecurringTask()">Create rule</button><button class="btn bo" onclick="document.getElementById('recurringTaskForm').style.display='none'">Cancel</button></div>
  </div>`;
}

async function submitRecurringTask() {
  const title = document.getElementById('recTaskTitle').value.trim();
  const assignedTo = document.getElementById('recTaskAssign').value;
  if (!title) return ntf('Title is required');
  if (!assignedTo) return ntf('Person in charge is required');
  const frequency = document.getElementById('recTaskFreq').value;
  const body = {
    title,
    assignedTo,
    description: document.getElementById('recTaskDesc').value.trim(),
    frequency,
    priority: document.getElementById('recTaskPriority').value,
    category: document.getElementById('recTaskCategory').value
  };
  if (frequency === 'weekly') body.dayOfWeek = document.getElementById('recTaskDay').value;
  if (frequency === 'monthly') body.dayOfMonth = document.getElementById('recTaskMonthDay').value;
  const data = await apiPost('/tasks/recurring', body);
  if (data && data.error) return ntf(data.error);
  ntf('Recurring task created');
  render_tasks();
}

async function toggleRecurringTask(id, shouldResume) {
  const data = await apiPut('/tasks/recurring/' + id, { active: !!shouldResume });
  if (data && data.error) return ntf(data.error);
  render_tasks();
}

async function deleteRecurringTask(id) {
  if (!confirm('Delete this recurring rule?')) return;
  const data = await apiDelete('/tasks/recurring/' + id);
  if (data && data.error) return ntf(data.error);
  ntf('Recurring rule deleted');
  render_tasks();
}

function setTasksFilter(f) {
  tasksFilter = f;
  tasksDetailId = null;
  render_tasks();
}

async function toggleTaskDetail(id) {
  tasksDetailId = tasksDetailId === id ? null : id;
  render_tasks();
}

function renderTaskDetail(id, task) {
  if (!task) return;
  const el = document.getElementById('detail-' + id);
  if (!el) return;

  const role = getUser().role;
  let html = '<div class="task-detail" onclick="event.stopPropagation()">';

  if (task.description) {
    html += `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${escHtml(task.description)}</div>`;
  }

  html += `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">
    Created ${formatDateTime(task.createdAt)}${task.completedAt ? ' Â· Completed ' + formatDateTime(task.completedAt) : ''}
  </div>`;

  // Status change
  html += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
    <span class="flbl" style="margin:0;padding-top:4px">Status:</span>
    ${['pending', 'in_progress', 'done', 'blocked'].map(s =>
      `<button class="btn bsm ${task.status === s ? '' : 'bo'}" onclick="event.stopPropagation();updateTaskStatus('${id}','${s}')">${s.replace('_', ' ')}</button>`
    ).join('')}
  </div>`;

  // Notes
  html += '<div class="fl">Notes</div>';
  if (task.notes && task.notes.length > 0) {
    task.notes.forEach(n => {
      html += `<div class="note-item">
        <div class="note-meta">${escHtml(n.authorName || getUserName(n.author))} Â· ${timeAgo(n.timestamp)}</div>
        <div class="note-text">${escHtml(n.text)}</div>
      </div>`;
    });
  } else {
    html += '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">No notes yet</div>';
  }

  html += `<div class="note-form">
    <textarea id="noteText-${id}" placeholder="Add a note..." style="flex:1"></textarea>
    <button class="btn bsm" onclick="event.stopPropagation();addNote('${id}')">Add</button>
  </div>`;

  // Manager: reassign / delete
  if (isManager()) {
    html += `<div style="display:flex;gap:6px;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <select id="reassign-${id}" style="flex:1">
        <option value="">Reassign to...</option>
        ${appUsers.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === task.assignedTo ? 'selected' : ''}>${escHtml(u.displayName)}</option>`).join('')}
      </select>
      <button class="btn bsm" onclick="event.stopPropagation();reassignTask('${id}')">Reassign</button>
      <button class="btn bsm bdng" onclick="event.stopPropagation();deleteTask('${id}')">Delete</button>
    </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
  el.style.display = 'block';
}

async function updateTaskStatus(taskId, status) {
  if (status === 'done') {
    showCompletionModal(taskId);
    return;
  }
  const data = await apiPut('/tasks/' + taskId, { status });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Task status updated');
  render_tasks();
}

function showCompletionModal(taskId) {
  _completionTask = _allTasks.find(t => t.id === taskId);
  if (!_completionTask) return;
  const el = document.getElementById('completionModalContent');
  el.innerHTML = `
    <h3 style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin-bottom:4px">Complete Task</h3>
    <p style="font-size:12px;color:var(--text2);margin-bottom:16px">${escHtml(_completionTask.title)}</p>
    <div class="completion-opt" onclick="showRepeatForm()">
      <i class="ti ti-repeat"></i>
      <div><div class="opt-title">Complete & Repeat</div><div class="opt-desc">Mark done and create an identical task with a new deadline</div></div>
    </div>
    <div class="completion-opt" onclick="showCreateNewForm()">
      <i class="ti ti-copy"></i>
      <div><div class="opt-title">Complete & Create New</div><div class="opt-desc">Mark done and create an editable follow-up task</div></div>
    </div>
    <div class="completion-opt" onclick="completeOnly()">
      <i class="ti ti-circle-check"></i>
      <div><div class="opt-title">Complete (Done)</div><div class="opt-desc">Simply mark as done, no follow-up</div></div>
    </div>
    <button class="btn bsm bo" style="margin-top:8px;width:100%" onclick="closeCompletionModal()">Cancel</button>`;
  document.getElementById('completionModal').classList.add('show');
}

function showRepeatForm() {
  const el = document.getElementById('completionModalContent');
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDate = now.toISOString().slice(0, 16);
  el.innerHTML = `
    <h3 style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin-bottom:4px">Complete & Repeat</h3>
    <p style="font-size:12px;color:var(--text2);margin-bottom:16px">Set the deadline for the repeated task:</p>
    <div class="flbl">New Deadline</div>
    <input type="datetime-local" id="repeatDeadline" style="width:100%" min="${minDate}">
    <div style="display:flex;gap:6px;margin-top:16px">
      <button class="btn" onclick="completeAndRepeat()">Confirm</button>
      <button class="btn bo" onclick="showCompletionModal('${_completionTask.id}')">Back</button>
    </div>`;
}

function showCreateNewForm() {
  const t = _completionTask;
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDate = now.toISOString().slice(0, 16);
  let assignOpts = '';
  if (isManager()) {
    assignOpts = appUsers.filter(u => u.active).map(u =>
      `<option value="${u.id}" ${u.id === t.assignedTo ? 'selected' : ''}>${u.displayName}</option>`
    ).join('');
  }
  const el = document.getElementById('completionModalContent');
  el.innerHTML = `
    <h3 style="font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin-bottom:4px">Complete & Create New</h3>
    <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Edit the follow-up task details:</p>
    <div class="flbl">Title</div>
    <input type="text" id="cnTitle" style="width:100%" value="${t.title}">
    <div class="flbl">Description</div>
    <textarea id="cnDesc" style="width:100%">${t.description || ''}</textarea>
    <div style="display:flex;gap:8px">
      ${isManager() ? `<div style="flex:1"><div class="flbl">Assign To</div><select id="cnAssign" style="width:100%">${assignOpts}</select></div>` : ''}
      <div style="flex:1"><div class="flbl">Category</div>
        <select id="cnCat" style="width:100%">
          ${['general','repair','auto','iot','admin'].map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1"><div class="flbl">Priority</div>
        <select id="cnPri" style="width:100%">
          ${['medium','high','low'].map(p => `<option value="${p}" ${p===t.priority?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="flbl">Deadline</div>
    <input type="datetime-local" id="cnDeadline" style="width:100%" min="${minDate}">
    <div style="display:flex;gap:6px;margin-top:16px">
      <button class="btn" onclick="completeAndCreateNew()">Confirm</button>
      <button class="btn bo" onclick="showCompletionModal('${t.id}')">Back</button>
    </div>`;
}

async function completeAndRepeat() {
  const deadline = document.getElementById('repeatDeadline').value;
  if (!deadline) { ntf('Please select a date and time'); return; }
  const t = _completionTask;
  await apiPut('/tasks/' + t.id, { status: 'done' });
  await apiPost('/tasks', {
    title: t.title, description: t.description || '', assignedTo: t.assignedTo,
    category: t.category, priority: t.priority, deadline: new Date(deadline).toISOString()
  });
  closeCompletionModal();
  ntf('Task completed, repeat created');
  render_tasks();
}

async function completeAndCreateNew() {
  const title = document.getElementById('cnTitle').value.trim();
  if (!title) { ntf('Title is required'); return; }
  const deadline = document.getElementById('cnDeadline').value;
  if (!deadline) { ntf('Please select a date and time'); return; }
  const t = _completionTask;
  await apiPut('/tasks/' + t.id, { status: 'done' });
  const newTask = {
    title,
    description: document.getElementById('cnDesc').value.trim(),
    assignedTo: isManager() ? document.getElementById('cnAssign').value : t.assignedTo,
    category: document.getElementById('cnCat').value,
    priority: document.getElementById('cnPri').value,
    deadline: new Date(deadline).toISOString()
  };
  await apiPost('/tasks', newTask);
  closeCompletionModal();
  ntf('Task completed, new task created');
  render_tasks();
}

async function completeOnly() {
  await apiPut('/tasks/' + _completionTask.id, { status: 'done' });
  closeCompletionModal();
  ntf('Task completed');
  render_tasks();
}

function closeCompletionModal() {
  document.getElementById('completionModal').classList.remove('show');
  _completionTask = null;
}

async function addNote(taskId) {
  const textarea = document.getElementById('noteText-' + taskId);
  const text = textarea.value.trim();
  if (!text) return;
  const data = await apiPost('/tasks/' + taskId + '/notes', { text });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Note added');
  render_tasks();
}

async function reassignTask(taskId) {
  const sel = document.getElementById('reassign-' + taskId);
  if (!sel.value) return;
  const data = await apiPut('/tasks/' + taskId, { assignedTo: sel.value });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Task reassigned');
  render_tasks();
}

async function deleteTask(taskId) {
  const task = _allTasks.find(t => t.id === taskId);
  if (!confirm('Delete task "' + (task ? task.title : taskId) + '"? This cannot be undone.')) return;
  const data = await apiDelete('/tasks/' + taskId);
  if (data && data.error) { ntf(data.error); return; }
  tasksDetailId = null;
  ntf('Task deleted');
  render_tasks();
}

function showCreateTask() {
  const el = document.getElementById('createTaskForm');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }

  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="ctitle">Assign New Task</div>
    <div class="flbl">Title *</div>
    <input type="text" id="newTaskTitle" placeholder="Task title" style="width:100%">
    <div class="flbl">Description</div>
    <textarea id="newTaskDesc" placeholder="Optional description" style="width:100%"></textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <div style="flex:1">
        <div class="flbl">Assign To *</div>
        <select id="newTaskAssign" style="width:100%">
          <option value="">Select staff member</option>
          ${appUsers.filter(u => u.active).map(u => `<option value="${u.id}">${u.displayName} (${u.role})</option>`).join('')}
        </select>
      </div>
      <div style="flex:1">
        <div class="flbl">Category</div>
        <select id="newTaskCat" style="width:100%">
          <option value="general">General</option>
          <option value="repair">Repair</option>
          <option value="auto">Automation</option>
          <option value="iot">IoT</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <div style="flex:1">
        <div class="flbl">Priority</div>
        <select id="newTaskPri" style="width:100%">
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div style="flex:1">
        <div class="flbl">Deadline</div>
        <input type="date" id="newTaskDeadline" style="width:100%">
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:14px">
      <button class="btn" onclick="submitCreateTask()">Create & Assign</button>
      <button class="btn bo" onclick="document.getElementById('createTaskForm').style.display='none'">Cancel</button>
    </div>
  </div>`;
}

async function submitCreateTask() {
  const title = document.getElementById('newTaskTitle').value.trim();
  const assignedTo = document.getElementById('newTaskAssign').value;
  if (!title) { ntf('Title is required'); return; }
  if (!assignedTo) { ntf('Please select a staff member'); return; }

  const task = {
    title,
    description: document.getElementById('newTaskDesc').value.trim(),
    assignedTo,
    category: document.getElementById('newTaskCat').value,
    priority: document.getElementById('newTaskPri').value,
    deadline: document.getElementById('newTaskDeadline').value || null
  };

  const data = await apiPost('/tasks', task);
  if (data && data.task) {
    ntf('Task created and assigned');
    document.getElementById('createTaskForm').style.display = 'none';
    render_tasks();
  } else {
    ntf((data && data.error) || 'Failed to create task');
  }
}
