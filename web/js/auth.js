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
  return u && (u.role === 'manager' || u.role === 'owner');
}
function isOwner() {
  const u = getUser();
  return u && u.role === 'owner';
}
function isStaff() {
  const u = getUser();
  return u && u.role === 'staff';
}
function canAccessRole(roles) {
  const u = getUser();
  if (!u) return false;
  if (!roles || !roles.length) return true;
  if (u.role === 'owner') return roles.includes('owner') || roles.includes('manager') || roles.includes('staff') || roles.includes('viewer');
  return roles.includes(u.role);
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
