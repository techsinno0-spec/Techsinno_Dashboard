let showAddUser = false;
let editingUserId = null;

async function render_team() {
  if (!isManager()) return;
  const el = document.getElementById('page-team');

  el.innerHTML = '<div class="spin"></div> Loading team...';

  await loadUsers();
  const users = appUsers;

  let html = '';

  html += `<div style="margin-bottom:14px;display:flex;gap:8px;align-items:center">
    <button class="btn" onclick="toggleAddUser()"><i class="ti ti-user-plus" style="font-size:13px"></i> Add Staff Member</button>
    <span style="font-size:11px;color:var(--text3)">${users.filter(u => u.active).length} active users</span>
  </div>`;

  html += '<div id="addUserForm" style="display:none"></div>';

  // Active users
  html += '<div class="fl">Active Users</div>';
  users.filter(u => u.active).forEach(u => {
    html += `<div class="user-row">
      <div class="user-avatar" style="background:${u.role === 'manager' ? 'var(--accent)' : 'var(--brand)'}">${initials(u.displayName)}</div>
      <div class="user-info">
        <div class="user-name">${escHtml(u.displayName)} ${u.role === 'manager' ? '<span class="bdg b-medium" style="margin-left:4px">manager</span>' : '<span class="bdg b-in_progress" style="margin-left:4px">staff</span>'}</div>
        <div class="user-meta">@${escHtml(u.username)} · ${escHtml(u.email || 'no email')} · Last login: ${timeAgo(u.lastLoginAt)}${u.mustChangePassword ? ' · <span style="color:var(--accent)">must change password</span>' : ''}</div>
      </div>
      <div class="user-actions">
        <button class="btn bsm bo" onclick="showEditUser('${u.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button>
        ${u.role !== 'manager' ? `<button class="btn bsm bdng" onclick="deactivateUser('${u.id}','${u.displayName}')"><i class="ti ti-user-minus" style="font-size:12px"></i></button>` : ''}
      </div>
    </div>`;
    if (editingUserId === u.id) {
      html += renderEditForm(u);
    }
  });

  // Inactive users
  const inactive = users.filter(u => !u.active);
  if (inactive.length > 0) {
    html += '<div class="fl">Inactive Users</div>';
    inactive.forEach(u => {
      html += `<div class="user-row" style="opacity:.5">
        <div class="user-avatar" style="background:var(--bg4)">${initials(u.displayName)}</div>
        <div class="user-info">
          <div class="user-name">${escHtml(u.displayName)}</div>
          <div class="user-meta">@${escHtml(u.username)} · Deactivated</div>
        </div>
      </div>`;
    });
  }

  el.innerHTML = html;
}

function toggleAddUser() {
  showAddUser = !showAddUser;
  const el = document.getElementById('addUserForm');
  if (!showAddUser) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="ctitle">New Staff Member</div>
    <div style="display:flex;gap:8px">
      <div style="flex:1">
        <div class="flbl">Display Name *</div>
        <input type="text" id="nuName" placeholder="Full name" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Username *</div>
        <input type="text" id="nuUsername" placeholder="Lowercase, no spaces" style="width:100%">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <div style="flex:1">
        <div class="flbl">Email</div>
        <input type="email" id="nuEmail" placeholder="Optional" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Initial Password *</div>
        <input type="text" id="nuPassword" placeholder="Min 8 characters" style="width:100%">
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:14px">
      <button class="btn" onclick="submitAddUser()">Create User</button>
      <button class="btn bo" onclick="showAddUser=false;document.getElementById('addUserForm').style.display='none'">Cancel</button>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:8px">User will be required to change password on first login.</div>
  </div>`;
}

async function submitAddUser() {
  const displayName = document.getElementById('nuName').value.trim();
  const username = document.getElementById('nuUsername').value.trim();
  const email = document.getElementById('nuEmail').value.trim();
  const password = document.getElementById('nuPassword').value;

  if (!displayName || !username || !password) { ntf('Name, username, and password are required'); return; }

  const data = await apiPost('/users', { displayName, username, email, password, role: 'staff' });
  if (data && data.user) {
    ntf(`User "${displayName}" created`);
    showAddUser = false;
    render_team();
  } else {
    ntf((data && data.error) || 'Failed to create user');
  }
}

function renderEditForm(user) {
  return `<div class="card" style="margin-bottom:8px;margin-left:44px">
    <div class="ctitle">Edit ${escHtml(user.displayName)}</div>
    <div style="display:flex;gap:8px">
      <div style="flex:1">
        <div class="flbl">Display Name</div>
        <input type="text" id="eu-name-${user.id}" value="${escHtml(user.displayName)}" style="width:100%">
      </div>
      <div style="flex:1">
        <div class="flbl">Email</div>
        <input type="email" id="eu-email-${user.id}" value="${escHtml(user.email || '')}" style="width:100%">
      </div>
    </div>
    <div style="flex:1">
      <div class="flbl">Reset Password (leave blank to keep current)</div>
      <input type="text" id="eu-pw-${user.id}" placeholder="New password" style="width:100%">
    </div>
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn bsm" onclick="submitEditUser('${user.id}')">Save</button>
      <button class="btn bsm bo" onclick="editingUserId=null;render_team()">Cancel</button>
    </div>
  </div>`;
}

function showEditUser(id) {
  editingUserId = editingUserId === id ? null : id;
  render_team();
}

async function submitEditUser(id) {
  const body = {
    displayName: document.getElementById('eu-name-' + id).value.trim(),
    email: document.getElementById('eu-email-' + id).value.trim()
  };
  const pw = document.getElementById('eu-pw-' + id).value;
  if (pw) body.resetPassword = pw;

  const data = await apiPut('/users/' + id, body);
  if (data && data.user) {
    ntf('User updated');
    editingUserId = null;
    render_team();
  } else {
    ntf((data && data.error) || 'Failed to update user');
  }
}

async function deactivateUser(id, name) {
  if (!confirm(`Deactivate "${name}"? They will no longer be able to log in.`)) return;
  const data = await apiDelete('/users/' + id);
  if (data && data.success) {
    ntf(`${name} deactivated`);
    render_team();
  } else {
    ntf((data && data.error) || 'Failed to deactivate user');
  }
}
