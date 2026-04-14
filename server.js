const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const mysql    = require('mysql2/promise');
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
// DATABASE CONNECTION
// ════════════════════════════════════════════════════════════════════════

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

// Test DB on startup
pool.getConnection()
  .then(conn => {
    console.log('Connected to MySQL database');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });

// ════════════════════════════════════════════════════════════════════════
// AUTO-CREATE TABLES (runs on every startup, safe to keep)
// ════════════════════════════════════════════════════════════════════════

async function initTables() {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name  VARCHAR(100) NOT NULL,
        username   VARCHAR(50)  NOT NULL UNIQUE,
        email      VARCHAR(150) NOT NULL UNIQUE,
        dob        DATE         NOT NULL,
        password   VARCHAR(255) NOT NULL,
        joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        sender_id    INT NOT NULL,
        recipient_id INT NOT NULL,
        status       VARCHAR(20) DEFAULT 'pending',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id)    REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS friends (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id_1  INT NOT NULL,
        user_id_2  INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id_1) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id_2) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        sender_id    INT NOT NULL,
        recipient_id INT NOT NULL,
        message      TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id)    REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('All tables ready');
  } catch (err) {
    console.error('Table init error:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

initTables();

// ════════════════════════════════════════════════════════════════════════
// ROUTES — HEALTH CHECK
// ════════════════════════════════════════════════════════════════════════

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working' });
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

    const conn = await pool.getConnection();

    // Check duplicate username
    const [userRows] = await conn.execute(
      'SELECT id FROM users WHERE username = ?', [username]
    );
    if (userRows.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Check duplicate email
    const [emailRows] = await conn.execute(
      'SELECT id FROM users WHERE email = ?', [email]
    );
    if (emailRows.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    await conn.execute(
      'INSERT INTO users (first_name, last_name, username, email, dob, password) VALUES (?, ?, ?, ?, ?, ?)',
      [first_name, last_name, username, email, dob, hashedPassword]
    );

    conn.release();
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

    const conn = await pool.getConnection();

    const [rows] = await conn.execute(
      'SELECT * FROM users WHERE username = ?', [username]
    );

    conn.release();

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];

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

    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT id, first_name, last_name, username
       FROM users
       WHERE (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)
       AND id != ?
       LIMIT 10`,
      [`%${query}%`, `%${query}%`, `%${query}%`, excludeId]
    );
    conn.release();

    res.json({ users: rows });
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

    const conn = await pool.getConnection();

    // Check if request already exists
    const [existing] = await conn.execute(
      `SELECT id FROM friend_requests
       WHERE (sender_id = ? AND recipient_id = ?)
          OR (sender_id = ? AND recipient_id = ?)`,
      [sender_id, recipient_id, recipient_id, sender_id]
    );

    if (existing.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if already friends
    const [alreadyFriends] = await conn.execute(
      `SELECT id FROM friends
       WHERE (user_id_1 = ? AND user_id_2 = ?)
          OR (user_id_1 = ? AND user_id_2 = ?)`,
      [sender_id, recipient_id, recipient_id, sender_id]
    );

    if (alreadyFriends.length > 0) {
      conn.release();
      return res.status(400).json({ error: 'Already friends' });
    }

    await conn.execute(
      'INSERT INTO friend_requests (sender_id, recipient_id, status) VALUES (?, ?, ?)',
      [sender_id, recipient_id, 'pending']
    );

    conn.release();
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

    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT fr.id, fr.sender_id, u.username,
              u.first_name, u.last_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.recipient_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [user_id]
    );
    conn.release();

    res.json({ notifications: rows });
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

    const conn = await pool.getConnection();

    // Get request info first
    const [reqRows] = await conn.execute(
      'SELECT * FROM friend_requests WHERE id = ?', [request_id]
    );

    if (reqRows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Request not found' });
    }

    const { sender_id, recipient_id } = reqRows[0];

    // Mark as accepted
    await conn.execute(
      'UPDATE friend_requests SET status = ? WHERE id = ?',
      ['accepted', request_id]
    );

    // Add to friends table (both directions)
    await conn.execute(
      'INSERT INTO friends (user_id_1, user_id_2) VALUES (?, ?)',
      [sender_id, recipient_id]
    );

    conn.release();
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

    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT u.id, u.first_name, u.last_name, u.username
       FROM friends f
       JOIN users u ON (
         CASE
           WHEN f.user_id_1 = ? THEN f.user_id_2
           ELSE f.user_id_1
         END = u.id
       )
       WHERE f.user_id_1 = ? OR f.user_id_2 = ?`,
      [user_id, user_id, user_id]
    );
    conn.release();

    res.json({ friends: rows });
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

    const conn = await pool.getConnection();

    await conn.execute(
      'INSERT INTO messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
      [sender_id, recipient_id, message.trim()]
    );

    conn.release();
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

    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT m.id, m.sender_id, m.recipient_id, m.message, m.created_at,
              u.username, u.first_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.created_at ASC`,
      [user1, user2, user2, user1]
    );
    conn.release();

    res.json({ messages: rows });
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
