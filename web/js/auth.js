function getToken() {
  return sessionStorage.getItem('ts_token');
}

function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('ts_user'));
  } catch {
    return null;
  }
}

function isManager() {
  const u = getUser();
  return u && u.role === 'manager';
}

function isStaff() {
  const u = getUser();
  return u && u.role === 'staff';
}

function requireAuth() {
  if (!getToken() || !getUser()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function logout() {
  sessionStorage.removeItem('ts_token');
  sessionStorage.removeItem('ts_user');
  window.location.href = 'index.html';
}

async function changePassword(currentPassword, newPassword) {
  const data = await apiPost('/auth/change-password', { currentPassword, newPassword });
  return data;
}
