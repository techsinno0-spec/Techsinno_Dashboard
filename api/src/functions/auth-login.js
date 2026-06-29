const { app } = require('@azure/functions');
const { queryItems, replaceItem } = require('../../shared/cosmos');
const { verifyPassword } = require('../../shared/password');
const { signToken, jsonResponse, badRequest } = require('../../shared/auth');
const { logActivity } = require('../../shared/activity');
const { checkLoginRateLimit, recordFailedLogin, clearLoginRateLimit } = require('../../shared/rate-limit');

app.http('auth-login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (request) => {
    try {
      const body = await request.json();
      const { username, password } = body;
      if (!username || !password) {
        return badRequest('Company email and password are required');
      }
      const cleanUsername = username.toLowerCase().trim();
      const rateCheck = await checkLoginRateLimit(cleanUsername);
      if (!rateCheck.allowed) {
        return jsonResponse({ error: `Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfter / 60)} minutes.` }, 429);
      }
      let users = await queryItems(
        'users',
        'SELECT * FROM c WHERE (c.username = @username OR c.email = @username) AND c.active = true',
        [{ name: '@username', value: cleanUsername }]
      );
      if (users.length === 0 && cleanUsername === 'frank@techsinno.com') {
        users = await queryItems(
          'users',
          'SELECT * FROM c WHERE c.username = @legacyUsername AND c.active = true',
          [{ name: '@legacyUsername', value: 'frank' }]
        );
      }
      if (users.length === 0) {
        await recordFailedLogin(cleanUsername);
        return jsonResponse({ error: 'Invalid username or password' }, 401);
      }
      const user = users[0];
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        await recordFailedLogin(cleanUsername);
        return jsonResponse({ error: 'Invalid username or password' }, 401);
      }
      const shouldBeOwner =
        user.username === 'frank' ||
        user.username === 'frank@techsinno.com' ||
        user.email === 'frank@techsinno.com';
      if (shouldBeOwner && user.role !== 'owner') {
        user.role = 'owner';
      }
      if (shouldBeOwner && !user.email) {
        user.email = 'frank@techsinno.com';
      }
      await clearLoginRateLimit(cleanUsername);
      const token = signToken(user);
      user.lastLoginAt = new Date().toISOString();
      await replaceItem('users', user.id, user);
      await logActivity(user.id, 'login', `${user.displayName} logged in`);
      return jsonResponse({
        token,
        user: {
          id: user.id, username: user.username, displayName: user.displayName,
          email: user.email, role: user.role, mustChangePassword: user.mustChangePassword || false
        },
        expiresIn: 86400
      });
    } catch (err) {
      return jsonResponse({ error: 'Login failed' }, 500);
    }
  }
});
