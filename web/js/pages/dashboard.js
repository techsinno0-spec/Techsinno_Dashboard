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

function dashboardTag(cat) {
  const map = { repair: 't-r', auto: 't-a', iot: 't-i', admin: 't-ad', general: 't-g' };
  return `<span class="tag ${map[cat] || 't-g'}">${escHtml(cat || 'task')}</span>`;
}

function renderTodayTasks(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div style="color:var(--text3);font-size:12px;padding:5px 0">No tasks for today.</div>';
  }
  return items.map(t => `<div class="tr">
    <div class="chk ${t.done ? 'done' : ''}">${t.done ? '✓' : ''}</div>
    <div class="tt ${t.done ? 'done' : ''}">${escHtml(t.title || '')}</div>
    ${dashboardTag(t.category)}
  </div>`).join('');
}

function renderJobTaskSnapshot(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div style="font-size:12px;color:var(--text3)">No tasks yet — <a href="#" onclick="navigateTo('job-cards');return false" style="color:var(--brand-mid)">add job tasks</a></div>`;
  }
  const now = Date.now();
  return items.map(t => {
    const dl = t.deadline ? new Date(t.deadline).getTime() : null;
    const overdue = dl && dl < now;
    const soon = dl && dl < now + 3 * 86400000 && !overdue;
    const dlStr = dl ? new Date(dl).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—';
    const pColor = { high: '#f85149', medium: 'var(--accent)', low: '#3fb950' }[t.priority] || 'var(--text3)';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <i class="ti ti-circle-dot" style="color:${pColor};font-size:13px;flex-shrink:0"></i>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.title || '')}</div>
        <div style="font-size:10px;color:${overdue ? '#f85149' : soon ? 'var(--accent)' : 'var(--text3)'}">${overdue ? '⚠ OVERDUE' : soon ? '⏰ Due soon' : 'Due'} · ${dlStr}</div>
      </div>
      <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(0,0,0,.2);color:${pColor}">${escHtml(t.priority || 'med')}</span>
    </div>`;
  }).join('') + `<div style="margin-top:8px"><a href="#" onclick="navigateTo('job-cards');return false" style="font-size:11px;color:var(--brand-mid)">Manage all tasks →</a></div>`;
}

