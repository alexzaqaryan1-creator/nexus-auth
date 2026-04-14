// ═══════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

// ═══════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════
// ENV CHECK (IMPORTANT FOR RENDER)
// ═══════════════════════════════════════════════
if (
  !process.env.DB_HOST ||
  !process.env.DB_USER ||
  !process.env.DB_PASSWORD ||
  !process.env.DB_NAME
) {
  console.log("❌ Missing DB environment variables");
}

// ═══════════════════════════════════════════════
// DATABASE POOL
// ═══════════════════════════════════════════════
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// ═══════════════════════════════════════════════
// HEALTH CHECK (IMPORTANT FOR RENDER)
// ═══════════════════════════════════════════════
app.get('/', (req, res) => {
  res.send('🚀 Server is running');
});

// ═══════════════════════════════════════════════
// SEARCH USERS
// ═══════════════════════════════════════════════
app.get('/api/search-users/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const excludeId = req.query.exclude || 0;

    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT id, first_name, last_name, username 
       FROM users 
       WHERE (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?) 
       AND id != ? 
       LIMIT 10`,
      [`%${query}%`, `%${query}%`, `%${query}%`, excludeId]
    );

    connection.release();
    res.json({ users: rows });

  } catch (error) {
    console.error("SEARCH ERROR:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════
// SEND FRIEND REQUEST
// ═══════════════════════════════════════════════
app.post('/api/send-friend-request', async (req, res) => {
  try {
    const { sender_id, recipient_id } = req.body;

    const connection = await pool.getConnection();

    const [existing] = await connection.execute(
      `SELECT id FROM friend_requests 
       WHERE (sender_id=? AND recipient_id=?) 
       OR (sender_id=? AND recipient_id=?)`,
      [sender_id, recipient_id, recipient_id, sender_id]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Request already exists' });
    }

    await connection.execute(
      `INSERT INTO friend_requests (sender_id, recipient_id, status) 
       VALUES (?, ?, 'pending')`,
      [sender_id, recipient_id]
    );

    connection.release();
    res.json({ success: true });

  } catch (err) {
    console.error("FRIEND REQUEST ERROR:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════
// ACCEPT FRIEND REQUEST
// ═══════════════════════════════════════════════
app.post('/api/accept-friend-request', async (req, res) => {
  try {
    const { request_id } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE friend_requests SET status='accepted' WHERE id=?`,
      [request_id]
    );

    connection.release();
    res.json({ success: true });

  } catch (err) {
    console.error("ACCEPT ERROR:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════
app.get('/api/notifications/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT fr.id, fr.sender_id, u.username, u.first_name, u.last_name
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.recipient_id=? AND fr.status='pending'`,
      [user_id]
    );

    connection.release();
    res.json({ notifications: rows });

  } catch (err) {
    console.error("NOTIFICATIONS ERROR:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
