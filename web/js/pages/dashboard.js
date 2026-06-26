async function render_dashboard() {
  const el = document.getElementById('page-dashboard');
  const user = getUser();
  const role = user.role;

  el.innerHTML = '<div class="spin"></div> Loading dashboard...';

  try {
    const tasksData = await apiGet('/tasks');
    const tasks = (tasksData && tasksData.tasks) || [];
    let sharedState = null;
    if (role === 'manager' && typeof syncLoad === 'function') {
      try { sharedState = await syncLoad(); } catch {}
    }
    const shared = (sharedState && sharedState.data) || {};
    const sharedTasks = Array.isArray(shared.tasks) ? shared.tasks.flat() : [];
    const sharedGoals = Array.isArray(shared.goals) ? shared.goals : [];
    const sharedPosts = Array.isArray(shared.posts) ? shared.posts : [];

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const total = tasks.length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const overdueTasks = tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date());
    const urgentTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'done');

    let html = '';

    if (role === 'manager') {
      html += `<div class="wtabs manager-actions">
        <button class="wtab active" onclick="navigateTo('inboxes')"><i class="ti ti-edit" style="font-size:11px;margin-right:3px"></i>Compose</button>
        <button class="wtab" onclick="navigateTo('inboxes',{provider:'zoho_mail',navId:'mail-zoho'})"><i class="ti ti-mail" style="font-size:11px;margin-right:3px;color:#5fa8c4"></i>Zoho Mail</button>
        <button class="wtab" onclick="navigateTo('inboxes',{provider:'gmail',navId:'mail-gmail'})"><i class="ti ti-brand-gmail" style="font-size:11px;margin-right:3px;color:#f85149"></i>Gmail</button>
        <button class="wtab" onclick="navigateTo('inboxes',{provider:'outlook',navId:'mail-outlook'})"><i class="ti ti-mail" style="font-size:11px;margin-right:3px;color:#0078d4"></i>Outlook</button>
        <button class="wtab" onclick="navigateTo('tasks',{taskView:'team',navId:'team-tasks'})"><i class="ti ti-checklist" style="font-size:11px;margin-right:3px"></i>Tasks</button>
        <button class="wtab" onclick="navigateTo('zoho')"><i class="ti ti-chart-bar" style="font-size:11px;margin-right:3px"></i>Zoho</button>
        <button class="wtab ask-claude" onclick="navigateTo('agent')"><i class="ti ti-sparkles" style="font-size:11px;margin-right:3px"></i>Ask Claude</button>
      </div>`;

      html += `<div class="g4">
        <div class="stat" style="border-top:2px solid var(--accent)"><div class="slbl">Day of 90</div><div class="sval ca">31</div><div class="ssub">Phase 2</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Tasks done</div><div class="sval cb">${sharedTasks.length ? sharedTasks.filter(t => t.d).length : done}</div><div class="ssub">of ${sharedTasks.length || total || 26}</div></div>
        <div class="stat" style="border-top:2px solid #3fb950"><div class="slbl">Posts published</div><div class="sval cg">${sharedPosts.filter(p => p.s === 'posted' || p.status === 'posted').length}</div><div class="ssub">of ${sharedPosts.length || 12} planned</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Net profit</div><div class="sval cg">—</div><div class="ssub">connect Zoho</div></div>
      </div>`;
    } else {
      html += `<div class="g4">
        <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending}</div><div class="ssub">tasks waiting</div></div>
        <div class="stat"><div class="slbl">In Progress</div><div class="sval cb">${inProgress}</div><div class="ssub">being worked on</div></div>
        <div class="stat"><div class="slbl">Completed</div><div class="sval cg">${done}</div><div class="ssub">tasks done</div></div>
        <div class="stat"><div class="slbl">Completion</div><div class="sval cl">${completionRate}%</div>
          <div class="pt" style="margin-top:6px"><div class="pf pf-green" style="width:${completionRate}%"></div></div>
        </div>
      </div>`;
    }

    if (role === 'manager') {
      html += `<div class="g2">
        <div class="card">
          <div class="ctitle">Phase Progress</div>
          ${[1,2,3].map(ph => {
            const gs = sharedGoals.filter(g => Number(g.p || g.phase || 1) === ph);
            const pct = gs.length ? Math.round(gs.filter(g => g.d || Number(g.progress || 0) >= 100).length / gs.length * 100) : (ph === 1 ? 100 : ph === 2 ? 3 : 0);
            const label = ph === 1 ? 'Foundation' : ph === 2 ? 'Traction' : 'Scale';
            const cls = ph === 1 ? 'pf-brand' : ph === 2 ? 'pf-accent' : 'pf-green';
            return `<div class="pw"><div class="ph"><span class="pl">Phase ${ph} - ${label}</span><span class="pp">${pct}%</span></div><div class="pt"><div class="pf ${cls}" style="width:${pct}%"></div></div></div>`;
          }).join('')}
        </div>
        <div class="card">
          <div class="ctitle">Today's Schedule</div>
          <div class="ri"><div class="rt">18:30</div><div class="rxt"><strong>Check LinkedIn — reply to comments</strong></div><div class="rd">Mon–Fri</div></div>
          <div class="ri"><div class="rt">19:00</div><div class="rxt"><strong>Friday: follow up messages</strong></div><div class="rd">Fri</div></div>
          <div class="ctitle" style="margin-top:12px">Upcoming Deadlines</div>
          <div class="ri" style="background:rgba(248,81,73,.08)"><i class="ti ti-alert-circle cr"></i><div class="rxt">CIPC Annual return</div><div class="rd">Due 16 March 2027</div></div>
          <div class="ri" style="background:rgba(244,163,0,.08)"><i class="ti ti-calendar ca"></i><div class="rxt">Financial statements</div><div class="rd">Due September 2026</div></div>
        </div>
      </div>
      <div class="g2">`;
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

    if (role === 'manager') {
      html += `<div class="card" style="margin-top:14px">
        <div class="ctitle"><i class="ti ti-tool ca" style="margin-right:5px"></i>Job & Production Tasks</div>
        <div style="font-size:12px;color:var(--text3)">No tasks yet - <a href="#" onclick="navigateTo('job-cards');return false" style="color:var(--brand-mid)">add job tasks</a></div>
      </div>`;
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
