// ════════════════════════════════════════════════════════════════════════
// API BASE URL — uses Render backend when hosted on GitHub Pages
// ════════════════════════════════════════════════════════════════════════

const API_BASE = window.location.hostname.includes('github.io')
  ? 'https://nexus-auth-1.onrender.com'
  : '';

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
    return `<img src="${content}" alt="Image">`;
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
      const res = await fetch(API_BASE + '/api/login', {
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
      const res = await fetch(API_BASE + '/api/register', {
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
  // Mark messages as seen
  fetch(API_BASE + '/api/mark-chat-seen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: currentUser.id })
  }).catch(() => {});
  const badge = document.getElementById('chat-unread-badge');
  if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
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
  loadStories();
  loadFeed();
  loadUnreadCount();
  if (unreadPolling) clearInterval(unreadPolling);
  unreadPolling = setInterval(loadUnreadCount, 10000);
}

// ════════════════════════════════════════════════════════════════════════
// STORIES
// ════════════════════════════════════════════════════════════════════════

let storyData = [];       // all story_users from API
let storyUserIdx = 0;     // current user index in viewer
let storyItemIdx = 0;     // current story index within user
let storyTimer = null;
let storyAnimFrame = null;
let storyStartTime = 0;
let storyDuration = 5000;
let storyTextX = 50;   // percent from left
let storyTextY = 75;   // percent from top
let storyTextColor = '#ffffff';
let unreadPolling = null;

// --- Load stories bar on dashboard ---
async function loadStories() {
  const bar = document.getElementById('stories-bar');
  // Keep the "add story" button, remove the rest
  const addBtn = bar.querySelector('.add-story');
  bar.innerHTML = '';
  bar.appendChild(addBtn);

  try {
    const res = await fetch(`${API_BASE}/api/stories/${currentUser.id}`);
    const data = await res.json();
    storyData = data.story_users || [];

    storyData.forEach((su, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'story-avatar-wrapper';
      const initials = (su.first_name[0] || '') + (su.last_name[0] || '');
      wrapper.innerHTML = `
        <div class="story-avatar has-story">${initials.toUpperCase()}</div>
        <span class="story-name">${su.user_id === currentUser.id ? 'Your Story' : su.first_name}</span>
      `;
      wrapper.addEventListener('click', () => openStoryViewer(idx));
      bar.appendChild(wrapper);
    });
  } catch (err) { /* ignore */ }
}

// --- Add Story button ---
document.getElementById('add-story-btn')?.addEventListener('click', () => {
  showPage('page-create-story');
  resetStoryCreator();
});

document.getElementById('back-from-story-create')?.addEventListener('click', () => {
  showPage('page-dashboard');
  loadStories();
});

// --- Story Creator ---
let storyFileData = null;
let storyFileType = null;

function resetStoryCreator() {
  storyFileData = null;
  storyFileType = null;
  storyTextX = 50;
  storyTextY = 75;
  storyTextColor = '#ffffff';
  document.getElementById('story-preview').innerHTML = '<p class="empty-msg">Select an image or video</p>';
  document.getElementById('story-text-overlay').value = '';
  document.getElementById('story-text-color').value = '#ffffff';
  document.getElementById('story-mentions').value = '';
  document.getElementById('story-publish-btn').disabled = true;
}

document.getElementById('story-pick-file')?.addEventListener('click', () => {
  document.getElementById('story-file-input').click();
});

document.getElementById('story-file-input')?.addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 15 : 5; // MB

  if (file.size > maxSize * 1024 * 1024) {
    alert(`File too large. Max ${maxSize}MB.`);
    this.value = '';
    return;
  }

  // Validate video duration
  if (isVideo) {
    const valid = await validateVideoDuration(file, 15);
    if (!valid) {
      alert('Video must be 15 seconds or shorter.');
      this.value = '';
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = () => {
    storyFileData = reader.result;
    storyFileType = isVideo ? 'video' : 'image';
    updateStoryPreview();
    document.getElementById('story-publish-btn').disabled = false;
  };
  reader.readAsDataURL(file);
  this.value = '';
});

function validateVideoDuration(file, maxSeconds) {
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration <= maxSeconds);
    };
    video.onerror = () => resolve(false);
    video.src = URL.createObjectURL(file);
  });
}

