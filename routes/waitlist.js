const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendWaitlistConfirmation, sendWaitlistSpotAvailable } = require('../services/email');

// POST /api/waitlist — public, join waitlist for a full event
router.post('/', (req, res) => {
  const { event_id, name, email, phone } = req.body;
  if (!event_id || !name || !email) {
    return res.status(400).json({ error: 'Event, name and email are required' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ? AND is_active = 1').get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Prevent duplicates
  const existing = db.prepare(
    'SELECT id FROM event_waitlist WHERE event_id = ? AND email = ?'
  ).get(event_id, email.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "You're already on the waitlist for this event" });
  }

  const result = db.prepare(
    'INSERT INTO event_waitlist (event_id, name, email, phone) VALUES (?, ?, ?, ?)'
  ).run(event_id, name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : '');

  const entry = db.prepare('SELECT * FROM event_waitlist WHERE id = ?').get(result.lastInsertRowid);

  // Send confirmation email (non-blocking)
  sendWaitlistConfirmation(entry, event).catch(err =>
    console.error('[Email] Waitlist confirmation failed:', err.message)
  );

  res.status(201).json({ success: true });
});

// GET /api/waitlist/counts — admin, waitlist count per event (un-notified only)
router.get('/counts', requireAdmin, (req, res) => {
  const rows = db.prepare(
    'SELECT event_id, COUNT(*) as count FROM event_waitlist WHERE notified_at IS NULL GROUP BY event_id'
  ).all();
  const counts = {};
  rows.forEach(r => { counts[r.event_id] = r.count; });
  res.json(counts);
});

// GET /api/waitlist/event/:id — admin, get full waitlist for an event
router.get('/event/:id', requireAdmin, (req, res) => {
  const list = db.prepare(
    'SELECT * FROM event_waitlist WHERE event_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(list);
});

// DELETE /api/waitlist/:id — admin, remove someone from waitlist
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM event_waitlist WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Internal helper — call when a booking is cancelled/deleted to notify next person
function notifyNextOnWaitlist(eventId) {
  const next = db.prepare(
    'SELECT * FROM event_waitlist WHERE event_id = ? AND notified_at IS NULL ORDER BY created_at ASC LIMIT 1'
  ).get(eventId);
  if (!next) return;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return;

  db.prepare("UPDATE event_waitlist SET notified_at = datetime('now') WHERE id = ?").run(next.id);

  sendWaitlistSpotAvailable(next, event).catch(err =>
    console.error('[Email] Waitlist spot-available failed:', err.message)
  );
}

module.exports = router;
module.exports.notifyNextOnWaitlist = notifyNextOnWaitlist;
