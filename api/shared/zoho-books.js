const axios = require('axios');
const { getItem, replaceItem } = require('./cosmos');

// Read-only Zoho Books access shared by the AI agent (chat tools), the
// scheduled scan (bookkeeper watchdog) and the morning briefing.
// Uses the same cfg_zoho_books config document that zoho-dashboard.js uses,
// so a single OAuth connection in Settings powers everything.

const ZOHO_BOOKS_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com/books/v3' },
  eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu/books/v3' },
  in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in/books/v3' },
  au: { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au/books/v3' },
  jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp/books/v3' }
};

function getBooksRegion(region) {
  return ZOHO_BOOKS_REGIONS[region] || ZOHO_BOOKS_REGIONS.com;
}

async function getBooksConfig() {
  try {
    return await getItem('config', 'cfg_zoho_books');
  } catch {
    return null;
  }
}

function booksConfigured(config) {
  return !!(config && config.clientId && (config.refreshToken || config.accessToken));
}

async function ensureBooksToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Zoho Books not connected — please connect via Settings');
  const region = getBooksRegion(config.region || 'com');
  const p = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken
  });
  const r = await axios.post(`${region.accounts}/oauth/v2/token`, p.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!r.data.access_token) throw new Error(r.data.error || 'Zoho Books token refresh failed');
  config.accessToken = r.data.access_token;
  config.tokenExpiry = Date.now() + (r.data.expires_in * 1000);
  await replaceItem('config', config.id, config);
  return config.accessToken;
}

async function ensureBooksOrgId(config, headers) {
  if (config.orgId) return config.orgId;
  const region = getBooksRegion(config.region || 'com');
  const orgs = await axios.get(`${region.api}/organizations`, { headers });
  const org = (orgs.data.organizations || [])[0];
  if (!org?.organization_id) throw new Error('No Zoho Books organization found for this account');
  config.orgId = org.organization_id;
  config.orgName = org.name;
  await replaceItem('config', config.id, config);
  return config.orgId;
}

async function booksGet(config, path, params = {}) {
  const token = await ensureBooksToken(config);
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const apiBase = getBooksRegion(config.region || 'com').api;
  const orgId = await ensureBooksOrgId(config, headers);
  const res = await axios.get(`${apiBase}${path}`, {
    headers,
    params: { organization_id: orgId, ...params }
  });
  return res.data;
}

function daysBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
}

// One call that returns everything the bookkeeper role needs.
// Throws if Books is configured but the API fails; returns null if
// Books is simply not configured yet (so callers can skip silently).
async function getBooksSnapshot() {
  const config = await getBooksConfig();
  if (!booksConfigured(config)) return null;

  const [invData, expData] = await Promise.all([
    booksGet(config, '/invoices', { status: 'all', per_page: 200 }),
    booksGet(config, '/expenses', { per_page: 200 })
  ]);

  const invList = invData.invoices || [];
  const expList = expData.expenses || [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const totalInvoiced = invList.reduce((s, i) => s + (i.total || 0), 0);
  const totalReceived = invList.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const totalOverdue = invList.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.balance || 0), 0);
  const totalUnpaid = invList.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.balance || 0), 0);
  const totalExpenses = expList.reduce((s, e) => s + (e.total || 0), 0);
  const invoicedThisMonth = invList.filter(i => (i.date || '') >= monthStart).reduce((s, i) => s + (i.total || 0), 0);
  const expensesThisMonth = expList.filter(e => (e.date || '') >= monthStart).reduce((s, e) => s + (e.total || 0), 0);

  const overdueInvoices = invList
    .filter(i => i.status === 'overdue')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .map(i => ({
      number: i.invoice_number,
      client: i.customer_name,
      balance: i.balance,
      total: i.total,
      due: i.due_date,
      daysOverdue: daysBetween(i.due_date, now) || 0
    }));

  const unpaidInvoices = invList
    .filter(i => i.status === 'sent')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .map(i => ({
      number: i.invoice_number,
      client: i.customer_name,
      balance: i.balance,
      total: i.total,
      due: i.due_date
    }));

  const recentInvoices = invList
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(i => ({ number: i.invoice_number, client: i.customer_name, total: i.total, date: i.date, status: i.status }));

  const recentExpenses = expList
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(e => ({ desc: e.description || e.account_name, amount: e.total, date: e.date, category: e.account_name }));

  return {
    orgName: config.orgName || '',
    currency: 'ZAR',
    summary: {
      totalInvoiced,
      totalReceived,
      totalOverdue,
      totalUnpaid,
      totalExpenses,
      netProfit: totalReceived - totalExpenses,
      invoicedThisMonth,
      expensesThisMonth,
      overdueCount: overdueInvoices.length,
      unpaidCount: unpaidInvoices.length
    },
    overdueInvoices,
    unpaidInvoices,
    recentInvoices,
    recentExpenses
  };
}

module.exports = {
  getBooksConfig,
  booksConfigured,
  getBooksRegion,
  ensureBooksToken,
  booksGet,
  getBooksSnapshot
};