function updateStoryPreview() {
  const preview = document.getElementById('story-preview');
  const text = document.getElementById('story-text-overlay').value.trim();

  if (!storyFileData) {
    preview.innerHTML = '<p class="empty-msg">Select an image or video</p>';
    return;
  }

  let mediaHtml = '';
  if (storyFileType === 'video') {
    mediaHtml = `<video src="${storyFileData}" muted autoplay loop playsinline></video>`;
  } else {
    mediaHtml = `<img src="${storyFileData}" alt="Story preview">`;
  }

  let textHtml = '';
  if (text) {
    const escaped = text.replace(/</g, '&lt;');
    textHtml = `<div class="preview-text" id="draggable-text" style="left:${storyTextX}%;top:${storyTextY}%;color:${storyTextColor};">${escaped}</div>`;
  }
  preview.innerHTML = mediaHtml + textHtml;

  // Attach drag listeners to the text element
  const dragEl = document.getElementById('draggable-text');
  if (dragEl) setupTextDrag(dragEl, preview);
}

function setupTextDrag(el, container) {
  function onPointerDown(e) {
    e.preventDefault();
    let dragging = true;
    const rect = container.getBoundingClientRect();
    function onPointerMove(e2) {
      if (!dragging) return;
      const clientX = e2.touches ? e2.touches[0].clientX : e2.clientX;
      const clientY = e2.touches ? e2.touches[0].clientY : e2.clientY;
      storyTextX = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
      storyTextY = Math.max(5, Math.min(95, ((clientY - rect.top) / rect.height) * 100));
      el.style.left = storyTextX + '%';
      el.style.top = storyTextY + '%';
    }
    function onPointerUp() {
      dragging = false;
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
    }
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
  }
  el.addEventListener('mousedown', onPointerDown);
  el.addEventListener('touchstart', onPointerDown, { passive: false });
}

// Color picker
document.getElementById('story-text-color')?.addEventListener('input', (e) => {
  storyTextColor = e.target.value;
  updateStoryPreview();
});

document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    storyTextColor = dot.dataset.color;
    document.getElementById('story-text-color').value = storyTextColor;
    updateStoryPreview();
  });
});

document.getElementById('story-text-overlay')?.addEventListener('input', updateStoryPreview);

document.getElementById('story-publish-btn')?.addEventListener('click', async () => {
  if (!storyFileData) return;

  const textOverlay = document.getElementById('story-text-overlay').value.trim();
  const mentionsRaw = document.getElementById('story-mentions').value.trim();
  const mentions = mentionsRaw ? mentionsRaw.split(',').map(m => m.trim().replace(/^@/, '')) : [];

  const btn = document.getElementById('story-publish-btn');
  btn.disabled = true;
  btn.textContent = 'Publishing...';

  try {
    const res = await fetch(API_BASE + '/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        media: storyFileData,
        media_type: storyFileType,
        text_overlay: textOverlay || null,
        mentions: mentions.length > 0 ? mentions : null,
        text_x: storyTextX,
        text_y: storyTextY,
        text_color: storyTextColor
      })
    });

    if (res.ok) {
      showPage('page-dashboard');
      loadStories();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to publish story');
    }
  } catch (err) {
    alert('Error publishing story');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish Story';
  }
});

// --- Story Viewer ---
function openStoryViewer(userIdx) {
  storyUserIdx = userIdx;
  storyItemIdx = 0;
  document.getElementById('story-viewer').classList.remove('hidden');
  showCurrentStory();
}

