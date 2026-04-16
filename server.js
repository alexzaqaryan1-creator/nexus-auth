const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const app = express();

// ════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory typing status: key = "senderId-recipientId", value = timestamp
const typingStatus = new Map();

// ════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION (PostgreSQL)
// Supports both DATABASE_URL and individual DB_* env vars
// ════════════════════════════════════════════════════════════════════════

// Render internal hosts (dpg-...-a) do NOT use SSL
// External hosts and DATABASE_URL with .render.com DO need SSL
function needsSSL(host) {
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.startsWith('dpg-')) return false;  // Render internal
  return true;
}

let poolConfig;

if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  poolConfig = {
    connectionString: url,
    ssl: needsSSL(new URL(url).hostname) ? { rejectUnauthorized: false } : false
  };
} else {
  poolConfig = {
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:      needsSSL(process.env.DB_HOST) ? { rejectUnauthorized: false } : false
  };
}

const pool = new Pool(poolConfig);

// Test DB on startup
pool.query('SELECT NOW()')
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch(err => console.error('Database connection failed:', err.message));

// ════════════════════════════════════════════════════════════════════════
// AUTO-CREATE TABLES (runs on every startup, safe to keep)
// ════════════════════════════════════════════════════════════════════════

async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name  VARCHAR(100) NOT NULL,
        username   VARCHAR(50)  NOT NULL UNIQUE,
        email      VARCHAR(150) NOT NULL UNIQUE,
        dob        DATE         NOT NULL,
        password   VARCHAR(255) NOT NULL,
        joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id           SERIAL PRIMARY KEY,
        sender_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status       VARCHAR(20) DEFAULT 'pending',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS friends (
        id         SERIAL PRIMARY KEY,
        user_id_1  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id_2  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id           SERIAL PRIMARY KEY,
        sender_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message      TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_chats (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,
        creator_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id         SERIAL PRIMARY KEY,
        group_id   INT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
        user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id         SERIAL PRIMARY KEY,
        group_id   INT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
        sender_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add type column to existing tables (safe to run multiple times)
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text'`);
    await pool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text'`);

    console.log('All tables ready');
  } catch (err) {
    console.error('Table init error:', err.message);
  }
}

initTables();

// ════════════════════════════════════════════════════════════════════════
// ROUTES — HEALTH CHECK & DIAGNOSTICS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/test', async (req, res) => {
  const info = {
    server: 'running',
    connection_mode: process.env.DATABASE_URL ? 'DATABASE_URL' : 'individual vars',
    db_host: process.env.DATABASE_URL ? '(using URL)' : (process.env.DB_HOST || 'NOT SET'),
    db_port: process.env.DATABASE_URL ? '(using URL)' : (process.env.DB_PORT || '5432 (default)'),
    db_name: process.env.DATABASE_URL ? '(using URL)' : (process.env.DB_NAME || 'NOT SET'),
    db_user: process.env.DATABASE_URL ? '(using URL)' : (process.env.DB_USER || 'NOT SET'),
    db_password_set: !!(process.env.DATABASE_URL || process.env.DB_PASSWORD)
  };

  try {
    const timeResult = await pool.query('SELECT NOW() as time');
    info.database = 'connected';
    info.server_time = timeResult.rows[0].time;

    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    info.tables = tableCheck.rows.map(r => r.table_name);

    const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
    info.user_count = parseInt(userCount.rows[0].count);
  } catch (err) {
    info.database = 'FAILED';
    info.db_error = err.message;
  }

  res.json(info);
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — REGISTER
// ════════════════════════════════════════════════════════════════════════

