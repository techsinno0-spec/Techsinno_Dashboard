const crypto = require('crypto');
const { createItem, deleteItem, getItem } = require('./cosmos');

const STATE_TTL_MS = 15 * 60 * 1000;

function encodeState(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeState(state) {
  return JSON.parse(Buffer.from(state, 'base64url').toString());
}

async function createOAuthState(provider, decoded, context = {}) {
  const sid = crypto.randomBytes(24).toString('base64url');
  const id = `oauth_state_${sid}`;
  const now = Date.now();
  await createItem('config', {
    id,
    service: 'oauth_state',
    provider,
    userId: decoded.sub,
    role: decoded.role,
    accountRole: decoded.accountRole || decoded.role,
    isOwner: !!(decoded.isOwner || decoded.accountRole === 'owner'),
    context,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + STATE_TTL_MS).toISOString()
  });
  return encodeState({ sid });
}

async function readOAuthState(state, expectedProvider) {
  if (!state) throw new Error('Missing OAuth state');
  const payload = decodeState(state);
  if (!payload.sid) throw new Error('Malformed OAuth state');
  const id = `oauth_state_${payload.sid}`;
  const saved = await getItem('config', id);
  await deleteItem('config', id).catch(() => {});
  if (!saved || saved.provider !== expectedProvider) throw new Error('OAuth state does not match this connection');
  if (saved.expiresAt && new Date(saved.expiresAt).getTime() < Date.now()) throw new Error('OAuth state expired — start the connection again');
  return saved;
}

module.exports = { createOAuthState, readOAuthState };
