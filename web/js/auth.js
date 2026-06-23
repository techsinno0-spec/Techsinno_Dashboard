function getToken() {
  return localStorage.getItem('ts_token');
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('ts_user'));
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
  localStorage.removeItem('ts_token');
  localStorage.removeItem('ts_user');
  window.location.href = 'index.html';
}
async function changePassword(currentPassword, newPassword) {
  const data = await apiPost('/auth/change-password', { currentPassword, newPassword });
  return data;
}
