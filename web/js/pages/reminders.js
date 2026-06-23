let _reminders = [];

function render_reminders() {
  const el = document.getElementById('page-reminders');
  el.innerHTML = '<div class="spin"></div>';
  loadReminders();
}

async function loadReminders() {
  const el = document.getElementById('page-reminders');
  try {
    const data = await apiGet('/reminders');
    _reminders = (data && data.reminders) || [];
    renderRemindersPage(el);
  } catch {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load reminders</div>';
  }
}

function renderRemindersPage(el) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(today); weekAhead.setDate(weekAhead.getDate() + 7);

  const overdue = _reminders.filter(r => r.status === 'active' && new Date(r.dueDate) < today);
  const todayItems = _reminders.filter(r => r.status === 'active' && new Date(r.dueDate) >= today && new Date(r.dueDate) < new Date(today.getTime() + 86400000));
  const upcoming = _reminders.filter(r => r.status === 'active' && new Date(r.dueDate) >= new Date(today.getTime() + 86400000) && new Date(r.dueDate) <= weekAhead);
  const completed = _reminders.filter(r => r.status === 'completed').slice(0, 10);

  const priColors = { high: '#f85149', medium: 'var(--accent)', low: '#3fb950' };

  function renderItem(r, isOverdue) {
    const linked = r.linkedTo ? `<span class="tag t-a" style="font-size:8px">${r.linkedTo.type}: ${r.linkedTo.label || r.linkedTo.id}</span>` : '';
    return `<div class="ri" style="${isOverdue ? 'border-color:rgba(248,81,73,.4);background:rgba(248,81,73,.05)' : ''}">
      <div style="width:4px;height:28px;border-radius:2px;background:${priColors[r.priority] || 'var(--text3)'};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--text)">${escHtml(r.title)}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px">${formatDateTime(r.dueDate)} ${linked}</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn bsm bo" onclick="snoozeReminder('${r.id}','1d')" title="+1 day">+1d</button>
        <button class="btn bsm bo" onclick="snoozeReminder('${r.id}','3d')" title="+3 days">+3d</button>
        <button class="btn bsm bo" onclick="snoozeReminder('${r.id}','1w')" title="+1 week">+1w</button>
        <button class="btn bsm" onclick="completeReminder('${r.id}')" title="Done"><i class="ti ti-check" style="font-size:12px"></i></button>
        <button class="btn bsm bdng" onclick="dismissReminder('${r.id}')" title="Dismiss"><i class="ti ti-x" style="font-size:12px"></i></button>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:12px;color:var(--text2)">${_reminders.filter(r => r.status === 'active').length} active reminders</div>
      <button class="btn" onclick="showAddReminderForm()"><i class="ti ti-plus" style="font-size:12px"></i> Add Reminder</button>
    </div>
    ${overdue.length ? `<div class="fl" style="color:#f85149">OVERDUE (${overdue.length})</div>${overdue.map(r => renderItem(r, true)).join('')}` : ''}
    <div class="fl">TODAY (${todayItems.length})</div>
    ${todayItems.length ? todayItems.map(r => renderItem(r, false)).join('') : '<div style="font-size:11px;color:var(--text3);padding:6px 0">No reminders today</div>'}
    <div class="fl">UPCOMING — NEXT 7 DAYS (${upcoming.length})</div>
    ${upcoming.length ? upcoming.map(r => renderItem(r, false)).join('') : '<div style="font-size:11px;color:var(--text3);padding:6px 0">Nothing upcoming</div>'}
    ${completed.length ? `<div class="fl">RECENTLY COMPLETED</div>${completed.map(r => `<div class="ri" style="opacity:.5"><div style="flex:1;font-size:12px;text-decoration:line-through">${escHtml(r.title)}</div><span style="font-size:10px;color:var(--text3)">${timeAgo(r.updatedAt)}</span></div>`).join('')}` : ''}
    <div id="reminderForm"></div>`;
}

function showAddReminderForm() {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const el = document.getElementById('reminderForm');
  el.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="ctitle">New Reminder</div>
    <div class="flbl">Title *</div>
    <input type="text" id="remTitle" style="width:100%" placeholder="What do you need to remember?">
    <div style="display:flex;gap:8px">
      <div style="flex:2"><div class="flbl">Due Date & Time *</div><input type="datetime-local" id="remDue" style="width:100%" min="${now.toISOString().slice(0, 16)}"></div>
      <div style="flex:1"><div class="flbl">Priority</div><select id="remPriority" style="width:100%"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></div>
    </div>
    <div class="flbl">Description</div>
    <textarea id="remDesc" style="width:100%;height:50px" placeholder="Optional details..."></textarea>
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn" onclick="submitReminder()">Save</button>
      <button class="btn bo" onclick="document.getElementById('reminderForm').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

async function submitReminder() {
  const title = document.getElementById('remTitle').value.trim();
  if (!title) { ntf('Title is required'); return; }
  const dueDate = document.getElementById('remDue').value;
  if (!dueDate) { ntf('Due date is required'); return; }

  await apiCall('POST', '/reminders', {
    title,
    description: document.getElementById('remDesc').value.trim(),
    dueDate: new Date(dueDate).toISOString(),
    priority: document.getElementById('remPriority').value
  });
  ntf('Reminder created');
  document.getElementById('reminderForm').innerHTML = '';
  loadReminders();
}

async function snoozeReminder(id, duration) {
  const data = await apiCall('PUT', '/reminders/' + id, { snooze: duration });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Snoozed ' + duration);
  loadReminders();
}

async function completeReminder(id) {
  const data = await apiCall('PUT', '/reminders/' + id, { status: 'completed' });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Completed');
  loadReminders();
}

async function dismissReminder(id) {
  const data = await apiCall('PUT', '/reminders/' + id, { status: 'dismissed' });
  if (data && data.error) { ntf(data.error); return; }
  ntf('Dismissed');
  loadReminders();
}
