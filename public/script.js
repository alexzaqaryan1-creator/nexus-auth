// ════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════

let currentUser = null;
let currentConvoUser = null;
let currentGroupId = null;
let messagePolling = null;
let lastTypingSent = 0;
let audioRecorder = null;
let audioChunks = [];

// ════════════════════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ════════════════════════════════════════════════════════════════════════

function showPage(pageId) {
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }
  stopRecording();
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const page = document.getElementById(pageId);
  if (page) {
    page.style.display = (pageId === 'page-convo' || pageId === 'page-group-convo') ? 'flex' : 'block';
  }
}

// ════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════════════════════════

function showAlert(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-err').forEach(el => el.textContent = '');
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// Render message content based on type
function renderMessageContent(msg) {
  const type = msg.type || 'text';
  const content = msg.message;

  if (type === 'image') {
    return `<img src="${content}" alt="Image" loading="lazy">`;
  }
  if (type === 'gif') {
    return `<img src="${content}" alt="GIF" loading="lazy">`;
  }
  if (type === 'audio') {
    return `<audio controls src="${content}"></audio>`;
  }
  // Escape HTML for text messages
  const escaped = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped;
}

// ════════════════════════════════════════════════════════════════════════
// PASSWORD TOGGLE
// ════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.getAttribute('data-target'));
    if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Hide'; }
    else { input.type = 'password'; btn.textContent = 'Show'; }
  });
});

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
    if (!username) { showFieldError('err-login-username', 'Username is required'); valid = false; }
    if (!password) { showFieldError('err-login-password', 'Password is required'); valid = false; }
    if (!valid) return;

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
        localStorage.setItem('nexus_user', JSON.stringify(data.user));
        setTimeout(() => loadDashboard(data.user), 800);
      }
    } catch (err) {
      showAlert('login-error', 'Could not connect to server', 'error');
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
    if (password && confirm && password !== confirm) { showFieldError('err-confirm', 'Passwords do not match'); valid = false; }
    if (!valid) return;

    const regBtn = document.getElementById('reg-btn');
    regBtn.disabled = true;
    regBtn.querySelector('.btn-text').textContent = 'Creating...';

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
        setTimeout(() => showPage('page-login'), 1500);
      }
    } catch (err) {
      showAlert('reg-error', 'Could not connect to server', 'error');
    } finally {
      regBtn.disabled = false;
      regBtn.querySelector('.btn-text').textContent = 'Create Account';
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// NAVIGATION BUTTONS
// ════════════════════════════════════════════════════════════════════════

document.getElementById('go-register')?.addEventListener('click', () => {
  hideAlert('login-error'); hideAlert('login-success'); clearFieldErrors();
  showPage('page-register');
});

document.getElementById('go-login-from-reg')?.addEventListener('click', () => {
  hideAlert('reg-error'); hideAlert('reg-success'); clearFieldErrors();
  showPage('page-login');
});

document.getElementById('chat-btn')?.addEventListener('click', () => {
  showPage('page-chat');
  loadChatPage();
});

document.getElementById('back-from-chat')?.addEventListener('click', () => showPage('page-dashboard'));
document.getElementById('back-from-convo')?.addEventListener('click', () => { showPage('page-chat'); loadChatPage(); });
document.getElementById('back-from-group-convo')?.addEventListener('click', () => { showPage('page-chat'); loadChatPage(); });

// ════════════════════════════════════════════════════════════════════════
// CHAT TABS
// ════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.chat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab)?.classList.add('active');
  });
});

// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════

function loadDashboard(user) {
  const fullName = `${user.first_name} ${user.last_name}`;
  const initials = (user.first_name[0] || '') + (user.last_name[0] || '');

  document.getElementById('wc-avatar').textContent   = initials.toUpperCase();
  document.getElementById('wc-greeting').textContent = getGreeting() + ',';
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

// ════════════════════════════════════════════════════════════════════════
// CHAT PAGE
// ════════════════════════════════════════════════════════════════════════

async function loadChatPage() {
  await Promise.all([loadFriendsList(), loadNotifications(), loadGroupsList()]);
  setupSearch();
}

// ════════════════════════════════════════════════════════════════════════
// FRIENDS LIST
// ════════════════════════════════════════════════════════════════════════

async function loadFriendsList() {
  const container = document.getElementById('friends-list');
  try {
    const res = await fetch(`/api/friends/${currentUser.id}`);
    const data = await res.json();

    if (data.friends.length === 0) {
      container.innerHTML = '<p class="empty-msg">No friends yet. Search for users and add them!</p>';
      return;
    }

    container.innerHTML = '';
    data.friends.forEach(friend => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-info">
          <div class="user-card-name">${friend.first_name} ${friend.last_name}</div>
          <div class="user-card-handle">@${friend.username}</div>
        </div>
        <div class="user-card-actions">
          <button class="btn-sm chat-open">Chat</button>
        </div>
      `;
      card.querySelector('.chat-open').addEventListener('click', () => openConversation(friend));
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = '<p class="empty-msg">Error loading friends</p>';
  }
}

// ════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (Friend Requests)
// ════════════════════════════════════════════════════════════════════════

async function loadNotifications() {
  const container = document.getElementById('requests-list');
  const badge = document.getElementById('req-badge');

  try {
    const res = await fetch(`/api/notifications/${currentUser.id}`);
    const data = await res.json();

    if (data.notifications.length === 0) {
      container.innerHTML = '<p class="empty-msg">No pending requests.</p>';
      badge.classList.add('hidden');
      return;
    }

    badge.textContent = data.notifications.length;
    badge.classList.remove('hidden');

    container.innerHTML = '';
    data.notifications.forEach(req => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-info">
          <div class="user-card-name">${req.first_name} ${req.last_name}</div>
          <div class="user-card-handle">@${req.username}</div>
        </div>
        <div class="user-card-actions">
          <button class="btn-sm success">Accept</button>
          <button class="btn-sm danger">Decline</button>
        </div>
      `;
      card.querySelector('.success').addEventListener('click', () => acceptRequest(req.id));
      card.querySelector('.danger').addEventListener('click', () => declineRequest(req.id));
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = '<p class="empty-msg">Error loading requests</p>';
  }
}

async function acceptRequest(requestId) {
  try {
    const res = await fetch('/api/accept-friend-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId })
    });
    if (res.ok) await Promise.all([loadNotifications(), loadFriendsList()]);
  } catch (err) { /* ignore */ }
}

async function declineRequest(requestId) {
  try {
    const res = await fetch('/api/decline-friend-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId })
    });
    if (res.ok) await loadNotifications();
  } catch (err) { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════════════
// SEARCH USERS
// ════════════════════════════════════════════════════════════════════════

function setupSearch() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('user-search');
  const newBtn = searchBtn.cloneNode(true);
  searchBtn.parentNode.replaceChild(newBtn, searchBtn);
  const newInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newInput, searchInput);
  newBtn.addEventListener('click', searchUsers);
  newInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchUsers(); });
}

