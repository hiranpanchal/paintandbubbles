const router = require('express').Router();
const db     = require('../database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/discounts/validate?code=XXX — public
router.get('/validate', (req, res) => {
  const { code, order_pence } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const dc = db.prepare('SELECT * FROM discount_codes WHERE code = ?').get(code.toUpperCase().trim());

  if (!dc || !dc.is_active) {
    return res.json({ valid: false, message: 'Discount code not found or no longer active.' });
  }
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) {
    return res.json({ valid: false, message: 'This discount code has expired.' });
  }
  if (dc.max_uses !== null && dc.used_count >= dc.max_uses) {
    return res.json({ valid: false, message: 'This discount code has reached its maximum uses.' });
  }

  const orderPence = parseInt(order_pence) || 0;
  if (dc.min_order_pence > 0 && orderPence < dc.min_order_pence) {
    return res.json({
      valid: false,
      message: `Minimum order of £${(dc.min_order_pence / 100).toFixed(2)} required for this code.`
    });
  }

  let discountPence = 0;
  if (dc.discount_type === 'percentage') {
    discountPence = Math.round((orderPence * dc.discount_value) / 100);
  } else {
    discountPence = dc.discount_value;
  }
  discountPence = Math.min(discountPence, orderPence);

  const label = dc.discount_type === 'percentage'
    ? `${dc.discount_value}% off`
    : `£${(dc.discount_value / 100).toFixed(2)} off`;

  res.json({
    valid: true,
    discount_type: dc.discount_type,
    discount_value: dc.discount_value,
    discount_pence: discountPence,
    message: `✓ ${label} applied${dc.name ? ` — ${dc.name}` : ''}`
  });
});

// GET /api/discounts — admin only
router.get('/', requireAdmin, (req, res) => {
  const codes = db.prepare('SELECT * FROM discount_codes ORDER BY created_at DESC').all();
  res.json(codes);
});

// POST /api/discounts — admin only
router.post('/', requireAdmin, (req, res) => {
  const { code, name, discount_type, discount_value, min_order_pence, max_uses, expires_at } = req.body;

  if (!code || !code.trim()) return res.status(400).json({ error: 'Code is required.' });
  if (!['percentage', 'fixed'].includes(discount_type)) return res.status(400).json({ error: 'discount_type must be percentage or fixed.' });
  if (!discount_value || discount_value <= 0) return res.status(400).json({ error: 'discount_value must be a positive number.' });
  if (discount_type === 'percentage' && discount_value > 100) return res.status(400).json({ error: 'Percentage discount cannot exceed 100.' });

  const upperCode = code.toUpperCase().trim();
  const existing = db.prepare('SELECT id FROM discount_codes WHERE code = ?').get(upperCode);
  if (existing) return res.status(400).json({ error: 'A discount code with this code already exists.' });

  const result = db.prepare(`
    INSERT INTO discount_codes (code, name, discount_type, discount_value, min_order_pence, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    upperCode,
    name ? name.trim() : '',
    discount_type,
    discount_type === 'percentage' ? Math.round(discount_value) : Math.round(discount_value * 100),
    min_order_pence ? Math.round(min_order_pence * 100) : 0,
    max_uses ? parseInt(max_uses) : null,
    expires_at || null
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// PATCH /api/discounts/:id/toggle — admin only
router.patch('/:id/toggle', requireAdmin, (req, res) => {
  const dc = db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(req.params.id);
  if (!dc) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE discount_codes SET is_active = ? WHERE id = ?').run(dc.is_active ? 0 : 1, dc.id);
  res.json({ success: true, is_active: !dc.is_active });
});

// DELETE /api/discounts/:id — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const dc = db.prepare('SELECT id FROM discount_codes WHERE id = ?').get(req.params.id);
  if (!dc) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM discount_codes WHERE id = ?').run(dc.id);
  res.json({ success: true });
});

module.exports = router;
