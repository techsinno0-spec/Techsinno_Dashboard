const SECRET_FIELDS = [
  'clientSecret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'token',
  'privateKey'
];

const CONFIG_SERVICES = [
  'zoho_books',
  'zoho_mail',
  'gmail',
  'outlook',
  'linkedin',
  'claude',
  'hunter',
  'cloudflare',
  'onedrive',
  'goals_private',
  'account_details'
];

function hasSecret(config) {
  return SECRET_FIELDS.some(field => !!config[field]);
}

function safeConfig(config, service) {
  const src = config || {};
  const safe = { ...src, service: service || src.service };

  SECRET_FIELDS.forEach(field => {
    if (safe[field]) safe[`has${field[0].toUpperCase()}${field.slice(1)}`] = true;
    delete safe[field];
  });

  safe.configured = !!(
    src.connected ||
    src.clientId ||
    src.orgId ||
    src.zoneId ||
    src.accountId ||
    src.region ||
    src.personalUrl ||
    src.goals ||
    src.companyName ||
    src.email ||
    hasSecret(src)
  );
  safe.connected = !!(src.connected || src.accessToken || src.refreshToken);

  return safe;
}

module.exports = { CONFIG_SERVICES, SECRET_FIELDS, safeConfig };
