const router = require('express').Router();
const db = require('../database');
const { requireAdmin, isAdmin } = require('../middleware/auth');
const { spotsRemainingSql } = require('../services/holds');

const EVENT_STATUSES = ['active', 'draft', 'private'];

// Accept either the new `status` field or the legacy is_active flag, and
// return the pair to store (is_active mirrors status === 'active').
function resolveStatus(body, fallback) {
  let status = fallback;
  if (EVENT_STATUSES.includes(body.status)) status = body.status;
  else if (body.is_active !== undefined && body.is_active !== null) status = Number(body.is_active) ? 'active' : 'draft';
  return { status, is_active: status === 'active' ? 1 : 0 };
}

function toSlug(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function uniqueSlug(title, excludeId = null) {
  let slug = toSlug(title);
  let base = slug, counter = 2;
  while (db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(slug, excludeId ?? -1)) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// GET /api/events — public, with optional search/filter
router.get('/', (req, res) => {
  const { search, category, from, to, include_past, include_inactive } = req.query;
  // Draft (is_active = 0) events must stay hidden from the public listing, but
  // admin needs to see and manage them. Honour include_inactive only when the
  // caller presents a valid admin token — otherwise a public visitor could
  // enumerate drafts just by tacking the param on.
  const showInactive = include_inactive === 'true' && isAdmin(req);
  let query = `
    SELECT e.*,
      ${spotsRemainingSql('e')} as spots_remaining,
      (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id) as booking_count
    FROM events e
    WHERE 1=1
  `;
  if (!showInactive) query += ' AND e.is_active = 1';
  const params = [];

  // Hide past events from public listings by default. An event is considered
  // "today" until midnight, so a 10am session still appears in the listing
  // throughout that day. Admin passes include_past=true to bypass this filter.
  if (include_past !== 'true') {
    query += " AND e.date >= date('now')";
  }

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

// GET /api/events/:idOrSlug — public (accepts numeric id or slug). Drafts are
// only returned to admin callers (needed by the admin edit / clone forms).
router.get('/:idOrSlug', (req, res) => {
  const param = req.params.idOrSlug;
  const isNumeric = /^\d+$/.test(param);
  const whereClause = isNumeric ? 'e.id = ?' : 'e.slug = ?';

  const event = db.prepare(`
    SELECT e.*,
      ${spotsRemainingSql('e')} as spots_remaining,
      (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id) as booking_count
    FROM events e
    WHERE ${whereClause} ${isAdmin(req) ? '' : "AND e.status IN ('active','private')"}
  `).get(param);

  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// Normalise incoming upsell fields: a blank name means "no upsell",
// price is coerced to a non-negative integer pence value.
function normaliseUpsell(body) {
  const nameRaw = (body.upsell_name ?? '').toString().trim();
  const name = nameRaw ? nameRaw.slice(0, 100) : null;
  const price = name ? Math.max(0, Math.round(Number(body.upsell_price_pence) || 0)) : 0;
  return { upsell_name: name, upsell_price_pence: price };
}

// POST /api/events — admin only
router.post('/', requireAdmin, (req, res) => {
  const { title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url } = req.body;
  if (!title || !date || !time || !location || !capacity || price_pence === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { upsell_name, upsell_price_pence } = normaliseUpsell(req.body);
  const { status, is_active } = resolveStatus(req.body, 'active');

  const slug = uniqueSlug(title);
  const result = db.prepare(`
    INSERT INTO events (title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url, slug, upsell_name, upsell_price_pence, status, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', category || 'General', date, time, duration_minutes || 120, location, capacity, price_pence, image_url || null, slug, upsell_name, upsell_price_pence, status, is_active);

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(event);
});

// PUT /api/events/:id — admin only
router.put('/:id', requireAdmin, (req, res) => {
  const { title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url } = req.body;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Regenerate slug if title has changed
  const newTitle = title ?? event.title;
  const slug = (title && title !== event.title) ? uniqueSlug(title, parseInt(req.params.id)) : (event.slug || uniqueSlug(event.title, parseInt(req.params.id)));

  // Only overwrite upsell fields when the client explicitly sent them —
  // otherwise a partial update (e.g. toggling is_active) would clear the
  // upsell by accident.
  const upsellProvided = 'upsell_name' in req.body || 'upsell_price_pence' in req.body;
  const { upsell_name, upsell_price_pence } = upsellProvided
    ? normaliseUpsell(req.body)
    : { upsell_name: event.upsell_name, upsell_price_pence: event.upsell_price_pence };
  const { status, is_active } = resolveStatus(req.body, event.status || (event.is_active ? 'active' : 'draft'));

  db.prepare(`
    UPDATE events SET
      title = ?, description = ?, category = ?, date = ?, time = ?,
      duration_minutes = ?, location = ?, capacity = ?, price_pence = ?, image_url = ?, is_active = ?, status = ?, slug = ?,
      upsell_name = ?, upsell_price_pence = ?
    WHERE id = ?
  `).run(
    newTitle,
    description ?? event.description,
    category ?? event.category,
    date ?? event.date,
    time ?? event.time,
    duration_minutes ?? event.duration_minutes,
    location ?? event.location,
    capacity ?? event.capacity,
    price_pence ?? event.price_pence,
    image_url ?? event.image_url,
    is_active,
    status,
    slug,
    upsell_name,
    upsell_price_pence,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id));
});

// DELETE /api/events/:id — admin only. Permanently deletes the event whatever
// its status. If it has bookings, the caller must pass ?force=true (after
// warning the admin); those bookings, their payments and waitlist rows go too.
router.delete('/:id', requireAdmin, (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const { count } = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE event_id = ?').get(req.params.id);
  if (count > 0 && req.query.force !== 'true') {
    return res.status(409).json({ error: `This event has ${count} booking(s)`, booking_count: count });
  }

  try {
    db.exec('BEGIN');
    const bookingIds = 'SELECT id FROM bookings WHERE event_id = ?';
    db.prepare(`DELETE FROM payments WHERE booking_id IN (${bookingIds})`).run(req.params.id);
    db.prepare(`UPDATE gift_vouchers SET used_booking_id = NULL WHERE used_booking_id IN (${bookingIds})`).run(req.params.id);
    db.prepare('DELETE FROM bookings WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM event_waitlist WHERE event_id = ?').run(req.params.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[DELETE /api/events/:id] failed:', err);
    return res.status(500).json({ error: 'Failed to delete event' });
  }
  res.json({ success: true, deleted_bookings: count });
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
