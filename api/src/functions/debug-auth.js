// TEMPORARY FORENSIC DIAGNOSTIC — delete once login works.
const { app } = require('@azure/functions');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

app.http('debug-auth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/debug',
  handler: async (request) => {
    const secret = process.env.JWT_SECRET || '';
    const out = {
      secretLen: secret.length,
      secretFp: crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10),
      jwtLibVersion: (() => { try { return require('jsonwebtoken/package.json').version; } catch { return '?'; } })()
    };
    try {
      const { signToken, verifyToken } = require('../../shared/auth');
      verifyToken(signToken({ id: 'x', role: 'manager', displayName: 'X' }));
      out.sharedRoundTrip = 'OK';
    } catch (e) { out.sharedRoundTrip = 'FAILED:' + e.message; }

    const h = request.headers.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (token) {
      const p = token.split('.');
      out.parts = p.length;
      try { out.alg = JSON.parse(Buffer.from(p[0], 'base64url').toString()).alg; } catch { out.alg = '?'; }
      const expected = crypto.createHmac('sha256', secret).update(p[0] + '.' + p[1]).digest('base64url');
      out.manualHmacMatch = (expected === p[2]);
      out.sigHead = p[2] ? p[2].slice(0, 14) : null;
      out.expectedHead = expected.slice(0, 14);
      try { jwt.verify(token, secret); out.jwtVerify = 'OK'; }
      catch (e) { out.jwtVerify = 'FAILED:' + e.name; }
    }
    return { status: 200, jsonBody: out, headers: { 'Content-Type': 'application/json' } };
  }
});
