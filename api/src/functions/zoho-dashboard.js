const { app } = require('@azure/functions');
const { getItem, replaceItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const axios = require('axios');

const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const ZOHO_API_BASE = 'https://www.zohoapis.com/books/v3';

async function ensureZohoToken(config) {
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - 60000) {
    return config.accessToken;
  }
  if (!config.refreshToken) throw new Error('Zoho Books not connected — please connect via Settings');
  const r = await axios.post(ZOHO_TOKEN_URL, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken
    }
  });
  config.accessToken = r.data.access_token;
  config.tokenExpiry = Date.now() + (r.data.expires_in * 1000);
  await replaceItem('config', config.id, config);
  return config.accessToken;
}

app.http('zoho-dashboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zoho/dashboard',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    try {
      let config;
      try { config = await getItem('config', 'cfg_zoho_books'); } catch {}
      if (!config || !config.clientId) {
        return jsonResponse({ error: 'Zoho Books not configured. Go to Settings.' }, 400);
      }

      const token = await ensureZohoToken(config);
      const headers = { Authorization: `Zoho-oauthtoken ${token}` };
      const params = { organization_id: config.orgId };

      const [invoices, expenses, contacts] = await Promise.all([
        axios.get(`${ZOHO_API_BASE}/invoices`, { headers, params: { ...params, status: 'all', per_page: 200 } }),
        axios.get(`${ZOHO_API_BASE}/expenses`, { headers, params: { ...params, per_page: 200 } }),
        axios.get(`${ZOHO_API_BASE}/contacts`, { headers, params: { ...params, per_page: 200 } })
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
      return jsonResponse({ error: err.message || 'Failed to fetch Zoho data' }, 500);
    }
  }
});
