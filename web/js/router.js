const NAV_CONFIG = [
  { section: 'Overview', icon: 'ti-compass', color: '#5fa8c4' },
  { id: 'dashboard', icon: 'ti-layout-dashboard', color: '#5fa8c4', label: 'Dashboard', roles: ['manager', 'staff', 'viewer'] },
  { id: 'tasks', icon: 'ti-checklist', color: '#3fb950', label: 'Weekly tasks', roles: ['manager', 'staff', 'viewer'], taskView: 'weekly' },
  { section: 'Business', icon: 'ti-briefcase', color: '#f4a300', roles: ['manager'] },
  { id: 'goals', icon: 'ti-target', color: '#f4a300', label: '90-day goals', roles: ['manager'] },
  { id: 'zoho', icon: 'ti-chart-bar', color: '#3fb950', label: 'Zoho Books', roles: ['owner'] },
  { id: 'social', icon: 'ti-share', color: '#0a66c2', label: 'Social Media', roles: ['manager'] },
  { id: 'inboxes', icon: 'ti-inbox', color: '#5fa8c4', label: 'All Inboxes', roles: ['manager'] },
  { section: 'Admin', icon: 'ti-shield-cog', color: '#a371f7' },
  { id: 'reminders', icon: 'ti-bell', color: '#f4a300', label: 'Reminders', roles: ['manager', 'staff', 'viewer'] },
  { id: 'settings', icon: 'ti-settings', color: '#8b949e', label: 'Settings', roles: ['owner'] },
  { id: 'communications', icon: 'ti-messages', color: '#5fa8c4', label: 'Communications', roles: ['manager'] },
  { section: 'Automation', icon: 'ti-sparkles', color: '#a371f7' },
  { id: 'agent', icon: 'ti-robot', color: '#a371f7', label: 'AI Agent', roles: ['manager', 'staff', 'viewer'] },
  { section: 'Mail', icon: 'ti-mailbox', color: '#5fa8c4', roles: ['manager'] },
  { id: 'mail-zoho', target: 'inboxes', icon: 'ti-mail', color: '#ffbf00', label: 'Zoho Mail', roles: ['manager'], provider: 'zoho_mail' },
  { id: 'mail-gmail', target: 'inboxes', icon: 'ti-brand-gmail', color: '#ea4335', label: 'Gmail', roles: ['manager'], provider: 'gmail' },
  { id: 'mail-outlook', target: 'inboxes', icon: 'ti-mail', color: '#0078d4', label: 'Outlook', roles: ['manager'], provider: 'outlook' },
  { section: 'Production', icon: 'ti-tools', color: '#ff8a65' },
  { id: 'job-cards', icon: 'ti-tool', color: '#ff8a65', label: 'Job Tasks', roles: ['manager', 'staff', 'viewer'] },
  { section: 'Team', icon: 'ti-users-group', color: '#5fa8c4', roles: ['manager'] },
  { id: 'team-tasks', target: 'tasks', icon: 'ti-checklist', color: '#3fb950', label: 'Team Tasks', roles: ['manager', 'staff', 'viewer'], taskView: 'team' },
  { id: 'team', icon: 'ti-users', color: '#5fa8c4', label: 'Team Mgmt', roles: ['owner'] },
  { id: 'staff-activity', icon: 'ti-activity', color: '#3fb950', label: 'Staff Activity', roles: ['manager'] },
  { id: 'task-reports', icon: 'ti-report-analytics', color: '#f4a300', label: 'Task Reports', roles: ['manager'] },
  { section: 'Manager Tools', icon: 'ti-tool', color: '#f4a300', roles: ['manager'] },
  { id: 'crm', icon: 'ti-address-book', color: '#5fa8c4', label: 'CRM', roles: ['manager'] },
  { id: 'quotes', icon: 'ti-file-invoice', color: '#f4a300', label: 'Quotes', roles: ['manager'] },
  { id: 'templates', icon: 'ti-template', color: '#a371f7', label: 'Templates', roles: ['manager'] },
  { id: 'marketing', icon: 'ti-speakerphone', color: '#ff8a65', label: 'Marketing', roles: ['manager'] },
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
      sec.innerHTML = `${item.icon ? `<i class="ti ${item.icon}" style="color:${item.color || 'var(--brand-mid)'}"></i>` : ''}<span>${item.section}</span>`;
      nav.appendChild(sec);
      return;
    }
    if (!canAccessRole(item.roles)) return;
    const targetPage = item.target || item.id;
    const el = document.createElement('div');
    el.className = 'nav-item' + (item.id === currentNavId ? ' active' : '');
    el.dataset.page = item.id;
    el.innerHTML = `<i class="ti ${item.icon}" style="color:${item.color || 'var(--brand-mid)'}"></i>${item.label}`;
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
