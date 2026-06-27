const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginBtn');
const loginError = document.getElementById('loginErr');

function resetLoginButton() {
  loginButton.disabled = false;
  loginButton.textContent = 'Sign In';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!username || !password) {
    loginError.textContent = 'Please enter company email and password';
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = 'Signing in...';
  loginError.textContent = '';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : { error: `Login service returned an invalid response (${response.status})` };

    if (!response.ok || data.error || !data.token || !data.user) {
      loginError.textContent = data.error || 'Login failed';
      resetLoginButton();
      return;
    }

    localStorage.setItem('ts_token', data.token);
    localStorage.setItem('ts_user', JSON.stringify(data.user));
    window.location.href = 'app.html';
  } catch {
    loginError.textContent = 'Cannot reach the login service. Please try again.';
    resetLoginButton();
  }
});

if (localStorage.getItem('ts_token') && localStorage.getItem('ts_user')) {
  window.location.href = 'app.html';
}
