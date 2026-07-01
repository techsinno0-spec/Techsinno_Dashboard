function cleanBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

const DEFAULT_PUBLIC_BASE = 'https://nice-bay-095935e10.7.azurestaticapps.net';

function headerValue(request, name) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || '';
}

function isLocalBase(base) {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base || '');
}

function isInternalAzureFunctionsBase(base) {
  try {
    return /\.azurewebsites\.net$/i.test(new URL(base || DEFAULT_PUBLIC_BASE).hostname);
  } catch {
    return false;
  }
}

function publicBase(base) {
  const cleaned = cleanBase(base);
  if (!cleaned || cleaned === 'null' || cleaned.startsWith('file:')) return '';
  if (isInternalAzureFunctionsBase(cleaned)) return '';
  return cleaned;
}

function publicOriginFromHeader(request, name) {
  const raw = headerValue(request, name);
  if (!raw) return '';
  try {
    return publicBase(new URL(raw.split(',')[0].trim()).origin);
  } catch {
    return '';
  }
}

function redirectBaseFromRequest(request) {
  const configured = cleanBase(
    process.env.SOCIAL_REDIRECT_BASE ||
    process.env.PUBLIC_DASHBOARD_URL ||
    process.env.STATIC_WEB_APP_URL ||
    process.env.TECHSINNO_PUBLIC_URL
  );
  if (configured) return configured;

  const originBase = publicOriginFromHeader(request, 'origin');
  if (originBase) return originBase;

  const refererBase = publicOriginFromHeader(request, 'referer');
  if (refererBase) return refererBase;

  const forwardedHost = headerValue(request, 'x-forwarded-host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (headerValue(request, 'x-forwarded-proto') || 'https').split(',')[0].trim();
    const base = publicBase(`${proto}://${host}`);
    if (base) return base;
  }

  const host = headerValue(request, 'host');
  if (host) {
    const hostBase = `https://${host}`;
    const base = publicBase(hostBase);
    if (base) return base;
    if (isLocalBase(hostBase)) return hostBase;
  }

  try {
    const origin = new URL(request.url).origin;
    const base = publicBase(origin);
    if (base) return base;
    if (isLocalBase(origin)) return cleanBase(origin);
  } catch {}

  return DEFAULT_PUBLIC_BASE;
}

module.exports = { redirectBaseFromRequest };
