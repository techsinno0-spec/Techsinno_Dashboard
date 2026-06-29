const DASHBOARD_START = new Date('2026-05-27');

function dashboardDay() {
  const d = Math.floor((new Date() - DASHBOARD_START) / 86400000) + 1;
  return Math.max(1, Math.min(90, d));
}

function dashboardPhase(day) {
  return day <= 30 ? 'Phase 1' : day <= 60 ? 'Phase 2' : 'Phase 3';
}

function money(n) {
  return 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA');
}

function defaultPhaseProgress(day) {
  return {
    p1: day <= 30 ? Math.round(day / 30 * 100) : 100,
    p2: day <= 30 ? 0 : day <= 60 ? Math.round((day - 30) / 30 * 100) : 100,
    p3: day <= 60 ? 0 : Math.round((day - 60) / 30 * 100)
  };
}

function defaultSchedule() {
  const dow = new Date().getDay();
  const wknd = dow === 0 || dow === 6;
  return wknd ? [
    { t: '08:00', x: 'Repair work / client visit', d: 'Sat', c: '#D85A30' },
    { t: '18:00', x: 'Batch-write 3 LinkedIn posts', d: 'Sun', c: 'var(--brand-mid)' },
    { t: '19:00', x: 'Review pipeline & plan week', d: 'Sun', c: 'var(--brand-mid)' },
    { t: '19:30', x: 'Update tasks & sync Zoho', d: 'Sun', c: 'var(--text3)' }
  ] : [
    { t: '18:30', x: 'Check LinkedIn — reply to comments', d: 'Mon–Fri', c: 'var(--brand-mid)' },
    { t: '19:00', x: ['Monday: write LinkedIn post draft', 'Tuesday: send 5 connections', 'Wednesday: publish post', 'Thursday: send 3–5 cold emails', 'Friday: follow up messages'][dow === 1 ? 0 : dow === 2 ? 1 : dow === 3 ? 2 : dow === 4 ? 3 : 4], d: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][dow - 1], c: 'var(--accent)' }
  ];
}

