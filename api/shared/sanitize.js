function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

function sanitizeUsername(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
}

function sanitizeEmail(str) {
  if (typeof str !== 'string') return '';
  const clean = str.trim().toLowerCase().slice(0, 254);
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return '';
  return clean;
}

module.exports = { sanitizeString, sanitizeUsername, sanitizeEmail };
