const { app } = require('@azure/functions');
const { getItem } = require('../../shared/cosmos');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, isOwner } = require('../../shared/auth');

const ZOHO_BOOKS_SCOPES = [
  'ZohoBooks.invoices.READ',
  'ZohoBooks.expenses.READ',
  'ZohoBooks.contacts.READ',
  'ZohoBooks.settings.READ'
].join(',');

const ZOHO_BOOKS_REGIONS = {
  com: { accounts: 'https://accounts.zoho.com' },
  eu: { accounts: 'https://accounts.zoho.eu' },
  in: { accounts: 'https://accounts.zoho.in' },
  au: { accounts: 'https://accounts.zoho.com.au' },
  jp: { accounts: 'https://accounts.zoho.jp' }
};

function getRegion(region) {
  return ZOHO_BOOKS_REGIONS[region] || ZOHO_BOOKS_REGIONS.com;
}

async function getBooksConfig() {
  try {
    return await getItem('config', 'cfg_zoho_books');
  } catch {
    return null;
  }
}

app.http('zoho-books-connect', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'zoho-books/connect',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    const cfg = await getBooksConfig();
    const clientId = process.env.ZOHO_BOOKS_CLIENT_ID || cfg?.clientId;
    if (!clientId) return badRequest('Zoho Books Client ID not configured — add it in Settings');

    const base = process.env.SOCIAL_REDIRECT_BASE || 'http://localhost:7071';
    const redirectUri = `${base}/api/zoho-books/callback`;
    const token = request.headers.get('authorization')?.replace('Bearer ', '') || request.headers.get('x-techsinno-token') || '';
    const state = Buffer.from(JSON.stringify({ jwt: token })).toString('base64url');
    const region = getRegion(cfg?.region || 'com');
    const url = `${region.accounts}/oauth/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(ZOHO_BOOKS_SCOPES)}&access_type=offline&prompt=consent&state=${state}`;

    return jsonResponse({ url, redirectUri });
  }
});
