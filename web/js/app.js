let appUsers = [];

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toggleMobileMenu() {
  document.getElementById('sidebarEl').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

function ntf(msg) {
  const el = document.getElementById('ntf');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function categoryTag(cat) {
  const map = { repair: 't-r', auto: 't-a', iot: 't-i', admin: 't-ad', general: 't-g' };
  return `<span class="tag ${map[cat] || 't-g'}">${cat}</span>`;
}

function statusBadge(status) {
  return `<span class="bdg b-${status}">${status.replace('_', ' ')}</span>`;
}

function priorityBadge(priority) {
  return `<span class="bdg b-${priority}">${priority}</span>`;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

async function loadUsers() {
  if (!isManager()) return;
  const data = await apiGet('/users');
  if (data && data.users) appUsers = data.users;
}

function getUserName(id) {
  const u = appUsers.find(u => u.id === id);
  return u ? u.displayName : id;
}

function refreshCurrentPageFromCloud() {
  if (!isManager()) return;
  const renderName = 'render_' + currentPage.replace(/-/g, '_');
  if (typeof window[renderName] === 'function') {
    window[renderName]();
  }
}

async function initApp() {
  if (!requireAuth()) return;
  const user = getUser();

  if (user.mustChangePassword) {
    document.getElementById('changePwModal').classList.add('show');
  }

  document.getElementById('sbUserName').textContent = user.displayName;
  document.getElementById('sbUserRole').textContent = user.role;

  buildSidebar();

  if (isManager()) await loadUsers();

  navigateTo('dashboard');

  if (isManager()) {
    setInterval(refreshCurrentPageFromCloud, 30000);
  }
}

document.addEventListener('DOMContentLoaded', initApp);
