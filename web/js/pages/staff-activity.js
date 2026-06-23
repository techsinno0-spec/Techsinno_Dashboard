let activityUserId = '';

window['render_staff-activity'] = async function() {
  if (!isManager()) return;
  const el = document.getElementById('page-staff-activity');

  const activeUsers = appUsers.filter(u => u.active && u.role === 'staff');

  let html = `<div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
    <select id="activityUserSelect" style="min-width:200px" onchange="activityUserId=this.value;loadActivityFeed()">
      <option value="">All team activity</option>
      ${activeUsers.map(u => `<option value="${u.id}" ${u.id === activityUserId ? 'selected' : ''}>${u.displayName}</option>`).join('')}
    </select>
    <button class="btn bsm bo" onclick="loadActivityFeed()"><i class="ti ti-refresh" style="font-size:12px"></i> Refresh</button>
  </div>`;

  html += '<div id="activityFeed"><div class="spin"></div> Loading...</div>';

  el.innerHTML = html;
  loadActivityFeed();
}

async function loadActivityFeed() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  feed.innerHTML = '<div class="spin"></div> Loading...';

  try {
    const path = activityUserId ? `/activity/${activityUserId}?limit=50` : '/activity?limit=50';
    const data = await apiGet(path);
    const activities = (data && data.activities) || [];

    if (activities.length === 0) {
      feed.innerHTML = '<div class="empty-state"><i class="ti ti-activity"></i>No activity recorded yet</div>';
      return;
    }

    const iconMap = {
      login: 'ti-login',
      task_completed: 'ti-circle-check',
      task_updated: 'ti-edit',
      task_created: 'ti-plus',
      task_deleted: 'ti-trash',
      note_added: 'ti-message',
      email_sent: 'ti-send'
    };

    const colorMap = {
      login: 'var(--brand-mid)',
      task_completed: '#3fb950',
      task_updated: 'var(--accent)',
      task_created: 'var(--brand-mid)',
      task_deleted: '#f85149',
      note_added: 'var(--text2)',
      email_sent: 'var(--brand-mid)'
    };

    let html = '';
    activities.forEach(a => {
      const icon = iconMap[a.action] || 'ti-activity';
      const color = colorMap[a.action] || 'var(--text3)';
      html += `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <i class="ti ${icon}" style="font-size:15px;color:${color};margin-top:2px;flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text)">${escHtml(a.details || a.action)}</div>
          <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:2px">
            ${escHtml(getUserName(a.userId))} · ${timeAgo(a.timestamp)}
          </div>
        </div>
      </div>`;
    });

    feed.innerHTML = html;
  } catch {
    feed.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Failed to load activity</div>';
  }
}
