const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, isOwner } = require('../../shared/auth');
const axios = require('axios');

const ZOHO_BOOKS_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com/books/v3' },
  eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu/books/v3' },
  in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in/books/v3' },
  au: { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au/books/v3' },
  jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp/books/v3' }
};

function getZohoBooksRegion(region) {
  return ZOHO_BOOKS_REGIONS[region] || ZOHO_BOOKS_REGIONS.com;
}

function zohoErrorMessage(err) {
  const data = err?.response?.data || {};
  const detail = data.message || data.error_description || data.error || err.message || 'request failed';
  const status = err?.response?.status ? ` (${err.response.status})` : '';
  return `Zoho Books: ${detail}${status}`;
}

function isOrgMismatchError(err) {
  const data = err?.response?.data || {};
  const detail = [
    data.message,
    data.error_description,
    data.error,
    typeof data === 'string' ? data : '',
    err.message
  ].filter(Boolean).join(' ').toLowerCase();
  return err?.response?.status === 400 && (
    detail.includes('not associated with the companyid') ||
    detail.includes('not associated with the companyname') ||
    detail.includes('not associated with this organization') ||
    detail.includes('organization id')
  );
}

async function ensureZohoToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Zoho Books not connected — please connect via Settings');
  const region = getZohoBooksRegion(config.region || 'com');
  const p = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken
  });
  const r = await axios.post(`${region.accounts}/oauth/v2/token`, p.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  config.accessToken = r.data.access_token;
  config.tokenExpiry = Date.now() + (r.data.expires_in * 1000);
  await replaceItem('config', config.id, config);
  return config.accessToken;
}

async function ensureOrgId(config, headers) {
  if (config.orgId) return config.orgId;
  return refreshOrgId(config, headers);
}

async function refreshOrgId(config, headers) {
  const region = getZohoBooksRegion(config.region || 'com');
  const orgs = await axios.get(`${region.api}/organizations`, { headers });
  const org = (orgs.data.organizations || [])[0];
  if (!org?.organization_id) throw new Error('No Zoho Books organization found for this account');
  config.orgId = org.organization_id;
  config.orgName = org.name;
  await replaceItem('config', config.id, config);
  return config.orgId;
}

async function zohoBooksGet(apiBase, headers, config, path, params = {}) {
  const orgId = await ensureOrgId(config, headers);
  const request = (organizationId) => axios.get(`${apiBase}${path}`, {
    headers,
    params: { organization_id: organizationId, ...params }
  });

  try {
    return await request(orgId);
  } catch (err) {
    if (isOrgMismatchError(err)) {
      const freshOrgId = await refreshOrgId(config, headers);
      return request(freshOrgId);
    }
    throw err;
  }
}

app.http('zoho-dashboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zoho/dashboard',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    try {
      let config;
      try { config = await getItem('config', 'cfg_zoho_books'); } catch {}
      if (!config || !config.clientId) {
        return jsonResponse({ error: 'Zoho Books not configured. Go to Settings.' }, 400);
      }

      const token = await ensureZohoToken(config);
      const headers = { Authorization: `Zoho-oauthtoken ${token}` };
      const apiBase = getZohoBooksRegion(config.region || 'com').api;

      const [invoices, expenses, contacts] = await Promise.all([
        zohoBooksGet(apiBase, headers, config, '/invoices', { per_page: 200 }),
        zohoBooksGet(apiBase, headers, config, '/expenses', { per_page: 200 }),
        zohoBooksGet(apiBase, headers, config, '/contacts', { per_page: 200 })
      ]);

      const invList = invoices.data.invoices || [];
      const expList = expenses.data.expenses || [];

      const totalInvoiced = invList.reduce((s, i) => s + (i.total || 0), 0);
      const totalReceived = invList.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
      const totalOverdue = invList.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.balance || 0), 0);
      const totalUnpaid = invList.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.balance || 0), 0);
      const totalExpenses = expList.reduce((s, e) => s + (e.total || 0), 0);
      const netProfit = totalReceived - totalExpenses;

      const overdueInvoices = invList
        .filter(i => i.status === 'overdue')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 10)
        .map(i => ({ number: i.invoice_number, client: i.customer_name, amount: i.balance, due: i.due_date, status: i.status }));

      const recentInvoices = invList
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10)
        .map(i => ({ number: i.invoice_number, client: i.customer_name, amount: i.total, date: i.date, status: i.status }));

      const recentExpenses = expList
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8)
        .map(e => ({ desc: e.description || e.account_name, amount: e.total, date: e.date, category: e.account_name }));

      const clientCount = (contacts.data.contacts || []).filter(c => c.contact_type === 'customer').length;

      return jsonResponse({
        success: true,
        summary: { totalInvoiced, totalReceived, totalOverdue, totalUnpaid, totalExpenses, netProfit, clientCount },
        overdueInvoices,
        recentInvoices,
        recentExpenses
      });
    } catch (err) {
      return jsonResponse({ error: zohoErrorMessage(err) }, 500);
    }
  }
});