function closeStoryViewer() {
  document.getElementById('story-viewer').classList.add('hidden');
  clearStoryTimer();
  const video = document.querySelector('#sv-media video');
  if (video) video.pause();
}

document.getElementById('sv-close')?.addEventListener('click', closeStoryViewer);

document.getElementById('sv-prev')?.addEventListener('click', () => {
  clearStoryTimer();
  if (storyItemIdx > 0) {
    storyItemIdx--;
  } else if (storyUserIdx > 0) {
    storyUserIdx--;
    storyItemIdx = storyData[storyUserIdx].stories.length - 1;
  }
  showCurrentStory();
});

document.getElementById('sv-next')?.addEventListener('click', advanceStory);

function advanceStory() {
  clearStoryTimer();
  const su = storyData[storyUserIdx];
  if (storyItemIdx < su.stories.length - 1) {
    storyItemIdx++;
    showCurrentStory();
  } else if (storyUserIdx < storyData.length - 1) {
    storyUserIdx++;
    storyItemIdx = 0;
    showCurrentStory();
  } else {
    closeStoryViewer();
  }
}

function clearStoryTimer() {
  if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
  if (storyAnimFrame) { cancelAnimationFrame(storyAnimFrame); storyAnimFrame = null; }
}

function showCurrentStory() {
  const su = storyData[storyUserIdx];
  if (!su) { closeStoryViewer(); return; }
  const story = su.stories[storyItemIdx];
  if (!story) { closeStoryViewer(); return; }

  // Header
  const initials = (su.first_name[0] || '') + (su.last_name[0] || '');
  document.getElementById('sv-avatar').textContent = initials.toUpperCase();
  document.getElementById('sv-name').textContent = `${su.first_name} ${su.last_name}`;
  document.getElementById('sv-time').textContent = timeAgo(story.created_at);

  // Progress bar segments
  const progressBar = document.getElementById('story-progress');
  progressBar.innerHTML = '';
  su.stories.forEach((_, i) => {
    const seg = document.createElement('div');
    seg.className = 'story-progress-seg' + (i < storyItemIdx ? ' done' : '') + (i === storyItemIdx ? ' active' : '');
    seg.innerHTML = '<div class="fill"></div>';
    progressBar.appendChild(seg);
  });

  // Media
  const mediaEl = document.getElementById('sv-media');
  if (story.media_type === 'video') {
    mediaEl.innerHTML = `<video src="${story.media}" autoplay playsinline></video>`;
    const video = mediaEl.querySelector('video');
    video.onloadedmetadata = () => {
      storyDuration = Math.min(video.duration * 1000, 15000);
      startStoryProgress();
    };
    video.onended = advanceStory;
  } else {
    mediaEl.innerHTML = `<img src="${story.media}" alt="Story">`;
    storyDuration = 5000;
    startStoryProgress();
  }

  // Text overlay with position and color
  const textEl = document.getElementById('sv-text');
  textEl.textContent = story.text_overlay || '';
  textEl.style.left = (story.text_x ?? 50) + '%';
  textEl.style.top = (story.text_y ?? 75) + '%';
  textEl.style.color = story.text_color || '#ffffff';
  textEl.style.transform = 'translate(-50%, -50%)';
  textEl.style.position = 'absolute';

  // Mentions
  const mentionsEl = document.getElementById('sv-mentions');
  if (story.mentions && story.mentions.length > 0) {
    mentionsEl.textContent = story.mentions.map(m => '@' + m).join('  ');
  } else {
    mentionsEl.textContent = '';
  }
}

