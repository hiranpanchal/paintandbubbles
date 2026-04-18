const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendPrivateQuoteToAdmin, sendPrivateQuoteConfirmation } = require('../services/email');

// ─── Config helpers ───────────────────────────────────────────────────────────

function getConfig() {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'pe_quote_config'").get();
  if (!row) return getDefaultConfig();
  try { return JSON.parse(row.value); } catch { return getDefaultConfig(); }
}

function getDefaultConfig() {
  return {
    activities: [
      { name: 'Sip & Paint',          price_pence: 3500 },
      { name: 'Canvas Workshop',       price_pence: 4000 },
      { name: 'Watercolour Workshop',  price_pence: 3500 },
      { name: 'Life Drawing',          price_pence: 4500 },
      { name: 'Craft Night',           price_pence: 3000 },
      { name: "Kids' Art Party",       price_pence: 2500 },
      { name: 'Custom / Other',        price_pence: 3500 },
    ],
    group_sizes: [
      { label: '6–10',  min: 6,  max: 10 },
      { label: '11–15', min: 11, max: 15 },
      { label: '16–20', min: 16, max: 20 },
      { label: '21–30', min: 21, max: 30 },
      { label: '30+',   min: 30, max: 50 },
    ],
    venues: ['Your venue', 'Our venue', 'Flexible'],
  };
}

function calculateEstimate(activityType, groupSize) {
  const config = getConfig();
  const activity = config.activities.find(a => a.name === activityType);
  const ppp = activity ? activity.price_pence : 3500;

  const sizeObj = config.group_sizes.find(s => s.label === groupSize);
  const range = sizeObj ? { min: sizeObj.min, max: sizeObj.max } : { min: 10, max: 20 };

  // Volume discount for larger groups
  let discount = 1.0;
  if (range.min >= 21) discount = 0.9;
  else if (range.min >= 11) discount = 0.95;

  const low  = Math.round(ppp * range.min * discount / 100) * 100;
  const high = Math.round(ppp * range.max * discount / 100) * 100;
  return { low, high }; // pence
}

// ─── Public routes ────────────────────────────────────────────────────────────

// GET /api/private-quotes/config — public, form config for the page to render
router.get('/config', (req, res) => {
  res.json(getConfig());
});

// POST /api/private-quotes — public, submit a quote request
router.post('/', (req, res) => {
  const {
    name, email, phone,
    group_size, preferred_date, date_flexible,
    activity_type, venue_preference,
    notes, how_heard,
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
    '', // budget_range no longer collected
    notes ? notes.trim() : '',
    how_heard ? how_heard.trim() : '',
    estimate.low,
    estimate.high,
  );

  const quote = db.prepare('SELECT * FROM private_event_quotes WHERE id = ?').get(result.lastInsertRowid);
  const quoteRef = `#PQ${String(quote.id).padStart(5, '0')}`;

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

// ─── Admin routes ─────────────────────────────────────────────────────────────

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

// PUT /api/private-quotes/config — admin, save form config
router.put('/config', requireAdmin, (req, res) => {
  const { activities, group_sizes, venues } = req.body;

  // Validate shape
  if (!Array.isArray(activities) || !Array.isArray(group_sizes) || !Array.isArray(venues)) {
    return res.status(400).json({ error: 'Invalid config format' });
  }
  if (activities.length === 0) return res.status(400).json({ error: 'At least one activity is required' });
  if (group_sizes.length  === 0) return res.status(400).json({ error: 'At least one group size is required' });
  if (venues.length       === 0) return res.status(400).json({ error: 'At least one venue option is required' });

  const sanitised = {
    activities: activities.map(a => ({
      name:        String(a.name || '').trim(),
      price_pence: Math.max(0, parseInt(a.price_pence) || 0),
    })).filter(a => a.name),
    group_sizes: group_sizes.map(s => ({
      label: String(s.label || '').trim(),
      min:   Math.max(1, parseInt(s.min) || 1),
      max:   Math.max(1, parseInt(s.max) || 1),
    })).filter(s => s.label),
    venues: venues.map(v => String(v || '').trim()).filter(Boolean),
  };

  db.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('pe_quote_config', ?)").run(
    JSON.stringify(sanitised)
  );

  res.json({ success: true, config: sanitised });
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