async function searchUsers() {
  const query = document.getElementById('user-search').value.trim();
  if (!query) return;
  const container = document.getElementById('search-results');

  try {
    const res = await fetch(`/api/search-users/${encodeURIComponent(query)}?exclude=${currentUser.id}`);
    const data = await res.json();

    if (data.users.length === 0) { container.innerHTML = '<p class="empty-msg">No users found</p>'; return; }

    container.innerHTML = '';
    data.users.forEach(user => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-info">
          <div class="user-card-name">${user.first_name} ${user.last_name}</div>
          <div class="user-card-handle">@${user.username}</div>
        </div>
        <div class="user-card-actions"><button class="btn-sm primary">Add Friend</button></div>
      `;
      card.querySelector('.btn-sm').addEventListener('click', async (e) => {
        const btn = e.target;
        try {
          const res = await fetch('/api/send-friend-request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: currentUser.id, recipient_id: user.id })
          });
          const data = await res.json();
          btn.textContent = res.ok ? 'Sent!' : (data.error || 'Error');
          btn.disabled = true;
        } catch (err) { btn.textContent = 'Error'; }
      });
      container.appendChild(card);
    });
  } catch (err) { container.innerHTML = '<p class="empty-msg">Error searching</p>'; }
}

// ════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ════════════════════════════════════════════════════════════════════════

function notifyTyping(recipientId) {
  if (Date.now() - lastTypingSent < 2000) return;
  lastTypingSent = Date.now();
  fetch('/api/typing', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender_id: currentUser.id, recipient_id: recipientId })
  }).catch(() => {});
}

async function checkTypingStatus(otherId, indicatorId) {
  try {
    const res = await fetch(`/api/typing-status/${currentUser.id}/${otherId}`);
    const data = await res.json();
    const el = document.getElementById(indicatorId);
    if (el) {
      if (data.typing) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  } catch (err) { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════════════
// MEDIA HELPERS
// ════════════════════════════════════════════════════════════════════════

function fileToBase64(file, maxSizeMB) {
  return new Promise((resolve, reject) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      reject(new Error(`File too large. Max ${maxSizeMB}MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════════════════════════════════════════
// AUDIO RECORDING
// ════════════════════════════════════════════════════════════════════════

function stopRecording() {
  if (audioRecorder && audioRecorder.state !== 'inactive') {
    audioRecorder.stop();
  }
  audioRecorder = null;
  audioChunks = [];
  document.querySelectorAll('.media-btn.recording').forEach(b => b.classList.remove('recording'));
}

function setupAudioRecording(btnId, onComplete) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (audioRecorder && audioRecorder.state === 'recording') {
      // Stop recording
      audioRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      audioRecorder = new MediaRecorder(stream);

      audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

      audioRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('recording');
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onComplete(reader.result);
        reader.readAsDataURL(blob);
        audioRecorder = null;
        audioChunks = [];
      };

      audioRecorder.start();
      btn.classList.add('recording');
    } catch (err) {
      alert('Could not access microphone. Please allow microphone access.');
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// DIRECT MESSAGE CONVERSATION
// ════════════════════════════════════════════════════════════════════════

function openConversation(friend) {
  currentConvoUser = friend;
  document.getElementById('convo-title').textContent = `${friend.first_name} ${friend.last_name}`;
  showPage('page-convo');
  loadMessages();

  // Poll messages + typing every 2s
  messagePolling = setInterval(() => {
    loadMessages();
    checkTypingStatus(currentConvoUser.id, 'convo-typing');
  }, 2000);

  // Wire up text send
  wireButton('convo-send', () => sendDM());
  wireInput('convo-input', () => sendDM(), () => notifyTyping(friend.id));

  // Wire up image
  wireButton('convo-img-btn', () => document.getElementById('convo-img-input').click());
  wireFileInput('convo-img-input', 5, (b64) => sendDM(b64, 'image'));

  // Wire up audio
  setupAudioRecording('convo-audio-btn', async (b64) => {
    await sendDM(b64, 'audio');
  });
}

async function loadMessages() {
  if (!currentConvoUser) return;
  const container = document.getElementById('convo-messages');
  const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 30;

  try {
    const res = await fetch(`/api/messages/${currentUser.id}/${currentConvoUser.id}`);
    const data = await res.json();

    container.innerHTML = '';
    if (data.messages.length === 0) {
      container.innerHTML = '<p class="empty-msg">No messages yet. Say hello!</p>';
      return;
    }

    data.messages.forEach(msg => {
      const isMine = msg.sender_id === currentUser.id;
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble ${isMine ? 'sent' : 'received'}`;
      bubble.innerHTML = `${renderMessageContent(msg)}<div class="msg-meta">${formatTime(msg.created_at)}</div>`;
      container.appendChild(bubble);
    });

    if (wasAtBottom) container.scrollTop = container.scrollHeight;
  } catch (err) { /* ignore */ }
}

async function sendDM(content, type) {
  const msgType = type || 'text';
  let message = content;

  if (msgType === 'text') {
    const input = document.getElementById('convo-input');
    message = input.value.trim();
    if (!message) return;
    input.value = '';
  }

  await fetch('/api/send-message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender_id: currentUser.id, recipient_id: currentConvoUser.id, message, type: msgType })
  });
  await loadMessages();
  document.getElementById('convo-messages').scrollTop = document.getElementById('convo-messages').scrollHeight;
}

// ════════════════════════════════════════════════════════════════════════
// GROUP CHATS
// ════════════════════════════════════════════════════════════════════════

async function loadGroupsList() {
  const container = document.getElementById('groups-list');
  try {
    const res = await fetch(`/api/groups/${currentUser.id}`);
    const data = await res.json();

    if (data.groups.length === 0) {
      container.innerHTML = '<p class="empty-msg">No group chats yet.</p>';
      return;
    }

    container.innerHTML = '';
    data.groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-info">
          <div class="user-card-name">${group.name}</div>
          <div class="user-card-handle">Group Chat</div>
        </div>
        <div class="user-card-actions"><button class="btn-sm chat-open">Open</button></div>
      `;
      card.querySelector('.chat-open').addEventListener('click', () => openGroupConvo(group));
      container.appendChild(card);
    });
  } catch (err) { container.innerHTML = '<p class="empty-msg">Error loading groups</p>'; }
}

// Create Group Modal
document.getElementById('create-group-btn')?.addEventListener('click', async () => {
  const modal = document.getElementById('modal-create-group');
  const checkboxContainer = document.getElementById('group-friend-checkboxes');
  document.getElementById('group-name-input').value = '';

  try {
    const res = await fetch(`/api/friends/${currentUser.id}`);
    const data = await res.json();

    if (data.friends.length === 0) {
      checkboxContainer.innerHTML = '<p class="empty-msg" style="margin:0;">Add friends first to create a group.</p>';
    } else {
      checkboxContainer.innerHTML = '';
      data.friends.forEach(friend => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `<input type="checkbox" value="${friend.id}"><span>${friend.first_name} ${friend.last_name} (@${friend.username})</span>`;
        checkboxContainer.appendChild(label);
      });
    }
  } catch (err) { checkboxContainer.innerHTML = '<p class="empty-msg" style="margin:0;">Error loading friends</p>'; }
  modal.classList.remove('hidden');
});

document.getElementById('modal-create-group-cancel')?.addEventListener('click', () => {
  document.getElementById('modal-create-group').classList.add('hidden');
});

document.getElementById('modal-create-group-ok')?.addEventListener('click', async () => {
  const name = document.getElementById('group-name-input').value.trim();
  const checkboxes = document.querySelectorAll('#group-friend-checkboxes input[type="checkbox"]:checked');
  const memberIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  if (!name) { alert('Please enter a group name'); return; }
  if (memberIds.length === 0) { alert('Select at least one friend'); return; }

  try {
    const res = await fetch('/api/create-group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, creator_id: currentUser.id, member_ids: memberIds })
    });
    if (res.ok) { document.getElementById('modal-create-group').classList.add('hidden'); await loadGroupsList(); }
    else { const data = await res.json(); alert(data.error || 'Error creating group'); }
  } catch (err) { alert('Error creating group'); }
});

// ════════════════════════════════════════════════════════════════════════
// GROUP CONVERSATION
// ════════════════════════════════════════════════════════════════════════

function openGroupConvo(group) {
  currentGroupId = group.id;
  document.getElementById('group-convo-title').textContent = group.name;
  showPage('page-group-convo');
  loadGroupMessages();

  messagePolling = setInterval(loadGroupMessages, 2000);

  wireButton('group-convo-send', () => sendGroupMsg());
  wireInput('group-convo-input', () => sendGroupMsg());

  // Image
  wireButton('group-img-btn', () => document.getElementById('group-img-input').click());
  wireFileInput('group-img-input', 5, (b64) => sendGroupMsg(b64, 'image'));

  // Audio
  setupAudioRecording('group-audio-btn', async (b64) => { await sendGroupMsg(b64, 'audio'); });
}

async function loadGroupMessages() {
  if (!currentGroupId) return;
  const container = document.getElementById('group-convo-messages');
  const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 30;

  try {
    const res = await fetch(`/api/group-messages/${currentGroupId}`);
    const data = await res.json();

    container.innerHTML = '';
    if (data.messages.length === 0) {
      container.innerHTML = '<p class="empty-msg">No messages yet. Start the conversation!</p>';
      return;
    }

    data.messages.forEach(msg => {
      const isMine = msg.sender_id === currentUser.id;
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble ${isMine ? 'sent' : 'received'}`;
      bubble.innerHTML = `
        ${!isMine ? `<div class="msg-sender">${msg.first_name}</div>` : ''}
        ${renderMessageContent(msg)}
        <div class="msg-meta">${formatTime(msg.created_at)}</div>
      `;
      container.appendChild(bubble);
    });

    if (wasAtBottom) container.scrollTop = container.scrollHeight;
  } catch (err) { /* ignore */ }
}

async function sendGroupMsg(content, type) {
  const msgType = type || 'text';
  let message = content;

  if (msgType === 'text') {
    const input = document.getElementById('group-convo-input');
    message = input.value.trim();
    if (!message) return;
    input.value = '';
  }

  await fetch('/api/send-group-message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_id: currentGroupId, sender_id: currentUser.id, message, type: msgType })
  });
  await loadGroupMessages();
  document.getElementById('group-convo-messages').scrollTop = document.getElementById('group-convo-messages').scrollHeight;
}

// ════════════════════════════════════════════════════════════════════════
// WIRING HELPERS (clone to remove old listeners)
// ════════════════════════════════════════════════════════════════════════

function wireButton(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener('click', handler);
}

function wireInput(id, enterHandler, inputHandler) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  if (enterHandler) clone.addEventListener('keypress', (e) => { if (e.key === 'Enter') enterHandler(); });
  if (inputHandler) clone.addEventListener('input', inputHandler);
}

function wireFileInput(id, maxSizeMB, onBase64) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener('change', async () => {
    const file = clone.files[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file, maxSizeMB);
      await onBase64(b64);
    } catch (err) { alert(err.message); }
    clone.value = '';
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
    const el = document.getElementById('live-clock');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ════════════════════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════════════════════════

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (clockInterval) clearInterval(clockInterval);
  if (messagePolling) clearInterval(messagePolling);
  stopRecording();
  currentUser = null;
  currentConvoUser = null;
  currentGroupId = null;
  localStorage.removeItem('nexus_user');
  showPage('page-login');
  loginForm?.reset();
  clearFieldErrors();
});

// ════════════════════════════════════════════════════════════════════════
// INITIALIZE
// ════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('nexus_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      loadDashboard(currentUser);
      return;
    } catch (e) {
      localStorage.removeItem('nexus_user');
    }
  }
  showPage('page-login');
});
