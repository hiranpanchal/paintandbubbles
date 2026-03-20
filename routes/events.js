const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/events — public, with optional search/filter
router.get('/', (req, res) => {
  const { search, category, from, to } = req.query;
  let query = `
    SELECT e.*,
      (e.capacity - COALESCE(
        (SELECT SUM(b.quantity) FROM bookings b WHERE b.event_id = e.id AND b.status IN ('confirmed','pending')),
        0
      )) as spots_remaining
    FROM events e
    WHERE e.is_active = 1
  `;
  const params = [];

  if (search) {
    query += ' AND (e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    query += ' AND e.category = ?';
    params.push(category);
  }
  if (from) {
    query += ' AND e.date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND e.date <= ?';
    params.push(to);
  }

  query += ' ORDER BY e.date ASC, e.time ASC';

  const events = db.prepare(query).all(...params);
  res.json(events);
});

// GET /api/events/categories — public
router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM events WHERE is_active = 1 ORDER BY category').all();
  res.json(cats.map(c => c.category));
});

// GET /api/events/:id — public
router.get('/:id', (req, res) => {
  const event = db.prepare(`
    SELECT e.*,
      (e.capacity - COALESCE(
        (SELECT SUM(b.quantity) FROM bookings b WHERE b.event_id = e.id AND b.status IN ('confirmed','pending')),
        0
      )) as spots_remaining
    FROM events e
    WHERE e.id = ? AND e.is_active = 1
  `).get(req.params.id);

  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// POST /api/events — admin only
router.post('/', requireAdmin, (req, res) => {
  const { title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url } = req.body;
  if (!title || !date || !time || !location || !capacity || price_pence === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = db.prepare(`
    INSERT INTO events (title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', category || 'General', date, time, duration_minutes || 120, location, capacity, price_pence, image_url || null);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(event);
});

// PUT /api/events/:id — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url, is_active } = req.body;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  db.prepare(`
    UPDATE events SET
      title = ?, description = ?, category = ?, date = ?, time = ?,
      duration_minutes = ?, location = ?, capacity = ?, price_pence = ?, image_url = ?, is_active = ?
    WHERE id = ?
  `).run(
    title ?? event.title,
    description ?? event.description,
    category ?? event.category,
    date ?? event.date,
    time ?? event.time,
    duration_minutes ?? event.duration_minutes,
    location ?? event.location,
    capacity ?? event.capacity,
    price_pence ?? event.price_pence,
    image_url ?? event.image_url,
    is_active ?? event.is_active,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

// DELETE /api/events/:id — admin only (soft delete)
router.delete('/:id', requireAdmin, (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/events/:id/bookings — admin only
router.get('/:id/bookings', requireAdmin, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    WHERE b.event_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.id);
  res.json(bookings);
});

module.exports = router;
