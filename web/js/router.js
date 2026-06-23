const NAV_CONFIG = [
  { section: 'Overview' },
  { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', roles: ['manager', 'staff'] },
  { id: 'tasks', icon: 'ti-checklist', label: 'My Tasks', roles: ['manager', 'staff'] },
  { section: 'Business', roles: ['manager'] },
  { id: 'crm', icon: 'ti-address-book', label: 'CRM', roles: ['manager'] },
  { id: 'quotes', icon: 'ti-file-invoice', label: 'Quotes', roles: ['manager'] },
  { id: 'goals', icon: 'ti-target', label: '90-Day Goals', roles: ['manager'] },
  { id: 'zoho', icon: 'ti-chart-bar', label: 'Zoho Books', roles: ['manager'] },
  { id: 'social', icon: 'ti-share', label: 'Social Media', roles: ['manager'] },
  { id: 'marketing', icon: 'ti-speakerphone', label: 'Marketing', roles: ['manager'] },
  { id: 'inboxes', icon: 'ti-inbox', label: 'All Inboxes', roles: ['manager'] },
  { section: 'Admin' },
  { id: 'reminders', icon: 'ti-bell', label: 'Reminders', roles: ['manager', 'staff'] },
  { id: 'templates', icon: 'ti-template', label: 'Templates', roles: ['manager'] },
  { id: 'settings', icon: 'ti-settings', label: 'Settings', roles: ['manager'] },
  { id: 'communications', icon: 'ti-messages', label: 'Communications', roles: ['manager'] },
  { section: 'Tools' },
  { id: 'agent', icon: 'ti-robot', label: 'AI Agent', roles: ['manager', 'staff'] },
  { section: 'Team', roles: ['manager'] },
  { id: 'team', icon: 'ti-users', label: 'Team', roles: ['manager'] },
  { id: 'staff-activity', icon: 'ti-activity', label: 'Staff Activity', roles: ['manager'] },
  { id: 'task-reports', icon: 'ti-report-analytics', label: 'Task Reports', roles: ['manager'] },
];

let currentPage = 'dashboard';

function buildSidebar() {
  const role = getUser().role;
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  NAV_CONFIG.forEach(item => {
    if (item.section) {
      if (item.roles && !item.roles.includes(role)) return;
      const sec = document.createElement('div');
      sec.className = 'nav-sec';
      sec.textContent = item.section;
      nav.appendChild(sec);
      return;
    }
    if (!item.roles.includes(role)) return;
    const el = document.createElement('div');
    el.className = 'nav-item' + (item.id === currentPage ? ' active' : '');
    el.dataset.page = item.id;
    el.innerHTML = `<i class="ti ${item.icon}"></i>${item.label}`;
    el.addEventListener('click', () => navigateTo(item.id));
    nav.appendChild(el);
  });
}

function navigateTo(pageId) {
  const role = getUser().role;
  const navItem = NAV_CONFIG.find(n => n.id === pageId);
  if (navItem && !navItem.roles.includes(role)) return;

  currentPage = pageId;

  const sidebar = document.getElementById('sidebarEl');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageId);
  });

  const titles = {
    'dashboard': ['Dashboard', 'Overview'],
    'tasks': ['Tasks', isManager() ? 'Manage & assign tasks' : 'Your assigned tasks'],
    'goals': ['90-Day Goals', 'Foundation → Traction → Scale'],
    'zoho': ['Zoho Books', 'Financial dashboard'],
    'crm': ['CRM', 'Client pipeline & lead tracking'],
    'quotes': ['Quotes', 'Proposals & invoicing'],
    'social': ['Social Media', 'Post to LinkedIn, Facebook & Instagram'],
    'marketing': ['Marketing', 'Campaigns, analytics & outreach'],
    'inboxes': ['All Inboxes', 'Unified email'],
    'reminders': ['Reminders', 'Schedule & deadlines'],
    'templates': ['Templates', 'Reusable email & outreach templates'],
    'settings': ['Settings', 'API credentials & config'],
    'communications': ['Communications', 'Email & templates'],
    'agent': ['AI Agent', 'Operational assistant'],
    'team': ['Team Management', 'Manage staff accounts'],
    'staff-activity': ['Staff Activity', 'Monitor team activity'],
    'task-reports': ['Task Reports', 'Team performance & analytics'],
  };

  const t = titles[pageId] || [pageId, ''];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSub').textContent = t[1];

  if (typeof window['render_' + pageId] === 'function') {
    window['render_' + pageId]();
  }
}
