const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

// ════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════

// Serve static files FIRST (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Parse JSON
app.use(express.json());

// ════════════════════════════════════════════════════════════════════════
// MYSQL CONNECTION
// ════════════════════════════════════════════════════════════════════════

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'nexus_auth',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ════════════════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════════════════

// Login Route
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    if (password !== user.password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        email: user.email,
        dob: user.dob,
        joined_at: user.joined_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register Route
app.post('/api/register', async (req, res) => {
  try {
    const { first_name, last_name, username, email, dob, password, confirm } = req.body;

    if (!first_name || !last_name || !username || !email || !dob || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (password !== confirm) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const connection = await pool.getConnection();

    // Check if username exists
    const [userCheck] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (userCheck.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Check if email exists
    const [emailCheck] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (emailCheck.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Insert new user
    await connection.execute(
      'INSERT INTO users (first_name, last_name, username, email, dob, password) VALUES (?, ?, ?, ?, ?, ?)',
      [first_name, last_name, username, email, dob, password]
    );

    connection.release();

    res.json({ success: true, message: 'Account created successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check username availability
app.get('/api/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    connection.release();

    res.json({ available: rows.length === 0 });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by ID
app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT id, first_name, last_name, username, email, dob, joined_at FROM users WHERE id = ?',
      [id]
    );
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('================================');
  console.log(`✅ Server running: http://localhost:${PORT}`);
  console.log('📊 MySQL host:     localhost');
  console.log('🗄️  MySQL database: nexus_auth');
  console.log('================================');
});
