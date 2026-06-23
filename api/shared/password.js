const bcrypt = require('bcryptjs');

const COST_FACTOR = 12;

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, COST_FACTOR);
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must be at most 128 characters' };
  }
  return { valid: true };
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength };
