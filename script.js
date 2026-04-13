// ════════════════════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ════════════════════════════════════════════════════════════════════════

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
  });
  document.getElementById(pageId).style.display = 'block';
}

// ════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════════════════════════

function showAlert(id, message, type) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function hideAlert(id) {
  const el = document.getElementById(id);
  el.classList.add('hidden');
}

function setLoading(btnId, loaderId, isLoading) {
  const btn = document.getElementById(btnId);
  const loader = document.getElementById(loaderId);
  const text = btn.querySelector('.btn-text');
  if (isLoading) {
    btn.disabled = true;
    loader.classList.remove('hidden');
    text.style.opacity = '0';
  } else {
    btn.disabled = false;
    loader.classList.add('hidden');
    text.style.opacity = '1';
  }
}

function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-err').forEach(el => {
    el.textContent = '';
  });
}

// ════════════════════════════════════════════════════════════════════════
// PASSWORD TOGGLE (Show / Hide)
// ════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// PASSWORD STRENGTH INDICATOR
// ════════════════════════════════════════════════════════════════════════

function checkStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const regPassword = document.getElementById('reg-password');
if (regPassword) {
  regPassword.addEventListener('input', () => {
    const val = regPassword.value;
    const score = checkStrength(val);
    const segs = ['s1', 's2', 's3', 's4'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    segs.forEach((id, i) => {
      const seg = document.getElementById(id);
      if (i < score) {
        seg.style.background = colors[score - 1];
      } else {
        seg.style.background = '#e5e7eb';
      }
    });

    const label = document.getElementById('strength-label');
    if (label) label.textContent = val.length > 0 ? labels[score] : '';
  });
}

// ════════════════════════════════════════════════════════════════════════
// USERNAME LIVE AVAILABILITY CHECK
// ════════════════════════════════════════════════════════════════════════

let usernameCheckTimer = null;

const regUsername = document.getElementById('reg-username');
if (regUsername) {
  regUsername.addEventListener('input', () => {
    const val = regUsername.value.trim();
    const statusEl = document.getElementById('username-status');

    clearTimeout(usernameCheckTimer);

    if (val.length < 3) {
      statusEl.textContent = '';
      statusEl.className = 'username-status';
      return;
    }

    statusEl.textContent = 'Checking...';
    statusEl.className = 'username-status checking';

    usernameCheckTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-username/${val}`);
        const data = await res.json();
        if (data.available) {
          statusEl.textContent = 'Available';
          statusEl.className = 'username-status available';
        } else {
          statusEl.textContent = 'Taken';
          statusEl.className = 'username-status taken';
        }
      } catch (err) {
        statusEl.textContent = '';
      }
    }, 500);
  });
}

// ════════════════════════════════════════════════════════════════════════
// LOGIN FORM
// ════════════════════════════════════════════════════════════════════════

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();
    hideAlert('login-error');
    hideAlert('login-success');

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    let valid = true;

    if (!username) {
      showFieldError('err-login-username', 'Username is required');
      valid = false;
    }

    if (!password) {
      showFieldError('err-login-password', 'Password is required');
      valid = false;
    }

    if (!valid) return;

    setLoading('login-btn', 'login-btn', true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert('login-error', data.error || 'Login failed', 'error');
      } else {
        showAlert('login-success', 'Login successful! Redirecting...', 'success');
        setTimeout(() => {
          loadDashboard(data.user);
        }, 800);
      }
    } catch (err) {
      showAlert('login-error', 'Could not connect to server. Is it running?', 'error');
    } finally {
      setLoading('login-btn', 'login-btn', false);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// REGISTER FORM
// ════════════════════════════════════════════════════════════════════════

const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();
    hideAlert('reg-error');
    hideAlert('reg-success');

    const first_name = document.getElementById('reg-firstname').value.trim();
    const last_name  = document.getElementById('reg-lastname').value.trim();
    const username   = document.getElementById('reg-username').value.trim();
    const email      = document.getElementById('reg-email').value.trim();
    const dob        = document.getElementById('reg-dob').value;
    const password   = document.getElementById('reg-password').value;
    const confirm    = document.getElementById('reg-confirm').value;

    let valid = true;

    if (!first_name) { showFieldError('err-firstname', 'First name is required'); valid = false; }
    if (!last_name)  { showFieldError('err-lastname', 'Last name is required'); valid = false; }
    if (!username)   { showFieldError('err-username', 'Username is required'); valid = false; }
    if (!email)      { showFieldError('err-email', 'Email is required'); valid = false; }
    if (!dob)        { showFieldError('err-dob', 'Date of birth is required'); valid = false; }
    if (!password)   { showFieldError('err-reg-password', 'Password is required'); valid = false; }

    if (password && confirm && password !== confirm) {
      showFieldError('err-confirm', 'Passwords do not match');
      valid = false;
    }

    if (!valid) return;

    const regBtn = document.getElementById('reg-btn');
    regBtn.disabled = true;
    const btnText = regBtn.querySelector('.btn-text');
    btnText.textContent = 'Creating...';

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name, last_name, username, email, dob, password, confirm })
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert('reg-error', data.error || 'Registration failed', 'error');
      } else {
        showAlert('reg-success', 'Account created! Redirecting to login...', 'success');
        registerForm.reset();
        setTimeout(() => {
          showPage('page-login');
        }, 1500);
      }
    } catch (err) {
      showAlert('reg-error', 'Could not connect to server. Is it running?', 'error');
    } finally {
      regBtn.disabled = false;
      btnText.textContent = 'Create Account';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ════════════════════════════════════════════════════════════════════════

const goRegister = document.getElementById('go-register');
if (goRegister) {
  goRegister.addEventListener('click', () => {
    hideAlert('login-error');
    hideAlert('login-success');
    clearFieldErrors();
    showPage('page-register');
  });
}

const goLoginFromReg = document.getElementById('go-login-from-reg');
if (goLoginFromReg) {
  goLoginFromReg.addEventListener('click', () => {
    hideAlert('reg-error');
    hideAlert('reg-success');
    clearFieldErrors();
    showPage('page-login');
  });
}

// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════

function loadDashboard(user) {
  const greeting = getGreeting();
  const fullName = `${user.first_name} ${user.last_name}`;
  const initials = (user.first_name[0] || '') + (user.last_name[0] || '');

  document.getElementById('wc-avatar').textContent   = initials.toUpperCase();
  document.getElementById('wc-greeting').textContent = greeting + ',';
  document.getElementById('wc-name').textContent     = fullName;
  document.getElementById('wc-handle').textContent   = '@' + user.username;
  document.getElementById('nav-username').textContent = '@' + user.username;
  document.getElementById('info-email').textContent  = user.email;
  document.getElementById('info-dob').textContent    = formatDate(user.dob);
  document.getElementById('info-joined').textContent = formatDate(user.joined_at);
  document.getElementById('info-id').textContent     = 'ID #' + user.id;

  showPage('page-dashboard');
  startClock();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// ════════════════════════════════════════════════════════════════════════
// LIVE CLOCK
// ════════════════════════════════════════════════════════════════════════

let clockInterval = null;

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const clockEl = document.getElementById('live-clock');
    if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ════════════════════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════════════════════════

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    if (clockInterval) clearInterval(clockInterval);
    showPage('page-login');
    loginForm.reset();
    clearFieldErrors();
  });
}

// ════════════════════════════════════════════════════════════════════════
// INITIALIZE — Show login page on load
// ════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  showPage('page-login');
});
