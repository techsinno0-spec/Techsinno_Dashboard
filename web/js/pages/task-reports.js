window['render_task-reports'] = async function() {
  const page = document.getElementById('page-task-reports');
  page.innerHTML = '<div class="spin"></div>';

  try {
    const data = await apiCall('GET', '/tasks');
    const tasks = (data && data.tasks) || [];
    const now = new Date();

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done');
    const pending = tasks.filter(t => t.status === 'pending');
    const inProg = tasks.filter(t => t.status === 'in_progress');
    const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && new Date(t.deadline) < now);

    const avgDays = done.length ? (done.reduce((s, t) => {
      const c = new Date(t.completedAt || t.updatedAt);
      const a = new Date(t.createdAt);
      return s + (c - a) / 86400000;
    }, 0) / done.length).toFixed(1) : '—';

    const staffMap = {};
    tasks.forEach(t => {
      if (!staffMap[t.assignedTo]) staffMap[t.assignedTo] = { total: 0, done: 0, overdue: 0 };
      staffMap[t.assignedTo].total++;
      if (t.status === 'done') staffMap[t.assignedTo].done++;
      if (t.status !== 'done' && t.deadline && new Date(t.deadline) < now) staffMap[t.assignedTo].overdue++;
    });

    let staffRows = '';
    Object.keys(staffMap).forEach(uid => {
      const s = staffMap[uid];
      const rate = s.total ? Math.round((s.done / s.total) * 100) : 0;
      const name = getUserName(uid);
      staffRows += `
        <div class="user-row">
          <div class="user-avatar">${escHtml(name.charAt(0).toUpperCase())}</div>
          <div class="user-info">
            <div class="user-name">${escHtml(name)}</div>
          </div>
          <div style="text-align:center;min-width:50px"><div style="font-size:14px;font-weight:700">${s.total}</div><div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace">TASKS</div></div>
          <div style="text-align:center;min-width:50px"><div style="font-size:14px;font-weight:700;color:#3fb950">${s.done}</div><div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace">DONE</div></div>
          <div style="text-align:center;min-width:50px"><div style="font-size:14px;font-weight:700;color:${s.overdue ? '#f85149' : 'var(--text2)'}">${s.overdue}</div><div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace">OVERDUE</div></div>
          <div style="text-align:center;min-width:55px"><div style="font-size:14px;font-weight:700;color:var(--brand-mid)">${rate}%</div><div style="font-size:9px;color:var(--text3);font-family:'DM Mono',monospace">RATE</div></div>
        </div>`;
    });

    let recentDone = '';
    done.sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt)).slice(0, 10).forEach(t => {
      recentDone += `
        <div class="tr">
          ${categoryTag(t.category)}
          <span style="flex:1;font-size:12px">${escHtml(t.title)}</span>
          <span style="font-size:11px;color:var(--text2)">${escHtml(getUserName(t.assignedTo))}</span>
          <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${timeAgo(t.completedAt || t.updatedAt)}</span>
        </div>`;
    });

    let overdueRows = '';
    overdue.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).forEach(t => {
      const daysLate = Math.ceil((now - new Date(t.deadline)) / 86400000);
      overdueRows += `
        <div class="tr">
          ${categoryTag(t.category)}
          <span style="flex:1;font-size:12px">${escHtml(t.title)}</span>
          <span style="font-size:11px;color:var(--text2)">${escHtml(getUserName(t.assignedTo))}</span>
          <span class="bdg b-high">${daysLate}d late</span>
        </div>`;
    });

    page.innerHTML = `
      <div class="g4">
        <div class="stat"><div class="slbl">Total Tasks</div><div class="sval">${total}</div><div class="ssub">${inProg.length} in progress</div></div>
        <div class="stat"><div class="slbl">Completed</div><div class="sval cg">${done.length}</div><div class="ssub">${total ? Math.round((done.length / total) * 100) : 0}% completion</div></div>
        <div class="stat"><div class="slbl">Pending</div><div class="sval ca">${pending.length}</div><div class="ssub">awaiting action</div></div>
        <div class="stat"><div class="slbl">Overdue</div><div class="sval cr">${overdue.length}</div><div class="ssub">avg ${avgDays}d to complete</div></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="ctitle">Staff Performance</div>
        ${staffRows || '<div class="empty-state">No task data yet</div>'}
      </div>
      <div class="g2">
        <div class="card">
          <div class="ctitle">Recently Completed</div>
          ${recentDone || '<div class="empty-state"><i class="ti ti-clipboard-check"></i>No completed tasks yet</div>'}
        </div>
        <div class="card">
          <div class="ctitle">Overdue Tasks</div>
          ${overdueRows || '<div class="empty-state"><i class="ti ti-clock-check"></i>No overdue tasks</div>'}
        </div>
      </div>`;
  } catch {
    page.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load reports</div>';
  }
}