async function render_dashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = '<div class="spin"></div> Loading dashboard...';

  try {
    const tasksData = await apiGet('/tasks');
    const tasks = (tasksData && tasksData.tasks) || [];
    let shared = {};
    if (isManager() && typeof syncLoad === 'function') {
      try {
        const sharedState = await syncLoad();
        shared = (sharedState && sharedState.data) || {};
      } catch {}
    }

    const snap = shared.dashboard || {};
    const sharedTasks = Array.isArray(shared.tasks) ? shared.tasks.flat() : [];
    const sharedGoals = Array.isArray(shared.goals) ? shared.goals : [];
    const sharedPosts = Array.isArray(shared.posts) ? shared.posts : [];
    const day = snap.day || dashboardDay();
    const phase = snap.phase || dashboardPhase(day);
    const pp = snap.phaseProgress || defaultPhaseProgress(day);
    const schedule = Array.isArray(snap.schedule) && snap.schedule.length ? snap.schedule : defaultSchedule();
    const zoho = snap.zoho && snap.zoho.summary ? snap.zoho : null;

    const pending = tasks.filter(t => t.status === 'pending').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const total = tasks.length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const overdueTasks = tasks.filter(t => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date());
    const urgentTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'done');

    let html = '';

    if (isManager()) {
      const tasksDone = snap.tasksDone ?? (sharedTasks.length ? sharedTasks.filter(t => t.d).length : done);
      const tasksTotal = snap.tasksTotal ?? (sharedTasks.length || total || 0);
      const postsPublished = snap.postsPublished ?? sharedPosts.filter(p => p.s === 'posted' || p.status === 'posted').length;
      const postsTotal = snap.postsTotal ?? (sharedPosts.length || 12);
      const summary = zoho && zoho.summary;

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
        <div class="stat" style="border-top:2px solid var(--accent)"><div class="slbl">Day of 90</div><div class="sval ca">${day}</div><div class="ssub">${phase}</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Tasks done</div><div class="sval cb">${tasksDone}</div><div class="ssub">of ${tasksTotal}</div></div>
        <div class="stat" style="border-top:2px solid #3fb950"><div class="slbl">Posts published</div><div class="sval cg">${postsPublished}</div><div class="ssub">of ${postsTotal} planned</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Net profit</div><div class="sval ${summary && summary.netProfit < 0 ? 'cr' : 'cg'}">${summary ? money(summary.netProfit) : '—'}</div><div class="ssub">${summary ? money(summary.totalReceived) + ' received' : 'connect Zoho'}</div></div>
      </div>`;

      html += `<div class="g2">
        <div class="card">
          <div class="ctitle">Phase Progress</div>
          ${[
            ['p1', 'Phase 1 - Foundation', 'pf-brand'],
            ['p2', 'Phase 2 - Traction', 'pf-accent'],
            ['p3', 'Phase 3 - Scale', 'pf-green']
          ].map(([key, label, cls]) => `<div class="pw"><div class="ph"><span class="pl">${label}</span><span class="pp">${pp[key] || 0}%</span></div><div class="pt"><div class="pf ${cls}" style="width:${pp[key] || 0}%"></div></div></div>`).join('')}
        </div>
        <div class="card">
          <div class="ctitle">Today's Schedule</div>
          ${schedule.map(i => `<div class="ri"><div class="rt" style="color:${i.c || 'var(--brand-mid)'}">${escHtml(i.t)}</div><div class="rxt"><strong>${escHtml(i.x)}</strong></div><div class="rd">${escHtml(i.d || '')}</div></div>`).join('')}
          <div class="ctitle" style="margin-top:12px">Upcoming Deadlines</div>
          <div class="ri" style="background:rgba(248,81,73,.08)"><i class="ti ti-alert-circle cr"></i><div class="rxt">CIPC Annual return</div><div class="rd">Due 16 March 2027</div></div>
          <div class="ri" style="background:rgba(244,163,0,.08)"><i class="ti ti-calendar ca"></i><div class="rxt">Financial statements</div><div class="rd">Due September 2026</div></div>
        </div>
      </div>
      <div class="g2">`;
    } else {
      html += `<div class="g4">
        <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending}</div><div class="ssub">tasks waiting</div></div>
        <div class="stat"><div class="slbl">In Progress</div><div class="sval cb">${inProgress}</div><div class="ssub">being worked on</div></div>
        <div class="stat"><div class="slbl">Completed</div><div class="sval cg">${done}</div><div class="ssub">tasks done</div></div>
        <div class="stat"><div class="slbl">Completion</div><div class="sval cl">${completionRate}%</div><div class="pt" style="margin-top:6px"><div class="pf pf-green" style="width:${completionRate}%"></div></div></div>
      </div>`;
    }

    html += `<div class="card"><div class="ctitle">${urgentTasks.length > 0 ? '⚡' : ''} High Priority Tasks</div>`;
    html += urgentTasks.length === 0 ? '<div style="font-size:12px;color:var(--text3)">No high-priority tasks right now</div>' : urgentTasks.slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${isManager() ? escHtml(getUserName(t.assignedTo)) + ' · ' : ''}${t.deadline ? 'Due ' + formatDate(t.deadline) : 'No deadline'}</div></div>${statusBadge(t.status)} ${categoryTag(t.category)}</div>`).join('');
    html += '</div>';

    if (isManager()) {
      html += `<div class="card"><div class="ctitle">Overdue Tasks</div>`;
      html += overdueTasks.length === 0 ? '<div style="font-size:12px;color:var(--text3)">Nothing overdue</div>' : overdueTasks.slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:#f85149;margin-top:2px">${escHtml(getUserName(t.assignedTo))} · Due ${formatDate(t.deadline)}</div></div>${statusBadge(t.status)} ${priorityBadge(t.priority)}</div>`).join('');
      html += '</div></div>';
      html += `<div class="card" style="margin-top:14px"><div class="ctitle"><i class="ti ti-tool ca" style="margin-right:5px"></i>Job & Production Tasks</div><div style="font-size:12px;color:var(--text3)">No tasks yet - <a href="#" onclick="navigateTo('job-cards');return false" style="color:var(--brand-mid)">add job tasks</a></div></div>`;
      if (snap.savedAt) html += `<div style="font-size:10px;color:var(--text3);margin-top:8px;font-family:'DM Mono',monospace">Dashboard synced from Electron: ${new Date(snap.savedAt).toLocaleString('en-ZA')}</div>`;
    }

    if (blocked > 0) {
      html += `<div class="card" style="border-color:rgba(248,81,73,.3)"><div class="ctitle" style="color:#f85149">Blocked Tasks (${blocked})</div>`;
      html += tasks.filter(t => t.status === 'blocked').slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${isManager() ? escHtml(getUserName(t.assignedTo)) + ' · ' : ''}${categoryTag(t.category)}</div></div>${priorityBadge(t.priority)}</div>`).join('');
      html += '</div>';
    }

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load dashboard</div>';
  }
}
