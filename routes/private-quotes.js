const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendPrivateQuoteToAdmin, sendPrivateQuoteConfirmation } = require('../services/email');

// Per-person prices in pence for each activity type
const PRICE_PER_PERSON = {
  'Sip & Paint':          3500,
  'Canvas Workshop':      4000,
  'Watercolour Workshop': 3500,
  'Life Drawing':         4500,
  'Craft Night':          3000,
  "Kids' Art Party":      2500,
  'Custom / Other':       3500,
};

// Group size text → { min, max }
const GROUP_SIZE_RANGES = {
  '6–10':  { min: 6,  max: 10 },
  '11–15': { min: 11, max: 15 },
  '16–20': { min: 16, max: 20 },
  '21–30': { min: 21, max: 30 },
  '30+':   { min: 30, max: 50 },
};

function calculateEstimate(activityType, groupSize) {
  const ppp = PRICE_PER_PERSON[activityType] || 3500;
  const range = GROUP_SIZE_RANGES[groupSize] || { min: 10, max: 20 };

  // Small volume discount for larger groups
  let discount = 1.0;
  if (range.min >= 21) discount = 0.9;
  else if (range.min >= 11) discount = 0.95;

  const low  = Math.round(ppp * range.min * discount / 100) * 100; // round to nearest £1
  const high = Math.round(ppp * range.max * discount / 100) * 100;
  return { low, high }; // in pence
}

// POST /api/private-quotes — public, submit a quote request
router.post('/', (req, res) => {
  const {
    name, email, phone,
    group_size, preferred_date, date_flexible,
    activity_type, venue_preference,
    budget_range, notes, how_heard,
  } = req.body;

  if (!name || !email || !group_size || !activity_type) {
    return res.status(400).json({ error: 'Name, email, group size and activity type are required' });
  }

  const estimate = calculateEstimate(activity_type, group_size);

  const result = db.prepare(`
    INSERT INTO private_event_quotes
      (name, email, phone, group_size, preferred_date, date_flexible,
       activity_type, venue_preference, budget_range, notes, how_heard,
       estimate_low, estimate_high)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    email.trim(),
    phone ? phone.trim() : '',
    group_size,
    preferred_date || '',
    date_flexible ? 1 : 0,
    activity_type,
    venue_preference || '',
    budget_range || '',
    notes ? notes.trim() : '',
    how_heard ? how_heard.trim() : '',
    estimate.low,
    estimate.high,
  );

  const quote = db.prepare('SELECT * FROM private_event_quotes WHERE id = ?').get(result.lastInsertRowid);
  const quoteRef = `#PQ${String(quote.id).padStart(5, '0')}`;

  // Notification email
  const notifSetting = db.prepare("SELECT value FROM site_settings WHERE key = 'notification_email'").get();
  const notificationEmail = notifSetting?.value || process.env.NOTIFICATION_EMAIL || '';

  sendPrivateQuoteToAdmin(quote, notificationEmail).catch(err =>
    console.error('[Email] Private quote admin notif failed:', err.message)
  );
  sendPrivateQuoteConfirmation(quote).catch(err =>
    console.error('[Email] Private quote confirmation failed:', err.message)
  );

  res.status(201).json({ success: true, quote_ref: quoteRef, estimate });
});

// GET /api/private-quotes — admin, list all quotes
router.get('/', requireAdmin, (req, res) => {
  const quotes = db.prepare(
    'SELECT * FROM private_event_quotes ORDER BY created_at DESC'
  ).all();
  res.json(quotes);
});

// GET /api/private-quotes/unread-count — admin
router.get('/unread-count', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM private_event_quotes WHERE is_read = 0').get();
  res.json({ count: row.count });
});

// PATCH /api/private-quotes/:id/read — admin
router.patch('/:id/read', requireAdmin, (req, res) => {
  db.prepare('UPDATE private_event_quotes SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/private-quotes/:id — admin
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM private_event_quotes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
