// ════════════════════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ════════════════════════════════════════════════════════════════════════

let currentUser = null;

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
// PASSWORD STRENGTH INDICATOR (KEPT FOR REFERENCE, NO COLORS/MESSAGES)
// ════════════════════════════════════════════════════════════════════════

// Username live check COMPLETELY REMOVED — no colors, no messages

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
        currentUser = data.user;
        setTimeout(() => {
          loadDashboard(data.user);
        }, 800);
      }
    } catch (err) {
      showAlert('login-error', 'Could not connect to server', 'error');
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
      showAlert('reg-error', 'Could not connect to server', 'error');
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

// Chat button
const chatBtn = document.getElementById('chat-btn');
if (chatBtn) {
  chatBtn.addEventListener('click', () => {
    showPage('page-chat');
    loadChatPage();
  });
}

// Back from chat
const backFromChat = document.getElementById('back-from-chat');
if (backFromChat) {
  backFromChat.addEventListener('click', () => {
    showPage('page-dashboard');
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
// CHAT FEATURE
// ════════════════════════════════════════════════════════════════════════

function loadChatPage() {
  const searchInput = document.getElementById('user-search');
  const searchBtn = document.getElementById('search-btn');

  if (searchBtn) {
    searchBtn.addEventListener('click', searchUsers);
  }
  
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchUsers();
    });
  }
}

async function searchUsers() {
  const searchInput = document.getElementById('user-search');
  const query = searchInput.value.trim();

  if (!query || query.length < 1) {
    alert('Enter a username to search');
    return;
  }

  try {
    const res = await fetch(`/api/search-users/${query}?exclude=${currentUser.id}`);
    const data = await res.json();

    const resultsList = document.getElementById('search-results');
    resultsList.innerHTML = '';

    if (data.users.length === 0) {
      resultsList.innerHTML = '<p style="color: var(--muted); text-align: center;">No users found</p>';
      return;
    }

    data.users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'user-card';
      userDiv.innerHTML = `
        <div>
          <div style="font-weight: 600;">${user.first_name} ${user.last_name}</div>
          <div style="color: var(--muted); font-size: 0.9rem;">@${user.username}</div>
        </div>
        <button class="btn-add-friend" data-user-id="${user.id}">
          Add Friend
        </button>
      `;
      resultsList.appendChild(userDiv);

      const addBtn = userDiv.querySelector('.btn-add-friend');
      addBtn.addEventListener('click', () => sendFriendRequest(user.id, user.username));
    });
  } catch (err) {
    alert('Error searching users');
  }
}

async function sendFriendRequest(recipientId, username) {
  try {
    const res = await fetch('/api/send-friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: currentUser.id,
        recipient_id: recipientId
      })
    });

    const data = await res.json();

    if (res.ok) {
      alert(`Friend request sent to @${username}`);
    } else {
      alert(data.error || 'Error sending request');
    }
  } catch (err) {
    alert('Error sending friend request');
  }
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
    currentUser = null;
    showPage('page-login');
    loginForm.reset();
    clearFieldErrors();
  });
}

// ════════════════════════════════════════════════════════════════════════
// INITIALIZE
// ════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  showPage('page-login');
});
