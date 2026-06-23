async function render_dashboard() {
  const el = document.getElementById('page-dashboard');
  const user = getUser();
  const role = user.role;

  el.innerHTML = '<div class="spin"></div> Loading dashboard...';

  try {
    const tasksData = await apiGet('/tasks');
    const tasks = (tasksData && tasksData.tasks) || [];

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const total = tasks.length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const overdueTasks = tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date());
    const urgentTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'done');

    let html = '';

    html += `<div class="g4">
      <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending}</div><div class="ssub">tasks waiting</div></div>
      <div class="stat"><div class="slbl">In Progress</div><div class="sval cb">${inProgress}</div><div class="ssub">being worked on</div></div>
      <div class="stat"><div class="slbl">Completed</div><div class="sval cg">${done}</div><div class="ssub">tasks done</div></div>
      <div class="stat"><div class="slbl">Completion</div><div class="sval cl">${completionRate}%</div>
        <div class="pt" style="margin-top:6px"><div class="pf pf-green" style="width:${completionRate}%"></div></div>
      </div>
    </div>`;

    if (role === 'manager') {
      html += `<div class="g2">`;
    }

    html += `<div class="card">
      <div class="ctitle">${urgentTasks.length > 0 ? '⚡' : ''} High Priority Tasks</div>`;
    if (urgentTasks.length === 0) {
      html += '<div style="font-size:12px;color:var(--text3)">No high-priority tasks right now</div>';
    } else {
      urgentTasks.slice(0, 5).forEach(t => {
        html += `<div class="tr">
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">
              ${role === 'manager' ? escHtml(getUserName(t.assignedTo)) + ' · ' : ''}${t.deadline ? 'Due ' + formatDate(t.deadline) : 'No deadline'}
            </div>
          </div>
          ${statusBadge(t.status)} ${categoryTag(t.category)}
        </div>`;
      });
    }
    html += '</div>';

    if (role === 'manager') {
      html += `<div class="card">
        <div class="ctitle">Overdue Tasks</div>`;
      if (overdueTasks.length === 0) {
        html += '<div style="font-size:12px;color:var(--text3)">Nothing overdue</div>';
      } else {
        overdueTasks.slice(0, 5).forEach(t => {
          html += `<div class="tr">
            <div style="flex:1">
              <div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div>
              <div style="font-size:10px;color:#f85149;margin-top:2px">
                ${escHtml(getUserName(t.assignedTo))} · Due ${formatDate(t.deadline)}
              </div>
            </div>
            ${statusBadge(t.status)} ${priorityBadge(t.priority)}
          </div>`;
        });
      }
      html += '</div></div>';
    }

    if (blocked > 0) {
      html += `<div class="card" style="border-color:rgba(248,81,73,.3)">
        <div class="ctitle" style="color:#f85149">Blocked Tasks (${blocked})</div>`;
      tasks.filter(t => t.status === 'blocked').slice(0, 5).forEach(t => {
        html += `<div class="tr">
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">
              ${role === 'manager' ? escHtml(getUserName(t.assignedTo)) + ' · ' : ''}${categoryTag(t.category)}
            </div>
          </div>
          ${priorityBadge(t.priority)}
        </div>`;
      });
      html += '</div>';
    }

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load dashboard</div>';
  }
}
