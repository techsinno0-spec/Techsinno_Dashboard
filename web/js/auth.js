const isElectronApp = !!window.techsinno;
let electronUser = null;

async function hydrateElectronAuth() {
  if (!isElectronApp) return;
  electronUser = await window.techsinno.authGetUser();
}

function getToken() {
  if (isElectronApp) return electronUser ? 'electron-session' : null;
  return localStorage.getItem('ts_token');
}
function getUser() {
  if (isElectronApp) return electronUser;
  try {
    return JSON.parse(localStorage.getItem('ts_user'));
  } catch {
    return null;
  }
}
function setCurrentUser(user) {
  if (isElectronApp) {
    electronUser = user;
    return;
  }
  localStorage.setItem('ts_user', JSON.stringify(user));
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
    window.location.href = isElectronApp ? '../src/login.html' : 'index.html';
    return false;
  }
  return true;
}
function logout() {
  if (isElectronApp) {
    window.techsinno.authLogout();
    return;
  }
  localStorage.removeItem('ts_token');
  localStorage.removeItem('ts_user');
  window.location.href = 'index.html';
}
async function changePassword(currentPassword, newPassword) {
  const data = await apiPost('/auth/change-password', { currentPassword, newPassword });
  return data;
}
