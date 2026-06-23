const { createItem } = require('./cosmos');
const { v4: uuidv4 } = require('uuid');

async function logActivity(userId, action, details, targetId = null) {
  try {
    await createItem('activity', {
      id: `act_${uuidv4()}`,
      userId,
      action,
      details,
      targetId,
      timestamp: new Date().toISOString(),
      ttl: 7776000
    });
  } catch {
    // Activity logging is best-effort — never block the main operation
  }
}

module.exports = { logActivity };