app.post('/api/register', async (req, res) => {
  try {
    const { first_name, last_name, username, email, dob, password, confirm } = req.body;

    // Basic validation
    if (!first_name || !last_name || !username || !email || !dob || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirm) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check duplicate username
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Check duplicate email
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1', [email]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    await pool.query(
      'INSERT INTO users (first_name, last_name, username, email, dob, password) VALUES ($1, $2, $3, $4, $5, $6)',
      [first_name, last_name, username, email, dob, hashedPassword]
    );

    res.status(201).json({ success: true, message: 'Account created successfully' });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error, please try again' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — LOGIN
// Supports both bcrypt-hashed and plain-text passwords (legacy users)
// ════════════════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Check if password is bcrypt-hashed (starts with $2a$ or $2b$)
    let passwordMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plain-text password — compare directly
      passwordMatch = (password === user.password);

      // Upgrade to bcrypt hash for next login
      if (passwordMatch) {
        const hashed = await bcrypt.hash(password, 12);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
      }
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Return user data (never return password)
    res.json({
      success: true,
      user: {
        id:         user.id,
        first_name: user.first_name,
        last_name:  user.last_name,
        username:   user.username,
        email:      user.email,
        dob:        user.dob,
        joined_at:  user.joined_at
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error, please try again' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — SEARCH USERS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/search-users/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const excludeId = parseInt(req.query.exclude) || 0;

    const result = await pool.query(
      `SELECT id, first_name, last_name, username
       FROM users
       WHERE (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
       AND id != $2
       LIMIT 10`,
      [`%${query}%`, excludeId]
    );

    res.json({ users: result.rows });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — SEND FRIEND REQUEST
// ════════════════════════════════════════════════════════════════════════

app.post('/api/send-friend-request', async (req, res) => {
  try {
    const { sender_id, recipient_id } = req.body;

    if (!sender_id || !recipient_id) {
      return res.status(400).json({ error: 'Missing user IDs' });
    }

    // Check if request already exists
    const existing = await pool.query(
      `SELECT id FROM friend_requests
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)`,
      [sender_id, recipient_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if already friends
    const alreadyFriends = await pool.query(
      `SELECT id FROM friends
       WHERE (user_id_1 = $1 AND user_id_2 = $2)
          OR (user_id_1 = $2 AND user_id_2 = $1)`,
      [sender_id, recipient_id]
    );

    if (alreadyFriends.rows.length > 0) {
      return res.status(400).json({ error: 'Already friends' });
    }

    await pool.query(
      'INSERT INTO friend_requests (sender_id, recipient_id, status) VALUES ($1, $2, $3)',
      [sender_id, recipient_id, 'pending']
    );

    res.json({ success: true, message: 'Friend request sent' });

  } catch (err) {
    console.error('Friend request error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET NOTIFICATIONS (pending friend requests)
// ════════════════════════════════════════════════════════════════════════

app.get('/api/notifications/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT fr.id, fr.sender_id, u.username,
              u.first_name, u.last_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.recipient_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [user_id]
    );

    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Notifications error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — ACCEPT FRIEND REQUEST
// ════════════════════════════════════════════════════════════════════════

app.post('/api/accept-friend-request', async (req, res) => {
  try {
    const { request_id } = req.body;

    // Get request info first
    const reqResult = await pool.query(
      'SELECT * FROM friend_requests WHERE id = $1', [request_id]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const { sender_id, recipient_id } = reqResult.rows[0];

    // Mark as accepted
    await pool.query(
      'UPDATE friend_requests SET status = $1 WHERE id = $2',
      ['accepted', request_id]
    );

    // Add to friends table
    await pool.query(
      'INSERT INTO friends (user_id_1, user_id_2) VALUES ($1, $2)',
      [sender_id, recipient_id]
    );

    res.json({ success: true, message: 'Friend request accepted' });

  } catch (err) {
    console.error('Accept request error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET FRIENDS LIST
// ════════════════════════════════════════════════════════════════════════

app.get('/api/friends/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.username
       FROM friends f
       JOIN users u ON (
         CASE
           WHEN f.user_id_1 = $1 THEN f.user_id_2
           ELSE f.user_id_1
         END = u.id
       )
       WHERE f.user_id_1 = $1 OR f.user_id_2 = $1`,
      [user_id]
    );

    res.json({ friends: result.rows });
  } catch (err) {
    console.error('Friends list error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — SEND MESSAGE
// ════════════════════════════════════════════════════════════════════════

app.post('/api/send-message', async (req, res) => {
  try {
    const { sender_id, recipient_id, message, type } = req.body;
    const msgType = type || 'text';

    if (!sender_id || !recipient_id || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    await pool.query(
      'INSERT INTO messages (sender_id, recipient_id, message, type) VALUES ($1, $2, $3, $4)',
      [sender_id, recipient_id, msgType === 'text' ? message.trim() : message, msgType]
    );

    // Clear typing status after sending
    typingStatus.delete(`${sender_id}-${recipient_id}`);

    res.json({ success: true });

  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET MESSAGES (conversation between 2 users)
// ════════════════════════════════════════════════════════════════════════

app.get('/api/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const result = await pool.query(
      `SELECT m.id, m.sender_id, m.recipient_id, m.message, m.created_at,
              m.type, u.username, u.first_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE (m.sender_id = $1 AND m.recipient_id = $2)
          OR (m.sender_id = $2 AND m.recipient_id = $1)
       ORDER BY m.created_at ASC`,
      [user1, user2]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — TYPING INDICATOR
// ════════════════════════════════════════════════════════════════════════

app.post('/api/typing', (req, res) => {
  const { sender_id, recipient_id } = req.body;
  if (!sender_id || !recipient_id) return res.status(400).json({ error: 'Missing IDs' });
  typingStatus.set(`${sender_id}-${recipient_id}`, Date.now());
  res.json({ success: true });
});

app.get('/api/typing-status/:my_id/:other_id', (req, res) => {
  const { my_id, other_id } = req.params;
  const key = `${other_id}-${my_id}`;
  const ts = typingStatus.get(key);
  const isTyping = ts && (Date.now() - ts < 3000);
  if (!isTyping) typingStatus.delete(key);
  res.json({ typing: !!isTyping });
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GIF SEARCH (GIPHY proxy)
// ════════════════════════════════════════════════════════════════════════

app.get('/api/gifs', async (req, res) => {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GIF search not configured. Add GIPHY_API_KEY env var.' });
  }

  const query = req.query.q;
  let url;
  if (query) {
    url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=30&rating=g&lang=en`;
  } else {
    url = `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=30&rating=g`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    const gifs = (data.data || []).map(g => ({
      id: g.id,
      preview: g.images.fixed_height_small.url,
      full: g.images.fixed_height.url,
      width: parseInt(g.images.fixed_height.width),
      height: parseInt(g.images.fixed_height.height)
    }));

    res.json({ gifs });
  } catch (err) {
    console.error('GIF search error:', err.message);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — DECLINE FRIEND REQUEST
// ════════════════════════════════════════════════════════════════════════

app.post('/api/decline-friend-request', async (req, res) => {
  try {
    const { request_id } = req.body;

    const result = await pool.query(
      'DELETE FROM friend_requests WHERE id = $1', [request_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ success: true, message: 'Friend request declined' });
  } catch (err) {
    console.error('Decline request error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — CREATE GROUP CHAT
// ════════════════════════════════════════════════════════════════════════

app.post('/api/create-group', async (req, res) => {
  try {
    const { name, creator_id, member_ids } = req.body;

    if (!name || !creator_id || !member_ids || member_ids.length === 0) {
      return res.status(400).json({ error: 'Group name and members are required' });
    }

    const groupResult = await pool.query(
      'INSERT INTO group_chats (name, creator_id) VALUES ($1, $2) RETURNING id',
      [name, creator_id]
    );
    const groupId = groupResult.rows[0].id;

    // Add creator as member
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [groupId, creator_id]
    );

    // Add other members
    for (const memberId of member_ids) {
      await pool.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [groupId, memberId]
      );
    }

    res.status(201).json({ success: true, group_id: groupId });
  } catch (err) {
    console.error('Create group error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET USER'S GROUP CHATS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/groups/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT gc.id, gc.name, gc.creator_id, gc.created_at
       FROM group_chats gc
       JOIN group_members gm ON gc.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY gc.created_at DESC`,
      [user_id]
    );

    res.json({ groups: result.rows });
  } catch (err) {
    console.error('Get groups error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET GROUP MEMBERS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/group-members/:group_id', async (req, res) => {
  try {
    const { group_id } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.username
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [group_id]
    );

    res.json({ members: result.rows });
  } catch (err) {
    console.error('Get group members error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — SEND GROUP MESSAGE
// ════════════════════════════════════════════════════════════════════════

app.post('/api/send-group-message', async (req, res) => {
  try {
    const { group_id, sender_id, message, type } = req.body;
    const msgType = type || 'text';

    if (!group_id || !sender_id || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    await pool.query(
      'INSERT INTO group_messages (group_id, sender_id, message, type) VALUES ($1, $2, $3, $4)',
      [group_id, sender_id, msgType === 'text' ? message.trim() : message, msgType]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Send group message error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ROUTES — GET GROUP MESSAGES
// ════════════════════════════════════════════════════════════════════════

app.get('/api/group-messages/:group_id', async (req, res) => {
  try {
    const { group_id } = req.params;

    const result = await pool.query(
      `SELECT gm.id, gm.sender_id, gm.message, gm.created_at,
              gm.type, u.username, u.first_name
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.created_at ASC`,
      [group_id]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get group messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// SERVE FRONTEND FOR ALL UNMATCHED ROUTES
// ════════════════════════════════════════════════════════════════════════

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
