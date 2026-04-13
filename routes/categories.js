const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/categories — public, with event counts
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name,
      (SELECT COUNT(*) FROM events e WHERE e.category = c.name AND e.is_active = 1) as event_count
    FROM categories c
    ORDER BY c.name
  `).all();
  res.json(rows);
});

// POST /api/categories — admin only
router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(trimmed);
  if (existing) return res.status(400).json({ error: 'Category already exists' });
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(trimmed);
  res.json({ id: result.lastInsertRowid, name: trimmed });
});

// DELETE /api/categories/:id — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const inUse = db.prepare('SELECT COUNT(*) as n FROM events WHERE category = ?').get(cat.name);
  if (inUse.n > 0) return res.status(400).json({ error: `Cannot delete — ${inUse.n} event(s) use this category` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