function startStoryProgress() {
  clearStoryTimer();
  const activeSeg = document.querySelector('.story-progress-seg.active .fill');
  if (!activeSeg) return;

  storyStartTime = performance.now();
  activeSeg.style.width = '0%';
  activeSeg.style.transition = 'none';

  function animate(now) {
    const elapsed = now - storyStartTime;
    const pct = Math.min((elapsed / storyDuration) * 100, 100);
    activeSeg.style.width = pct + '%';
    if (pct < 100) {
      storyAnimFrame = requestAnimationFrame(animate);
    }
  }
  storyAnimFrame = requestAnimationFrame(animate);
  storyTimer = setTimeout(advanceStory, storyDuration);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  return hrs + 'h ago';
}

// ════════════════════════════════════════════════════════════════════════
// POSTS — Creator
// ════════════════════════════════════════════════════════════════════════

let postFileData = null;
let postFileType = null;

document.getElementById('add-post-btn')?.addEventListener('click', () => {
  showPage('page-create-post');
  resetPostCreator();
});

document.getElementById('back-from-post-create')?.addEventListener('click', () => {
  showPage('page-dashboard');
  loadStories();
  loadFeed();
});

function resetPostCreator() {
  postFileData = null;
  postFileType = null;
  document.getElementById('post-preview').innerHTML = '<p class="empty-msg">Select an image or video</p>';
  document.getElementById('post-caption').value = '';
  document.getElementById('post-publish-btn').disabled = true;
}

document.getElementById('post-pick-file')?.addEventListener('click', () => {
  document.getElementById('post-file-input').click();
});

document.getElementById('post-file-input')?.addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 15 : 5;

  if (file.size > maxSize * 1024 * 1024) {
    alert(`File too large. Max ${maxSize}MB.`);
    this.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    postFileData = reader.result;
    postFileType = isVideo ? 'video' : 'image';
    const preview = document.getElementById('post-preview');
    if (isVideo) {
      preview.innerHTML = `<video src="${postFileData}" controls playsinline></video>`;
    } else {
      preview.innerHTML = `<img src="${postFileData}" alt="Post preview">`;
    }
    document.getElementById('post-publish-btn').disabled = false;
  };
  reader.readAsDataURL(file);
  this.value = '';
});

document.getElementById('post-publish-btn')?.addEventListener('click', async () => {
  if (!postFileData) return;

  const caption = document.getElementById('post-caption').value.trim();
  const btn = document.getElementById('post-publish-btn');
  btn.disabled = true;
  btn.textContent = 'Publishing...';

  try {
    const res = await fetch(API_BASE + '/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        media: postFileData,
        media_type: postFileType,
        caption: caption || null
      })
    });

    if (res.ok) {
      showPage('page-dashboard');
      loadStories();
      loadFeed();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to publish post');
    }
  } catch (err) {
    alert('Error publishing post');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish Post';
  }
});

// ════════════════════════════════════════════════════════════════════════
// POSTS — Feed
// ════════════════════════════════════════════════════════════════════════

