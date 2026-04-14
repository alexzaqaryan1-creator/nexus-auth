// ════════════════════════════════════════════════════════════════════════
// SEARCH USERS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/search-users/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const excludeId = req.query.exclude || 0;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT id, first_name, last_name, username FROM users WHERE (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?) AND id != ? LIMIT 10',
      [`%${query}%`, `%${query}%`, `%${query}%`, excludeId]
    );
    connection.release();

    res.json({ users: rows });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// SEND FRIEND REQUEST
// ════════════════════════════════════════════════════════════════════════

app.post('/api/send-friend-request', async (req, res) => {
  try {
    const { sender_id, recipient_id } = req.body;

    if (!sender_id || !recipient_id) {
      return res.status(400).json({ error: 'Missing user IDs' });
    }

    const connection = await pool.getConnection();

    // Check if already friends
    const [existing] = await connection.execute(
      'SELECT id FROM friend_requests WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)',
      [sender_id, recipient_id, recipient_id, sender_id]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Request already exists' });
    }

    // Insert friend request
    await connection.execute(
      'INSERT INTO friend_requests (sender_id, recipient_id, status) VALUES (?, ?, ?)',
      [sender_id, recipient_id, 'pending']
    );

    connection.release();

    res.json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ACCEPT FRIEND REQUEST
// ════════════════════════════════════════════════════════════════════════

app.post('/api/accept-friend-request', async (req, res) => {
  try {
    const { request_id } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE friend_requests SET status = ? WHERE id = ?',
      ['accepted', request_id]
    );

    connection.release();

    res.json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════
// GET NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════

app.get('/api/notifications/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT fr.id, fr.sender_id, u.username, u.first_name, u.last_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON fr.sender_id = u.id
       WHERE fr.recipient_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [user_id]
    );
    connection.release();

    res.json({ notifications: rows });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
