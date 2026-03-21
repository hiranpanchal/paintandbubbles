const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { requireAdmin, JWT_SECRET } = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events WHERE is_active = 1').get();
  const totalBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'").get();
  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const totalRevenue = db.prepare("SELECT SUM(amount_pence) as total FROM payments WHERE status = 'succeeded'").get();

  const recentBookings = db.prepare(`
    SELECT b.id, b.created_at, b.quantity, b.total_pence, b.status,
           c.name as customer_name, c.email as customer_email,
           e.title as event_title, e.date as event_date
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    ORDER BY b.created_at DESC
    LIMIT 5
  `).all();

  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(amount_pence) as total
    FROM payments
    WHERE status = 'succeeded'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();

  res.json({
    stats: {
      totalEvents: totalEvents.count,
      totalBookings: totalBookings.count,
      totalCustomers: totalCustomers.count,
      totalRevenue: totalRevenue.total || 0
    },
    recentBookings,
    monthlyRevenue
  });
});

module.exports = router;
