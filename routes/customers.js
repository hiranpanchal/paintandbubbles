const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { recordConsent } = require('../services/marketing');

// GET /api/customers — admin only. Filters combine (AND):
//   search, booking_status, event_id ('repeat' = 2+ confirmed events),
//   from / to (booking date), heard_about, opt_in ('yes' | 'no')
router.get('/', requireAdmin, (req, res) => {
  const { search, booking_status, event_id, from, to, heard_about, opt_in } = req.query;
  let query = `
    SELECT c.*,
      COUNT(DISTINCT b.id) as total_bookings,
      COUNT(DISTINCT CASE WHEN b.status = 'confirmed' THEN b.event_id END) as events_attended,
      COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_pence ELSE 0 END), 0) as total_spent,
      (SELECT b2.heard_about FROM bookings b2 WHERE b2.customer_id = c.id AND b2.heard_about IS NOT NULL
         ORDER BY b2.created_at DESC LIMIT 1) as heard_about,
      (SELECT b2.heard_about_other FROM bookings b2 WHERE b2.customer_id = c.id AND b2.heard_about IS NOT NULL
         ORDER BY b2.created_at DESC LIMIT 1) as heard_about_other
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    query += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Booking-level filters are applied together on the same booking, so
  // "pending + between these dates" means a pending booking in that range.
  const bookingConds = [];
  if (booking_status) { bookingConds.push('bx.status = ?'); params.push(booking_status); }
  if (event_id && event_id !== 'repeat') { bookingConds.push('bx.event_id = ?'); params.push(event_id); }
  if (from) { bookingConds.push('date(bx.created_at) >= ?'); params.push(from); }
  if (to)   { bookingConds.push('date(bx.created_at) <= ?'); params.push(to); }
  if (heard_about) { bookingConds.push('bx.heard_about = ?'); params.push(heard_about); }
  if (bookingConds.length) {
    query += ` AND EXISTS (SELECT 1 FROM bookings bx WHERE bx.customer_id = c.id AND ${bookingConds.join(' AND ')})`;
  }

  if (opt_in === 'yes') query += ' AND c.marketing_opt_in = 1';
  if (opt_in === 'no')  query += ' AND COALESCE(c.marketing_opt_in, 0) = 0';

  query += ' GROUP BY c.id';
  if (event_id === 'repeat') query += ' HAVING events_attended >= 2';
  query += ' ORDER BY c.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// PATCH /api/customers/:id/marketing — admin toggles opt-in (e.g. the customer
// emailed asking to be removed). Logged in the consent history like any other.
router.patch('/:id/marketing', requireAdmin, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const consented = !!req.body.opt_in;
  recordConsent(db, {
    customerId: customer.id,
    email: customer.email,
    consented,
    consentText: consented
      ? 'Opted in to marketing emails / WhatsApp messages (updated by admin on customer request).'
      : 'Opted out of marketing emails / WhatsApp messages (updated by admin on customer request).',
    source: `admin:${req.admin?.username || 'admin'}`,
    req,
  });
  res.json({ success: true, marketing_opt_in: consented ? 1 : 0 });
});

// GET /api/customers/:id/consents — GDPR consent history
router.get('/:id/consents', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM marketing_consents WHERE customer_id = ? ORDER BY created_at DESC, id DESC').all(req.params.id));
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
