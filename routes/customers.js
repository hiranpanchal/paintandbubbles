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

// GET /api/customers/:id — full detail with split bookings
router.get('/:id', requireAdmin, (req, res) => {
  const customer = db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT b.id) as total_bookings,
      COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_pence ELSE 0 END), 0) as total_spent
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const upcomingBookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.date as event_date, e.time as event_time, e.location as event_location
    FROM bookings b JOIN events e ON b.event_id = e.id
    WHERE b.customer_id = ? AND e.date >= date('now')
    ORDER BY e.date ASC
  `).all(req.params.id);

  const pastBookings = db.prepare(`
    SELECT b.*, e.title as event_title, e.date as event_date, e.time as event_time, e.location as event_location
    FROM bookings b JOIN events e ON b.event_id = e.id
    WHERE b.customer_id = ? AND e.date < date('now')
    ORDER BY e.date DESC
  `).all(req.params.id);

  res.json({ ...customer, upcomingBookings, pastBookings });
});

// PUT /api/customers/:id — update customer details
router.put('/:id', requireAdmin, (req, res) => {
  const { name, email, phone, notes } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (email && email !== customer.email) {
    const existing = db.prepare('SELECT id FROM customers WHERE email = ? AND id != ?').get(email, req.params.id);
    if (existing) return res.status(409).json({ error: 'Email already in use by another customer' });
  }

  db.prepare('UPDATE customers SET name = ?, email = ?, phone = ?, notes = ? WHERE id = ?').run(
    name  || customer.name,
    email || customer.email,
    phone !== undefined ? phone : customer.phone,
    notes !== undefined ? notes : (customer.notes || ''),
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

module.exports = router;
