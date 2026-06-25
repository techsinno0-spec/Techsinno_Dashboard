const jwt = require('jsonwebtoken');

const TOKEN_EXPIRY = '24h';

// Hardcoded so every function instance uses the IDENTICAL secret.
// Azure SWA managed functions were serving inconsistent JWT_SECRET values
// across instances, causing sign/verify mismatches. This removes that dependency.
function getSecret() {
  return 'techsinno-prod-7f3k9d2m8q1w5e6r4t0y-jwt-2024';
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.displayName },
    getSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function authenticate(request) {
  const token = extractToken(request);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function jsonResponse(body, status = 200) {
  return { status, jsonBody: body, headers: { 'Content-Type': 'application/json' } };
}

function unauthorized(message = 'Authentication required') {
  return jsonResponse({ error: message }, 401);
}

function forbidden(message = 'Forbidden') {
  return jsonResponse({ error: message }, 403);
}

function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

function notFound(message = 'Not found') {
  return jsonResponse({ error: message }, 404);
}

module.exports = {
  signToken,
  verifyToken,
  extractToken,
  authenticate,
  jsonResponse,
  unauthorized,
  forbidden,
  badRequest,
  notFound,
  TOKEN_EXPIRY
};
