const { app } = require('@azure/functions');
const { authenticate, jsonResponse, unauthorized, forbidden } = require('../../shared/auth');
const { getEmailConfig } = require('../../shared/email');

const TECHSINNO_ZOHO_ALIASES = [
  { address: 'frank@techsinno.com', name: 'Frank', isDefault: true },
  { address: 'info@techsinno.com', name: 'Info', isDefault: false },
  { address: 'sales@techsinno.com', name: 'Sales', isDefault: false }
];

function mergeTechsinnoAliases(aliases = []) {
  const existing = Array.isArray(aliases) ? aliases.filter(a => a?.address) : [];
  const byAddress = new Map(existing.map(a => [String(a.address).toLowerCase(), a]));
  TECHSINNO_ZOHO_ALIASES.forEach(alias => {
    if (!byAddress.has(alias.address)) byAddress.set(alias.address, alias);
  });
  return Array.from(byAddress.values());
}

app.http('email-accounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'email/accounts',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (decoded.role !== 'manager') return forbidden();

    const accounts = {};

    const gmail = await getEmailConfig('gmail');
    accounts.gmail = gmail?.accessToken
      ? { connected: true, email: gmail.email || 'Gmail', displayName: gmail.email || 'Gmail User' }
      : { connected: false };

    const outlook = await getEmailConfig('outlook');
    accounts.outlook = outlook?.accessToken
      ? { connected: true, email: outlook.email || 'Outlook', displayName: outlook.email || 'Outlook User' }
      : { connected: false };

    const zoho = await getEmailConfig('zoho_mail');
    accounts.zoho_mail = zoho?.accessToken
      ? { connected: true, email: zoho.email || 'Zoho Mail', displayName: zoho.email || 'Zoho User', aliases: mergeTechsinnoAliases(zoho.aliases) }
      : { connected: false };

    return jsonResponse({ accounts });
  }
});
