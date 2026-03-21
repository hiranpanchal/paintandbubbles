const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/reviews — public, returns only published reviews
router.get('/', (req, res) => {
  const reviews = db.prepare(
    'SELECT * FROM reviews WHERE is_published = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json(reviews);
});

// GET /api/reviews/all — admin (includes unpublished)
router.get('/all', requireAdmin, (req, res) => {
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY sort_order ASC, id ASC').all();
  res.json(reviews);
});

// POST /api/reviews — admin
router.post('/', requireAdmin, (req, res) => {
  const { author_name, author_location, rating, body, is_published } = req.body;
  if (!author_name || !body) return res.status(400).json({ error: 'Author name and review text are required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM reviews').get();
  const sort_order = (maxOrder.m ?? -1) + 1;
  const result = db.prepare(
    'INSERT INTO reviews (author_name, author_location, rating, body, is_published, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    author_name.trim(),
    (author_location || '').trim(),
    rating ?? 5,
    body.trim(),
    is_published ?? 0,
    sort_order
  );
  res.status(201).json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/reviews/:id — admin
router.put('/:id', requireAdmin, (req, res) => {
  const { author_name, author_location, rating, body, is_published, sort_order } = req.body;
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  db.prepare(`
    UPDATE reviews SET author_name = ?, author_location = ?, rating = ?, body = ?, is_published = ?, sort_order = ? WHERE id = ?
  `).run(
    author_name    ?? review.author_name,
    author_location !== undefined ? author_location : review.author_location,
    rating         ?? review.rating,
    body           ?? review.body,
    is_published   ?? review.is_published,
    sort_order     ?? review.sort_order,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id));
});

// DELETE /api/reviews/:id — admin
router.delete('/:id', requireAdmin, (req, res) => {
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PATCH /api/reviews/reorder — admin (swap sort_order of two items)
router.patch('/reorder', requireAdmin, (req, res) => {
  const { id, direction } = req.body; // direction: 'up' | 'down'
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY sort_order ASC, id ASC').all();
  const idx = reviews.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found' });

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= reviews.length) return res.json({ success: true });

  const a = reviews[idx];
  const b = reviews[swapIdx];
  db.prepare('UPDATE reviews SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
  db.prepare('UPDATE reviews SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
  res.json({ success: true });
});

module.exports = router;
