// TEMPORARY DIAGNOSTIC — delete this file once login works.
const { app } = require('@azure/functions');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

app.http('debug-auth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/debug',
  handler: async (request) => {
    const secret = process.env.JWT_SECRET;
    const out = {
      jwtSecretLength: secret ? secret.length : 0,
      // one-way hash: exposes nothing about the value, but lets us detect whether
      // different function instances are running with different secrets
      jwtSecretFingerprint: secret ? crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10) : null,
      cosmosPresent: !!process.env.COSMOS_CONNECTION_STRING
    };
    // Intra-instance self-test: sign + verify within THIS call. Should always be OK.
    if (secret) {
      try { jwt.verify(jwt.sign({ t: 1 }, secret, { expiresIn: '5m' }), secret); out.selfTest = 'OK'; }
      catch (e) { out.selfTest = 'FAILED: ' + e.message; }
    }
    // Verify the caller's real login token (may have been signed on a DIFFERENT instance)
    const h = request.headers.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    out.tokenProvided = !!token;
    if (token && secret) {
      try { const d = jwt.verify(token, secret); out.verifyLoginToken = 'OK'; out.role = d.role; }
      catch (err) { out.verifyLoginToken = 'FAILED'; out.verifyError = err.name; }
    }
    return { status: 200, jsonBody: out, headers: { 'Content-Type': 'application/json' } };
  }
});
