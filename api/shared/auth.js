const jwt = require('jsonwebtoken');

const TOKEN_EXPIRY = '24h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
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
