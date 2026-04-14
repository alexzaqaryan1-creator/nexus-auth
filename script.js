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
// PASSWORD TOGGLE
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
// SIMPLE PASSWORD CHECK (NO COLORS)
// ════════════════════════════════════════════════════════════════════════

const regPassword = document.getElementById('reg-password');

if (regPassword) {
  regPassword.addEventListener('input', () => {
    const label = document.getElementById('strength-label');

    if (regPassword.value.length > 0 && regPassword.value.length < 6) {
      label.textContent = 'Password too short';
    } else {
      label.textContent = '';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// USERNAME CHECK (FIXED)
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

    usernameCheckTimer = setTimeout(async () => {
      try {
        const res = await fetch(`https://nexus-auth-yulh.onrender.com/api/check-username/${val}`);
        const data = await res.json();

        if (data.available) {
          statusEl.textContent = 'Available';
        } else {
          statusEl.textContent = 'Taken';
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
        showAlert('login-success', 'Login successful!', 'success');
        setTimeout(() => {
          loadDashboard(data.user);
        }, 800);
      }
    } catch {
      showAlert('login-error', 'Server error', 'error');
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

    if (!first_name) { showFieldError('err-firstname', 'Required'); valid = false; }
    if (!last_name)  { showFieldError('err-lastname', 'Required'); valid = false; }
    if (!username)   { showFieldError('err-username', 'Required'); valid = false; }
    if (!email)      { showFieldError('err-email', 'Required'); valid = false; }
    if (!dob)        { showFieldError('err-dob', 'Required'); valid = false; }
    if (!password)   { showFieldError('err-reg-password', 'Required'); valid = false; }

    if (password !== confirm) {
      showFieldError('err-confirm', 'Passwords do not match');
      valid = false;
    }

    if (!valid) return;

    const regBtn = document.getElementById('reg-btn');
    regBtn.disabled = true;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name, last_name, username, email, dob, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert('reg-error', data.error || 'Error', 'error');
      } else {
        showAlert('reg-success', 'Account created!', 'success');
        registerForm.reset();
        setTimeout(() => showPage('page-login'), 1200);
      }
    } catch {
      showAlert('reg-error', 'Server error', 'error');
    } finally {
      regBtn.disabled = false;
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  showPage('page-login');
});