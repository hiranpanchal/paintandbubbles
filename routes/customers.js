const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/customers — admin only
router.get('/', requireAdmin, (req, res) => {
  const { search } = req.query;
  let query = `
    SELECT c.*,
      COUNT(DISTINCT b.id) as total_bookings,
      COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_pence ELSE 0 END), 0) as total_spent
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    query += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' GROUP BY c.id ORDER BY c.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/customers/:id — admin only
router.get('/:id', requireAdmin, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const bookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.date as event_date, e.time as event_time
    FROM bookings b
    JOIN events e ON b.event_id = e.id
    WHERE b.customer_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.id);

  res.json({ ...customer, bookings });
});

module.exports = router;
