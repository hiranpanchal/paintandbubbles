const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/faqs — public
router.get('/', (req, res) => {
  const faqs = db.prepare(
    'SELECT * FROM faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json(faqs);
});

// GET /api/faqs/all — admin (includes inactive)
router.get('/all', requireAdmin, (req, res) => {
  const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC').all();
  res.json(faqs);
});

// POST /api/faqs — admin
router.post('/', requireAdmin, (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM faqs').get();
  const sort_order = (maxOrder.m ?? -1) + 1;
  const result = db.prepare(
    'INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)'
  ).run(question.trim(), answer.trim(), sort_order);
  res.status(201).json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/faqs/:id — admin
router.put('/:id', requireAdmin, (req, res) => {
  const { question, answer, is_active, sort_order } = req.body;
  const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  db.prepare(`
    UPDATE faqs SET question = ?, answer = ?, is_active = ?, sort_order = ? WHERE id = ?
  `).run(
    question    ?? faq.question,
    answer      ?? faq.answer,
    is_active   ?? faq.is_active,
    sort_order  ?? faq.sort_order,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id));
});

// DELETE /api/faqs/:id — admin
router.delete('/:id', requireAdmin, (req, res) => {
  const faq = db.prepare('SELECT id FROM faqs WHERE id = ?').get(req.params.id);
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// PATCH /api/faqs/reorder — admin (swap sort_order of two items)
router.patch('/reorder', requireAdmin, (req, res) => {
  const { id, direction } = req.body; // direction: 'up' | 'down'
  const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC').all();
  const idx  = faqs.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'FAQ not found' });

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= faqs.length) return res.json({ success: true });

  const a = faqs[idx];
  const b = faqs[swapIdx];
  db.prepare('UPDATE faqs SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
  db.prepare('UPDATE faqs SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
  res.json({ success: true });
});

module.exports = router;