async function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`${API_BASE}/api/feed/${currentUser.id}`);
    const data = await res.json();

    if (!data.posts || data.posts.length === 0) {
      container.innerHTML = '<p class="empty-msg">No posts yet. Add a post or follow friends to see their posts!</p>';
      return;
    }

    container.innerHTML = '';
    data.posts.forEach(post => {
      const initials = (post.first_name[0] || '') + (post.last_name[0] || '');
      const liked = post.liked_by_me;
      const likeCount = parseInt(post.like_count) || 0;
      const card = document.createElement('div');
      card.className = 'feed-card';

      let mediaHtml = '';
      if (post.media_type === 'video') {
        mediaHtml = `<video src="${post.media}" class="feed-media" controls playsinline></video>`;
      } else {
        mediaHtml = `<img src="${post.media}" class="feed-media" alt="Post" loading="lazy">`;
      }

      const captionHtml = post.caption
        ? `<div class="feed-caption"><strong>@${post.username}</strong>${post.caption.replace(/</g, '&lt;')}</div>`
        : '';

      card.innerHTML = `
        <div class="feed-header">
          <div class="feed-avatar">${initials.toUpperCase()}</div>
          <div>
            <div class="feed-username">@${post.username}</div>
            <div class="feed-time">${timeAgo(post.created_at)}</div>
          </div>
        </div>
        ${mediaHtml}
        <div class="feed-actions">
          <button class="feed-like-btn ${liked ? 'liked' : ''}" data-post-id="${post.id}" data-liked="${liked ? '1' : '0'}">${liked ? '\u2764\uFE0F' : '\uD83E\uDD0D'}</button>
          <span class="feed-like-count" data-post-id="${post.id}">${likeCount} ${likeCount === 1 ? 'like' : 'likes'}</span>
        </div>
        <div class="feed-likers" data-post-id="${post.id}">${likeCount > 0 ? 'Loading...' : ''}</div>
        ${captionHtml}
        <button class="feed-comments-toggle" data-post-id="${post.id}">View comments</button>
        <div class="feed-comments" data-post-id="${post.id}"></div>
        <div class="feed-comment-form">
          <input class="feed-comment-input" data-post-id="${post.id}" placeholder="Add a comment...">
          <button class="feed-comment-send" data-post-id="${post.id}">Post</button>
        </div>
      `;
      container.appendChild(card);

      // Load who liked this post
      if (likeCount > 0) loadLikers(post.id);
    });

    // Attach event listeners
    container.querySelectorAll('.feed-like-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleLike(btn));
    });
    container.querySelectorAll('.feed-comments-toggle').forEach(btn => {
      btn.addEventListener('click', () => toggleComments(btn));
    });
    container.querySelectorAll('.feed-comment-send').forEach(btn => {
      btn.addEventListener('click', () => postComment(btn.dataset.postId));
    });
    container.querySelectorAll('.feed-comment-input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') postComment(input.dataset.postId);
      });
    });
  } catch (err) {
    container.innerHTML = '<p class="empty-msg">Error loading feed</p>';
  }
}

async function toggleLike(btn) {
  const postId = btn.dataset.postId;
  const isLiked = btn.dataset.liked === '1';
  const method = isLiked ? 'DELETE' : 'POST';

  try {
    const res = await fetch(`${API_BASE}/api/posts/${postId}/like`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id })
    });
    const data = await res.json();

    btn.dataset.liked = isLiked ? '0' : '1';
    btn.textContent = isLiked ? '\uD83E\uDD0D' : '\u2764\uFE0F';
    btn.classList.toggle('liked');

    const countEl = document.querySelector(`.feed-like-count[data-post-id="${postId}"]`);
    if (countEl) countEl.textContent = `${data.like_count} ${data.like_count === 1 ? 'like' : 'likes'}`;

    loadLikers(postId);
  } catch (err) { /* ignore */ }
}

async function loadLikers(postId) {
  try {
    const res = await fetch(`${API_BASE}/api/posts/${postId}/likes`);
    const data = await res.json();
    const el = document.querySelector(`.feed-likers[data-post-id="${postId}"]`);
    if (!el) return;

    if (data.users.length === 0) {
      el.textContent = '';
      return;
    }

    const names = data.users.slice(0, 3).map(u => '@' + u.username);
    let text = 'Liked by ' + names.join(', ');
    if (data.users.length > 3) text += ` and ${data.users.length - 3} others`;
    el.textContent = text;
  } catch (err) { /* ignore */ }
}

