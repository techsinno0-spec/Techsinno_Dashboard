const { app } = require('@azure/functions');
const { queryItems, createItem } = require('../../shared/cosmos');
const { hashPassword, validatePasswordStrength } = require('../../shared/password');
const { authenticate, jsonResponse, unauthorized, forbidden, badRequest, isOwner } = require('../../shared/auth');
const { sanitizeString, sanitizeUsername, sanitizeEmail } = require('../../shared/sanitize');
const { v4: uuidv4 } = require('uuid');

app.http('users-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'users',
  handler: async (request) => {
    const decoded = authenticate(request);
    if (!decoded) return unauthorized();
    if (!isOwner(decoded)) return forbidden('Owner access required');

    try {
      const body = await request.json();
      const { username, displayName, email, password, role } = body;
      const identityEmail = sanitizeEmail(email || username || '');

      if (!identityEmail || !displayName || !password) {
        return badRequest('company email, displayName, and password are required');
      }

      const allowedRoles = ['owner', 'manager', 'staff', 'viewer'];
      const userRole = allowedRoles.includes(role) ? role : 'staff';

      const strength = validatePasswordStrength(password);
      if (!strength.valid) return badRequest(strength.reason);

      const cleanUsername = identityEmail.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanUsername)) {
        return badRequest('Use a valid company email address as the login');
      }

      const existing = await queryItems(
        'users',
        'SELECT c.id FROM c WHERE c.username = @username',
        [{ name: '@username', value: cleanUsername }]
      );
      if (existing.length > 0) {
        return badRequest('Username already taken');
      }

      const now = new Date().toISOString();
      const user = {
        id: `usr_${uuidv4()}`,
        username: cleanUsername,
        displayName: sanitizeString(displayName, 100),
        email: identityEmail,
        role: userRole,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null
      };

      await createItem('users', user);

      return jsonResponse({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt
        }
      }, 201);
    } catch (err) {
      return jsonResponse({ error: 'Failed to create user' }, 500);
    }
  }
});
