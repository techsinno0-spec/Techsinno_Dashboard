// TEMPORARY DIAGNOSTIC — DELETE THIS FILE once login works.
// Place at: api/src/functions/debug-auth.js
// Call it from the browser console AFTER logging in:
//   fetch('/api/auth/debug',{headers:{Authorization:'Bearer '+localStorage.getItem('ts_token')}}).then(async r=>console.log(await r.text()))
// It reports whether the running function can SEE JWT_SECRET and whether it can
// VERIFY your freshly-issued token — without ever exposing the secret's value.
const { app } = require('@azure/functions');
const jwt = require('jsonwebtoken');

app.http('debug-auth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/debug',
  handler: async (request) => {
    const secret = process.env.JWT_SECRET;
    const out = {
      jwtSecretPresent: !!secret,
      jwtSecretLength: secret ? secret.length : 0,   // length only, never the value
      cosmosPresent: !!process.env.COSMOS_CONNECTION_STRING,
      dbName: process.env.COSMOS_DB_NAME || '(unset)'
    };

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    out.tokenProvided = !!token;

    if (token && secret) {
      try {
        const decoded = jwt.verify(token, secret);
        out.verify = 'OK';
        out.decodedRole = decoded.role;
      } catch (err) {
        out.verify = 'FAILED';
        out.verifyError = err.name;        // e.g. JsonWebTokenError (bad signature) / TokenExpiredError
        out.verifyMessage = err.message;
      }
    }

    return { status: 200, jsonBody: out, headers: { 'Content-Type': 'application/json' } };
  }
});