async function toggleComments(btn) {
  const postId = btn.dataset.postId;
  const commentsDiv = document.querySelector(`.feed-comments[data-post-id="${postId}"]`);
  if (!commentsDiv) return;

  if (commentsDiv.classList.contains('open')) {
    commentsDiv.classList.remove('open');
    btn.textContent = 'View comments';
    return;
  }

  commentsDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Loading...</p>';
  commentsDiv.classList.add('open');

  try {
    const res = await fetch(`${API_BASE}/api/posts/${postId}/comments`);
    const data = await res.json();

    if (data.comments.length === 0) {
      commentsDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No comments yet.</p>';
      btn.textContent = 'Hide comments';
      return;
    }

    commentsDiv.innerHTML = '';
    data.comments.forEach(c => {
      const div = document.createElement('div');
      div.className = 'feed-comment';
      div.innerHTML = `<strong>@${c.username}</strong>${c.comment.replace(/</g,'&lt;')}<span>${timeAgo(c.created_at)}</span>`;
      commentsDiv.appendChild(div);
    });
    btn.textContent = `Hide comments (${data.comments.length})`;
  } catch (err) {
    commentsDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">Error loading comments.</p>';
  }
}

async function postComment(postId) {
  const input = document.querySelector(`.feed-comment-input[data-post-id="${postId}"]`);
  const comment = input.value.trim();
  if (!comment) return;

  try {
    await fetch(`${API_BASE}/api/posts/${postId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id, comment })
    });
    input.value = '';

    // Refresh comments if open
    const commentsDiv = document.querySelector(`.feed-comments[data-post-id="${postId}"]`);
    const toggleBtn = document.querySelector(`.feed-comments-toggle[data-post-id="${postId}"]`);
    if (commentsDiv) {
      commentsDiv.classList.add('open');
      // Reload
      const res = await fetch(`${API_BASE}/api/posts/${postId}/comments`);
      const data = await res.json();
      commentsDiv.innerHTML = '';
      data.comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'feed-comment';
        div.innerHTML = `<strong>@${c.username}</strong>${c.comment.replace(/</g,'&lt;')}<span>${timeAgo(c.created_at)}</span>`;
        commentsDiv.appendChild(div);
      });
      if (toggleBtn) toggleBtn.textContent = `Hide comments (${data.comments.length})`;
    }
  } catch (err) { /* ignore */ }
}

// ════════════════════════════════════════════════════════════════════════
// UNREAD MESSAGE BADGE
// ════════════════════════════════════════════════════════════════════════

async function loadUnreadCount() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/unread-count/${currentUser.id}`);
    const data = await res.json();
    const badge = document.getElementById('chat-unread-badge');
    if (badge) {
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? '99+' : data.count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (err) { /* ignore */ }
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
    const res = await fetch(`${API_BASE}/api/friends/${currentUser.id}`);
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
    const res = await fetch(`${API_BASE}/api/notifications/${currentUser.id}`);
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
    const res = await fetch(API_BASE + '/api/accept-friend-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId })
    });
    if (res.ok) await Promise.all([loadNotifications(), loadFriendsList()]);
  } catch (err) { /* ignore */ }
}

async function declineRequest(requestId) {
  try {
    const res = await fetch(API_BASE + '/api/decline-friend-request', {
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
    const res = await fetch(`${API_BASE}/api/search-users/${encodeURIComponent(query)}?exclude=${currentUser.id}`);
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
          const res = await fetch(API_BASE + '/api/send-friend-request', {
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
  fetch(API_BASE + '/api/typing', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender_id: currentUser.id, recipient_id: recipientId })
  }).catch(() => {});
}

async function checkTypingStatus(otherId, indicatorId) {
  try {
    const res = await fetch(`${API_BASE}/api/typing-status/${currentUser.id}/${otherId}`);
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
    const res = await fetch(`${API_BASE}/api/messages/${currentUser.id}/${currentConvoUser.id}`);
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

  await fetch(API_BASE + '/api/send-message', {
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
    const res = await fetch(`${API_BASE}/api/groups/${currentUser.id}`);
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
    const res = await fetch(`${API_BASE}/api/friends/${currentUser.id}`);
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
    const res = await fetch(API_BASE + '/api/create-group', {
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
    const res = await fetch(`${API_BASE}/api/group-messages/${currentGroupId}`);
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

  await fetch(API_BASE + '/api/send-group-message', {
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
  if (unreadPolling) clearInterval(unreadPolling);
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
