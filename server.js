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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION (PostgreSQL)
// ════════════════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

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

    console.log('All tables ready');
  } catch (err) {
    console.error('Table init error:', err.message);
  }
}

initTables();

// ════════════════════════════════════════════════════════════════════════
// ROUTES — HEALTH CHECK
// ════════════════════════════════════════════════════════════════════════

app.get('/api/test', async (req, res) => {
  const info = {
    server: 'running',
    database_url_set: !!process.env.DATABASE_URL
  };

  try {
    await pool.query('SELECT NOW()');
    info.database = 'connected';
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

    const passwordMatch = await bcrypt.compare(password, user.password);
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
    const excludeId = req.query.exclude || 0;

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
    const { sender_id, recipient_id, message } = req.body;

    if (!sender_id || !recipient_id || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    await pool.query(
      'INSERT INTO messages (sender_id, recipient_id, message) VALUES ($1, $2, $3)',
      [sender_id, recipient_id, message.trim()]
    );

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
              u.username, u.first_name
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