function renderZohoSnapshot(zoho) {
  const summary = zoho && zoho.summary;
  if (!summary) {
    return '<div style="color:var(--text3);font-size:12px">Connect Zoho Books in Electron to see live financial data.</div>';
  }
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="background:var(--bg3);padding:9px;border-radius:var(--radius-sm)"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Invoiced</div><div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--brand-mid)">${money(summary.totalInvoiced)}</div></div>
    <div style="background:var(--bg3);padding:9px;border-radius:var(--radius-sm)"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Received</div><div style="font-family:'DM Mono',monospace;font-size:13px;color:#3fb950">${money(summary.totalReceived)}</div></div>
    <div style="background:var(--bg3);padding:9px;border-radius:var(--radius-sm)"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Expenses</div><div style="font-family:'DM Mono',monospace;font-size:13px;color:#f85149">${money(summary.totalExpenses)}</div></div>
    <div style="background:var(--bg3);padding:9px;border-radius:var(--radius-sm)"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Overdue</div><div style="font-family:'DM Mono',monospace;font-size:13px;color:${summary.totalOverdue > 0 ? '#f85149' : '#3fb950'}">${money(summary.totalOverdue)}</div></div>
  </div>`;
}

function renderOverdueInvoices(zoho) {
  const overdue = (zoho && Array.isArray(zoho.overdueInvoices)) ? zoho.overdueInvoices : [];
  if (!overdue.length) return '<div style="color:#3fb950;font-size:12px">No overdue invoices</div>';
  return overdue.map(i => `<div class="ir">
    <div class="inum">${escHtml(i.number || '')}</div>
    <div class="icl">${escHtml(i.client || '')}</div>
    <div class="iamt" style="color:#f85149">${money(i.amount)}</div>
    <div class="idate">Due ${formatDate(i.due)}</div>
    <span class="ibdg iover">overdue</span>
  </div>`).join('');
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
    if (isManager() && typeof stateLoad === 'function') {
      try {
        const planning = await stateLoad('planning');
        if (planning && planning.success && planning.value) shared = { ...shared, ...planning.value };
        const dashboardState = await stateLoad('dashboard');
        if (dashboardState && dashboardState.success && dashboardState.value) shared.dashboard = dashboardState.value;
      } catch {}
    }

    const snap = shared.dashboard || {};
    const sharedTasks = Array.isArray(shared.tasks) ? shared.tasks.flat() : [];
    const sharedPosts = Array.isArray(shared.posts) ? shared.posts : [];
    const day = snap.day || dashboardDay();
    const phase = snap.phase || dashboardPhase(day);
    const pp = snap.phaseProgress || defaultPhaseProgress(day);
    const schedule = Array.isArray(snap.schedule) && snap.schedule.length ? snap.schedule : defaultSchedule();
    const zoho = snap.zoho && snap.zoho.summary ? snap.zoho : null;
    const revenue = snap.revenue || (zoho && zoho.summary ? {
      target: 40000,
      totalInvoiced: zoho.summary.totalInvoiced,
      totalReceived: zoho.summary.totalReceived,
      totalOverdue: zoho.summary.totalOverdue,
      netProfit: zoho.summary.netProfit
    } : null);

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
      const received = revenue ? Number(revenue.totalReceived || 0) : 0;
      const target = revenue ? Number(revenue.target || 40000) : 40000;
      const revPct = Math.max(0, Math.min(100, Math.round(received / target * 100)));

      html += `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn bsm" onclick="navigateTo('inboxes')" style="display:flex;align-items:center;gap:5px"><i class="ti ti-edit"></i> Compose</button>
        <button class="btn bo bsm" onclick="navigateTo('inboxes',{provider:'zoho_mail',navId:'mail-zoho'})" style="display:flex;align-items:center;gap:5px"><i class="ti ti-mail" style="color:#5fa8c4"></i> Zoho Mail</button>
        <button class="btn bo bsm" onclick="navigateTo('inboxes',{provider:'gmail',navId:'mail-gmail'})" style="display:flex;align-items:center;gap:5px"><i class="ti ti-brand-gmail" style="color:#ea4335"></i> Gmail</button>
        <button class="btn bo bsm" onclick="navigateTo('inboxes',{provider:'outlook',navId:'mail-outlook'})" style="display:flex;align-items:center;gap:5px"><i class="ti ti-mail" style="color:#0078d4"></i> Outlook</button>
        <button class="btn bo bsm" onclick="window.open('https://www.linkedin.com','_blank')" style="display:flex;align-items:center;gap:5px"><i class="ti ti-brand-linkedin" style="color:#0a66c2"></i> LinkedIn</button>
        <button class="btn bo bsm" onclick="navigateTo('tasks')" style="display:flex;align-items:center;gap:5px"><i class="ti ti-checklist"></i> Tasks</button>
        <button class="btn bo bsm" onclick="navigateTo('zoho')" style="display:flex;align-items:center;gap:5px"><i class="ti ti-chart-bar"></i> Zoho</button>
        <button class="btn bo bsm" onclick="navigateTo('agent')" style="display:flex;align-items:center;gap:5px;margin-left:auto"><i class="ti ti-robot" style="color:var(--brand-mid)"></i> Ask Claude</button>
      </div>`;

      html += `<div class="g4" style="margin-bottom:14px">
        <div class="stat" style="border-top:2px solid var(--accent)"><div class="slbl">Day of 90</div><div class="sval ca">${day}</div><div class="ssub">${phase}</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Tasks done</div><div class="sval cb">${tasksDone}</div><div class="ssub">of ${tasksTotal}</div></div>
        <div class="stat" style="border-top:2px solid #3fb950"><div class="slbl">Posts published</div><div class="sval cg">${postsPublished}</div><div class="ssub">of ${postsTotal} planned</div></div>
        <div class="stat" style="border-top:2px solid var(--brand-mid)"><div class="slbl">Net profit</div><div class="sval ${summary && summary.netProfit < 0 ? 'cr' : 'cg'}">${summary ? money(summary.netProfit) : '—'}</div><div class="ssub">${summary ? money(summary.totalReceived) + ' received' : 'connect Zoho'}</div></div>
      </div>`;

      html += `<div class="g2" style="margin-bottom:14px">
        <div class="card">
          <div class="ctitle">Phase progress</div>
          ${[
            ['p1', 'Phase 1 — Foundation', 'pf-brand'],
            ['p2', 'Phase 2 — Traction', 'pf-accent'],
            ['p3', 'Phase 3 — Scale', 'pf-green']
          ].map(([key, label, cls]) => `<div class="pw"><div class="ph"><span class="pl">${label}</span><span class="pp">${pp[key] || 0}%</span></div><div class="pt"><div class="pf ${cls}" style="width:${pp[key] || 0}%"></div></div></div>`).join('')}
        </div>
        <div class="card">
          <div class="ctitle">Today's schedule</div>
          ${schedule.map(i => `<div class="ri"><div class="rt" style="color:${i.c || 'var(--brand-mid)'}">${escHtml(i.t)}</div><div class="rxt"><strong>${escHtml(i.x)}</strong></div><div class="rd">${escHtml(i.d || '')}</div></div>`).join('')}
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Upcoming deadlines</div>
            <div class="ir" style="background:rgba(216,90,48,.07);border-color:rgba(216,90,48,.2)"><i class="ti ti-alert-circle" style="color:#f0997b;font-size:13px;flex-shrink:0"></i><div style="flex:1"><div style="font-size:11px;color:var(--text)">CIPC Annual return</div><div style="font-size:10px;color:var(--text3)">Due 16 March 2027</div></div></div>
            <div class="ir" style="background:rgba(244,163,0,.05);border-color:rgba(244,163,0,.15)"><i class="ti ti-calendar" style="color:var(--accent);font-size:13px;flex-shrink:0"></i><div style="flex:1"><div style="font-size:11px;color:var(--text)">Financial statements</div><div style="font-size:10px;color:var(--text3)">Due September 2026</div></div></div>
          </div>
        </div>
      </div>`;

      html += `<div class="g2" style="margin-bottom:14px">
        <div class="card"><div class="ctitle">Today's tasks</div>${renderTodayTasks(snap.todayTasks)}</div>
        <div class="card">
          <div class="ctitle">Revenue target</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:22px;color:var(--accent)">${revenue ? money(received) : 'R0'}</div>
            <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">of R40,000 target</div>
          </div>
          <div class="pt" style="height:6px;margin-bottom:10px"><div class="pf pf-accent" style="width:${revPct}%"></div></div>
          <div class="g2" style="margin-bottom:0;gap:8px">
            <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:8px;text-align:center"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Invoiced</div><div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--brand-mid)">${revenue ? money(revenue.totalInvoiced) : '—'}</div></div>
            <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:8px;text-align:center"><div style="font-size:10px;color:var(--text3);margin-bottom:2px">Overdue</div><div style="font-family:'DM Mono',monospace;font-size:12px;color:#f85149">${revenue ? money(revenue.totalOverdue) : '—'}</div></div>
          </div>
        </div>
      </div>`;

      html += `<div class="card" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="ctitle" style="margin-bottom:0;display:flex;align-items:center;gap:6px"><i class="ti ti-tool" style="color:#f0997b;font-size:15px"></i>Job & production tasks</div>
          <button class="btn bo bsm" onclick="navigateTo('job-cards')">View all</button>
        </div>
        ${renderJobTaskSnapshot(snap.jobTasks)}
      </div>`;

      html += `<div class="g2" style="margin-bottom:14px">
        <div class="card"><div class="ctitle">Zoho Books snapshot</div>${renderZohoSnapshot(zoho)}</div>
        <div class="card"><div class="ctitle">Overdue invoices</div>${renderOverdueInvoices(zoho)}</div>
      </div>`;

      if (snap.savedAt) {
        html += `<div style="font-size:10px;color:var(--text3);margin-top:8px;font-family:'DM Mono',monospace">Dashboard synced from Electron: ${new Date(snap.savedAt).toLocaleString('en-ZA')}</div>`;
      }
    } else {
      html += `<div class="g4">
        <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending}</div><div class="ssub">tasks waiting</div></div>
        <div class="stat"><div class="slbl">In Progress</div><div class="sval cb">${inProgress}</div><div class="ssub">being worked on</div></div>
        <div class="stat"><div class="slbl">Completed</div><div class="sval cg">${done}</div><div class="ssub">tasks done</div></div>
        <div class="stat"><div class="slbl">Completion</div><div class="sval cl">${completionRate}%</div><div class="pt" style="margin-top:6px"><div class="pf pf-green" style="width:${completionRate}%"></div></div></div>
      </div>`;

      html += `<div class="card"><div class="ctitle">${urgentTasks.length > 0 ? '⚡' : ''} High Priority Tasks</div>`;
      html += urgentTasks.length === 0 ? '<div style="font-size:12px;color:var(--text3)">No high-priority tasks right now</div>' : urgentTasks.slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${t.deadline ? 'Due ' + formatDate(t.deadline) : 'No deadline'}</div></div>${statusBadge(t.status)} ${categoryTag(t.category)}</div>`).join('');
      html += '</div>';
    }

    if (isManager() && blocked > 0) {
      html += `<div class="card" style="border-color:rgba(248,81,73,.3)"><div class="ctitle" style="color:#f85149">Blocked Tasks (${blocked})</div>`;
      html += tasks.filter(t => t.status === 'blocked').slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:var(--text3);margin-top:2px">${escHtml(getUserName(t.assignedTo))} · ${categoryTag(t.category)}</div></div>${priorityBadge(t.priority)}</div>`).join('');
      html += '</div>';
    }

    if (isManager() && overdueTasks.length > 0) {
      html += `<div class="card" style="margin-top:14px"><div class="ctitle">Overdue Tasks</div>`;
      html += overdueTasks.slice(0, 5).map(t => `<div class="tr"><div style="flex:1"><div style="font-size:12px;color:var(--text)">${escHtml(t.title)}</div><div style="font-size:10px;color:#f85149;margin-top:2px">${escHtml(getUserName(t.assignedTo))} · Due ${formatDate(t.deadline)}</div></div>${statusBadge(t.status)} ${priorityBadge(t.priority)}</div>`).join('');
      html += '</div>';
    }

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load dashboard</div>';
  }
}
