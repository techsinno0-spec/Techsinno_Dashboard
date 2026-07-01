function cleanBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function headerValue(request, name) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || '';
}

function redirectBaseFromRequest(request) {
  const configured = cleanBase(process.env.SOCIAL_REDIRECT_BASE);
  if (configured) return configured;

  const forwardedHost = headerValue(request, 'x-forwarded-host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (headerValue(request, 'x-forwarded-proto') || 'https').split(',')[0].trim();
    if (host) return `${proto}://${host}`;
  }

  const host = headerValue(request, 'host');
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `https://${host}`;
  }

  try {
    const origin = new URL(request.url).origin;
    if (origin && origin !== 'null') return cleanBase(origin);
  } catch {}

  return 'http://localhost:7071';
}

module.exports = { redirectBaseFromRequest };
