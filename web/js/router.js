const NAV_CONFIG = [
  { section: 'Overview' },
  { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', roles: ['manager', 'staff', 'viewer'] },
  { id: 'tasks', icon: 'ti-checklist', label: 'Weekly tasks', roles: ['manager', 'staff', 'viewer'], taskView: 'weekly' },
  { section: 'Business', roles: ['manager'] },
  { id: 'goals', icon: 'ti-target', label: '90-day goals', roles: ['manager'] },
  { id: 'zoho', icon: 'ti-chart-bar', label: 'Zoho Books', roles: ['owner'] },
  { id: 'social', icon: 'ti-share', label: 'Social Media', roles: ['manager'] },
  { id: 'inboxes', icon: 'ti-inbox', label: 'All Inboxes', roles: ['manager'] },
  { section: 'Admin' },
  { id: 'reminders', icon: 'ti-bell', label: 'Reminders', roles: ['manager', 'staff', 'viewer'] },
  { id: 'settings', icon: 'ti-settings', label: 'Settings', roles: ['owner'] },
  { id: 'communications', icon: 'ti-messages', label: 'Communications', roles: ['manager'] },
  { section: 'Automation' },
  { id: 'agent', icon: 'ti-robot', label: 'AI Agent', roles: ['manager', 'staff', 'viewer'] },
  { section: 'Mail', roles: ['manager'] },
  { id: 'mail-zoho', target: 'inboxes', icon: 'ti-mail', label: 'Zoho Mail', roles: ['manager'], provider: 'zoho_mail' },
  { id: 'mail-gmail', target: 'inboxes', icon: 'ti-brand-gmail', label: 'Gmail', roles: ['manager'], provider: 'gmail' },
  { id: 'mail-outlook', target: 'inboxes', icon: 'ti-mail', label: 'Outlook', roles: ['manager'], provider: 'outlook' },
  { section: 'Production' },
  { id: 'job-cards', icon: 'ti-tool', label: 'Job Tasks', roles: ['manager', 'staff', 'viewer'] },
  { section: 'Team', roles: ['manager'] },
  { id: 'team-tasks', target: 'tasks', icon: 'ti-checklist', label: 'Team Tasks', roles: ['manager', 'staff', 'viewer'], taskView: 'team' },
  { id: 'team', icon: 'ti-users', label: 'Team Mgmt', roles: ['owner'] },
  { id: 'staff-activity', icon: 'ti-activity', label: 'Staff Activity', roles: ['manager'] },
  { id: 'task-reports', icon: 'ti-report-analytics', label: 'Task Reports', roles: ['manager'] },
  { section: 'Manager Tools', roles: ['manager'] },
  { id: 'crm', icon: 'ti-address-book', label: 'CRM', roles: ['manager'] },
  { id: 'quotes', icon: 'ti-file-invoice', label: 'Quotes', roles: ['manager'] },
  { id: 'templates', icon: 'ti-template', label: 'Templates', roles: ['manager'] },
  { id: 'marketing', icon: 'ti-speakerphone', label: 'Marketing', roles: ['manager'] },
];

let currentPage = 'dashboard';
let currentNavId = 'dashboard';

function buildSidebar() {
  const role = getUser().role;
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  NAV_CONFIG.forEach(item => {
    if (item.section) {
      if (item.roles && !canAccessRole(item.roles)) return;
      const sec = document.createElement('div');
      sec.className = 'nav-sec';
      sec.textContent = item.section;
      nav.appendChild(sec);
      return;
    }
    if (!canAccessRole(item.roles)) return;
    const targetPage = item.target || item.id;
    const el = document.createElement('div');
    el.className = 'nav-item' + (item.id === currentNavId ? ' active' : '');
    el.dataset.page = item.id;
    el.innerHTML = `<i class="ti ${item.icon}"></i>${item.label}`;
    el.addEventListener('click', () => navigateTo(targetPage, { navId: item.id, provider: item.provider, taskView: item.taskView }));
    nav.appendChild(el);
  });
}

function navigateTo(pageId, opts = {}) {
  const role = getUser().role;
  const navItem = NAV_CONFIG.find(n => n.id === (opts.navId || pageId));
  if (navItem && !canAccessRole(navItem.roles)) return;

  currentPage = pageId;
  currentNavId = opts.navId || pageId;
  if (opts.provider) window._pendingEmailProvider = opts.provider;
  else if (pageId !== 'inboxes') window._pendingEmailProvider = null;
  if (opts.taskView) window._taskView = opts.taskView;
  else if (pageId !== 'tasks') window._taskView = null;

  const sidebar = document.getElementById('sidebarEl');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === currentNavId);
  });

  const titles = {
    'dashboard': ['Dashboard', 'TECHSINNO (Pty) Ltd · Reg: 2022/364165/07'],
    'tasks': ['Weekly tasks', isManager() ? 'Evenings & weekends · 8–12 hrs/week' : 'Your assigned tasks'],
    'job-cards': ['Job Tasks', isManager() ? 'Active jobs · deadlines · parts · AI job cards from Zoho' : 'Your assigned job cards'],
    'projects': ['Team Tasks', isManager() ? 'Assign & track team tasks' : 'Your assigned projects'],
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
    'communications': ['Communications', 'Quote, meeting & web requests'],
    'agent': ['AI Agent', 'Operational assistant'],
    'team': ['Team Management', 'Manage staff accounts'],
    'staff-activity': ['Staff Activity', 'Monitor team activity'],
    'task-reports': ['Task Reports', 'Team performance & analytics'],
  };

  if (pageId === 'tasks') {
    titles.tasks = [
      window._taskView === 'team' ? 'Team Tasks' : 'Weekly tasks',
      window._taskView === 'team' ? 'Assign & track team tasks' : (isManager() ? 'Evenings & weekends · 8–12 hrs/week' : 'Your assigned tasks')
    ];
  }
  if (pageId === 'inboxes') {
    const providerTitle = { gmail: 'Gmail', outlook: 'Outlook', zoho_mail: 'Zoho Mail' }[window._pendingEmailProvider];
    titles.inboxes = providerTitle ? [providerTitle, 'Dedicated mailbox'] : ['All Inboxes', 'Unified email'];
  }

  const t = titles[pageId] || [pageId, ''];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSub').textContent = t[1];

  const renderName = 'render_' + pageId.replace(/-/g, '_');
  if (typeof window[renderName] === 'function') {
    window[renderName]();
  }
}
