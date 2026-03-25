const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendBookingConfirmation } = require('../services/email');

// GET /api/bookings — admin only
router.get('/', requireAdmin, (req, res) => {
  const { status, event_id } = req.query;
  let query = `
    SELECT b.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
           e.title as event_title, e.date as event_date, e.time as event_time, e.location as event_location
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += ' AND b.status = ?'; params.push(status); }
  if (event_id) { query += ' AND b.event_id = ?'; params.push(event_id); }

  query += ' ORDER BY b.created_at DESC';
  const bookings = db.prepare(query).all(...params);
  res.json(bookings);
});

// GET /api/bookings/:id — admin only
router.get('/:id', requireAdmin, (req, res) => {
  const booking = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
           e.title as event_title, e.date as event_date, e.time as event_time, e.location as event_location, e.price_pence
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

// POST /api/bookings — public (creates a pending booking before payment)
router.post('/', (req, res) => {
  const { event_id, name, email, phone, quantity, notes } = req.body;

  if (!event_id || !name || !email || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const event = db.prepare(`
    SELECT e.*,
      (e.capacity - COALESCE(
        (SELECT SUM(b.quantity) FROM bookings b WHERE b.event_id = e.id AND b.status IN ('confirmed','pending')),
        0
      )) as spots_remaining
    FROM events e WHERE e.id = ? AND e.is_active = 1
  `).get(event_id);

  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.spots_remaining < quantity) {
    return res.status(400).json({ error: `Only ${event.spots_remaining} spot(s) remaining` });
  }

  // Upsert customer
  let customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  if (!customer) {
    const result = db.prepare('INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)').run(name, email, phone || null);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare('UPDATE customers SET name = ?, phone = ? WHERE id = ?').run(name, phone || customer.phone, customer.id);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  }

  const total_pence = event.price_pence * quantity;

  const result = db.prepare(`
    INSERT INTO bookings (event_id, customer_id, quantity, total_pence, status, notes)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(event_id, customer.id, quantity, total_pence, notes || null);

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ booking, customer, event });
});

// PATCH /api/bookings/:id/status — admin only
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled', 'refunded'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// POST /api/bookings/:id/confirm — called after successful payment
router.post('/:id/confirm', async (req, res) => {
  const { payment_reference, stripe_payment_intent_id } = req.body;
  const ref = payment_reference || stripe_payment_intent_id || null; // backwards compat

  const booking = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email,
           e.title as event_title, e.date as event_date, e.time as event_time,
           e.location as event_location, e.price_pence
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  db.prepare('UPDATE bookings SET status = ?, payment_reference = ? WHERE id = ?')
    .run('confirmed', ref, req.params.id);

  // Record payment (only for free bookings via this route — paid ones are recorded in the provider-specific route)
  if (!ref) {
    db.prepare(`INSERT INTO payments (booking_id, amount_pence, status) VALUES (?, ?, 'succeeded')`)
      .run(req.params.id, booking.total_pence || 0);
  }

  // Send confirmation email (non-blocking)
  sendBookingConfirmation(booking).catch(err => console.error('Email error:', err));

  res.json({ success: true, bookingId: booking.id });
});

module.exports = router;
