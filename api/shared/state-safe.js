const MAX_ARRAY_ITEMS = 1500;
const MAX_OBJECT_KEYS = 150;
const MAX_STRING_LENGTH = 8000;
const MAX_DEPTH = 8;

const STATE_KEYS = [
  'planning',
  'dashboard',
  'production',
  'communications',
  'ai',
  'mail',
  'settings_public'
];

function cleanStateValue(value, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map(v => cleanStateValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).slice(0, MAX_OBJECT_KEYS).forEach(([key, val]) => {
      out[String(key).slice(0, 100)] = cleanStateValue(val, depth + 1);
    });
    return out;
  }
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return null;
}

module.exports = { STATE_KEYS, cleanStateValue };
