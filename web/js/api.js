const API_BASE = '';

let _refreshing = null;

function getTokenExpiry() {
  const token = sessionStorage.getItem('ts_token');
  if (!token) return 0;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp || 0) * 1000;
  } catch { return 0; }
}

async function ensureToken() {
  const expiry = getTokenExpiry();
  if (!expiry) return;
  const remaining = expiry - Date.now();
  if (remaining > 3600000) return;
  if (remaining <= 0) {
    sessionStorage.removeItem('ts_token');
    sessionStorage.removeItem('ts_user');
    window.location.href = 'index.html';
    return;
  }
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const token = sessionStorage.getItem('ts_token');
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          sessionStorage.setItem('ts_token', data.token);
          if (data.user) sessionStorage.setItem('ts_user', JSON.stringify(data.user));
        }
      }
    } catch {} finally { _refreshing = null; }
  })();
  return _refreshing;
}

async function apiCall(method, path, body = null) {
  await ensureToken();
  const token = sessionStorage.getItem('ts_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}/api${path}`, opts);
  if (res.status === 401) {
    sessionStorage.removeItem('ts_token');
    sessionStorage.removeItem('ts_user');
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
