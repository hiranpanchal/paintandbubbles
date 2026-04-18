const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { requireAdmin, requireSuperAdmin, JWT_SECRET } = require('../middleware/auth');
const { sendTestEmail } = require('../services/email');

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
  if (!user.is_active) {
    return res.status(403).json({ error: 'Account disabled. Contact a super admin.' });
  }

  db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, is_active: !!user.is_active },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, username: user.username, role: user.role });
});

// POST /api/admin/test-email — sends a test email to verify configuration
router.post('/test-email', requireAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email address required' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(400).json({
      error: 'Email not configured. Add RESEND_API_KEY to your Railway environment variables.'
    });
  }

  try {
    await sendTestEmail(to);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    console.error('Test email failed:', err);
    res.status(500).json({ error: err.message || 'SMTP error — check EMAIL_USER, EMAIL_PASS and EMAIL_PORT in Railway' });
  }
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const totalEvents    = db.prepare('SELECT COUNT(*) as count FROM events WHERE is_active = 1').get();
  const totalBookings  = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'").get();
  const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const totalRevenue   = db.prepare("SELECT SUM(amount_pence) as total FROM payments WHERE status = 'succeeded'").get();

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
    FROM payments WHERE status = 'succeeded'
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();

  res.json({
    stats: {
      totalEvents:    totalEvents.count,
      totalBookings:  totalBookings.count,
      totalCustomers: totalCustomers.count,
      totalRevenue:   totalRevenue.total || 0
    },
    recentBookings,
    monthlyRevenue
  });
});

// POST /api/admin/users/me/change-password — any logged-in admin can change their own password
router.post('/users/me/change-password', requireAdmin, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < 12) {
    return res.status(400).json({ error: 'New password must be at least 12 characters' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (bcrypt.compareSync(new_password, user.password_hash)) {
    return res.status(400).json({ error: 'New password must be different from the current one' });
  }
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 12), req.admin.id);
  res.json({ success: true });
});

// ---- USER MANAGEMENT (super_admin only) ----

// GET /api/admin/users
router.get('/users', requireSuperAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, role, is_active, created_at, last_login_at FROM admin_users ORDER BY created_at ASC'
  ).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });

  const validRoles = ['admin', 'super_admin'];
  const userRole = validRoles.includes(role) ? role : 'admin';

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username.trim(), hash, userRole);

  res.status(201).json(db.prepare('SELECT id, username, role, is_active, created_at, last_login_at FROM admin_users WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireSuperAdmin, (req, res) => {
  const { role, is_active } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.admin.id === parseInt(req.params.id) && role && role !== 'super_admin') {
    return res.status(400).json({ error: 'You cannot remove your own super admin role' });
  }

  const validRoles = ['admin', 'super_admin'];
  db.prepare('UPDATE admin_users SET role = ?, is_active = ? WHERE id = ?').run(
    validRoles.includes(role) ? role : user.role,
    is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
    req.params.id
  );
  res.json(db.prepare('SELECT id, username, role, is_active, created_at, last_login_at FROM admin_users WHERE id = ?').get(req.params.id));
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireSuperAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });

  const user = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ success: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireSuperAdmin, (req, res) => {
  if (req.admin.id === parseInt(req.params.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const user = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
