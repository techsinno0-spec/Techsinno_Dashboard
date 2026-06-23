const { getItem, createItem, replaceItem } = require('./cosmos');

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 900; // 15 minutes

async function checkLoginRateLimit(username) {
  const id = `rl_${username.toLowerCase()}`;
  let record;
  try {
    record = await getItem('config', id);
  } catch { record = null; }

  if (!record) return { allowed: true };

  const now = Math.floor(Date.now() / 1000);
  if (now - record.windowStart > WINDOW_SECONDS) return { allowed: true };
  if (record.attempts >= MAX_ATTEMPTS) {
    const remaining = WINDOW_SECONDS - (now - record.windowStart);
    return { allowed: false, retryAfter: remaining };
  }
  return { allowed: true };
}

async function recordFailedLogin(username) {
  const id = `rl_${username.toLowerCase()}`;
  const now = Math.floor(Date.now() / 1000);
  let record;
  try {
    record = await getItem('config', id);
  } catch { record = null; }

  if (!record || now - record.windowStart > WINDOW_SECONDS) {
    const doc = { id, windowStart: now, attempts: 1, ttl: WINDOW_SECONDS + 60 };
    try {
      if (record) await replaceItem('config', id, doc);
      else await createItem('config', doc);
    } catch {}
    return;
  }

  record.attempts += 1;
  record.ttl = WINDOW_SECONDS + 60;
  try { await replaceItem('config', id, record); } catch {}
}

async function clearLoginRateLimit(username) {
  const id = `rl_${username.toLowerCase()}`;
  try {
    const { getContainer } = require('./cosmos');
    const container = await getContainer('config');
    await container.item(id, id).delete();
  } catch {}
}

module.exports = { checkLoginRateLimit, recordFailedLogin, clearLoginRateLimit };
