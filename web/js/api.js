const API_BASE = '';
let _refreshing = null;

async function ensureToken() {
  const token = localStorage.getItem('ts_token');
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = (payload.exp || 0) * 1000;
    if (!expiry) return;
    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      localStorage.removeItem('ts_token');
      localStorage.removeItem('ts_user');
      window.location.href = 'index.html';
    }
  } catch {
    return;
  }
}

async function apiCall(method, path, body = null) {
  await ensureToken();
  const token = localStorage.getItem('ts_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Techsinno-Token'] = token;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}/api${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem('ts_token');
    localStorage.removeItem('ts_user');
    window.location.href = 'index.html';
    return null;
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `Server error (${res.status})` };
  }
}

function apiGet(path) { return apiCall('GET', path); }
function apiPost(path, body) { return apiCall('POST', path, body); }
function apiPut(path, body) { return apiCall('PUT', path, body); }
function apiDelete(path) { return apiCall('DELETE', path); }
