const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { buildInvoicePdf } = require('../services/invoice-pdf');

const SETTING_KEYS = [
  'invoice_prefix', 'invoice_next_number', 'invoice_payment_terms_days',
  'invoice_business_address', 'invoice_business_email',
  'invoice_bank_account_name', 'invoice_bank_sort_code', 'invoice_bank_account_number',
  'invoice_footer_note',
];

function getSettings(keys) {
  const rows = keys
    ? db.prepare(`SELECT key, value FROM site_settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys)
    : db.prepare('SELECT key, value FROM site_settings').all();
  const s = {};
  rows.forEach(r => (s[r.key] = r.value));
  return s;
}

// Clean up line items from the form and work out the total in pence.
function normaliseItems(rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(i => ({
      description: String(i.description || '').trim().slice(0, 500),
      details: String(i.details || '').trim().slice(0, 2000),
      quantity: Math.max(0, Number(i.quantity) || 0),
      unit_price_pence: Math.max(0, Math.round(Number(i.unit_price_pence) || 0)),
    }))
    .filter(i => i.description && i.quantity > 0);
  const total = items.reduce((sum, i) => sum + Math.round(i.quantity * i.unit_price_pence), 0);
  return { items, total };
}

function validate(body) {
  if (!String(body.client_name || '').trim()) return 'Client name is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.issue_date || '')) return 'Invoice date is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date || '')) return 'Due date is required';
  if (body.due_date < body.issue_date) return 'Due date can\'t be before the invoice date';
  return null;
}

const clientFields = body => [
  String(body.client_name || '').trim(),
  String(body.client_company || '').trim(),
  String(body.client_email || '').trim(),
  String(body.client_phone || '').trim(),
  String(body.client_address || '').trim(),
];

const PAID_SQL = '(SELECT COALESCE(SUM(p.amount_pence), 0) FROM invoice_payments p WHERE p.invoice_id = i.id)';

// Invoice row plus its payments, amount paid and balance.
function loadInvoice(id) {
  const invoice = db.prepare(`SELECT i.*, ${PAID_SQL} AS amount_paid_pence FROM invoices i WHERE i.id = ?`).get(id);
  if (!invoice) return null;
  invoice.payments = db.prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_on, id').all(id);
  invoice.balance_pence = Math.max(0, invoice.total_pence - invoice.amount_paid_pence);
  return invoice;
}

// Work out paid / unpaid from the payments recorded (void is left alone).
// Fully paid → 'paid' with paid_at = date of the last payment.
function syncInvoiceStatus(id) {
  const inv = loadInvoice(id);
  if (!inv || inv.status === 'void') return;
  const fullyPaid = inv.total_pence > 0 && inv.amount_paid_pence >= inv.total_pence;
  const lastPaidOn = inv.payments.length ? inv.payments[inv.payments.length - 1].paid_on : null;
  db.prepare("UPDATE invoices SET status = ?, paid_at = ?, updated_at = datetime('now') WHERE id = ?")
    .run(fullyPaid ? 'paid' : 'unpaid', fullyPaid ? lastPaidOn : null, id);
}

// GET /api/invoices — list
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT i.*, ${PAID_SQL} AS amount_paid_pence FROM invoices i ORDER BY i.issue_date DESC, i.id DESC`).all();
  const payments = db.prepare('SELECT * FROM invoice_payments ORDER BY paid_on, id').all();
  rows.forEach(r => {
    r.balance_pence = Math.max(0, r.total_pence - r.amount_paid_pence);
    r.payments = payments.filter(p => p.invoice_id === r.id);
  });
  res.json(rows);
});

// GET /api/invoices/settings — business + bank details shown on invoices
router.get('/settings', requireAdmin, (req, res) => {
  res.json(getSettings(SETTING_KEYS));
});

// PUT /api/invoices/settings
router.put('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO site_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  for (const key of SETTING_KEYS) {
    if (key in req.body) upsert.run(key, String(req.body[key] ?? '').trim());
  }
  res.json(getSettings(SETTING_KEYS));
});

// GET /api/invoices/:id
router.get('/:id', requireAdmin, (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// POST /api/invoices — create, assigning the next sequential number
router.post('/', requireAdmin, (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });
  const { items, total } = normaliseItems(req.body.items);
  if (!items.length) return res.status(400).json({ error: 'Add at least one line item' });

  try {
    db.exec('BEGIN');
    const s = getSettings(['invoice_prefix', 'invoice_next_number']);
    let next = Math.max(1, parseInt(s.invoice_next_number, 10) || 1);
    const prefix = s.invoice_prefix ?? 'PB-';
    // Skip any number already taken (e.g. if the counter was edited down).
    while (db.prepare('SELECT 1 FROM invoices WHERE invoice_number = ?').get(`${prefix}${String(next).padStart(4, '0')}`)) next++;
    const number = `${prefix}${String(next).padStart(4, '0')}`;

    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, client_name, client_company, client_email, client_phone, client_address,
                            issue_date, due_date, items, total_pence, notes, quote_id, customer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(number, ...clientFields(req.body), req.body.issue_date, req.body.due_date,
           JSON.stringify(items), total, String(req.body.notes || '').trim(),
           req.body.quote_id || null, req.body.customer_id || null);
    db.prepare("UPDATE site_settings SET value = ? WHERE key = 'invoice_next_number'").run(String(next + 1));
    db.exec('COMMIT');
    res.status(201).json(loadInvoice(result.lastInsertRowid));
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[POST /api/invoices] failed:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PUT /api/invoices/:id — edit details (number stays the same)
router.put('/:id', requireAdmin, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });
  const { items, total } = normaliseItems(req.body.items);
  if (!items.length) return res.status(400).json({ error: 'Add at least one line item' });

  db.prepare(`
    UPDATE invoices SET client_name = ?, client_company = ?, client_email = ?, client_phone = ?, client_address = ?,
      issue_date = ?, due_date = ?, items = ?, total_pence = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(...clientFields(req.body), req.body.issue_date, req.body.due_date,
         JSON.stringify(items), total, String(req.body.notes || '').trim(), req.params.id);
  syncInvoiceStatus(req.params.id); // the total may have changed
  res.json(loadInvoice(req.params.id));
});

// PATCH /api/invoices/:id/status — void, or restore a voided invoice
// ('unpaid' restores; paid / unpaid then follows the recorded payments).
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['unpaid', 'void'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (!loadInvoice(req.params.id)) return res.status(404).json({ error: 'Invoice not found' });
  db.prepare("UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  syncInvoiceStatus(req.params.id);
  res.json(loadInvoice(req.params.id));
});

// POST /api/invoices/:id/payments — record a payment received
router.post('/:id/payments', requireAdmin, (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'void') return res.status(400).json({ error: 'Can\'t record a payment on a void invoice' });
  const amount = Math.round(Number(req.body.amount_pence) || 0);
  if (amount <= 0) return res.status(400).json({ error: 'Enter the amount received' });
  if (amount > invoice.balance_pence) {
    return res.status(400).json({ error: `That's more than the balance due (£${(invoice.balance_pence / 100).toFixed(2)})` });
  }
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body.paid_on || '') ? req.body.paid_on : new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO invoice_payments (invoice_id, amount_pence, paid_on, note) VALUES (?, ?, ?, ?)')
    .run(req.params.id, amount, paidOn, String(req.body.note || '').trim().slice(0, 200));
  syncInvoiceStatus(req.params.id);
  res.status(201).json(loadInvoice(req.params.id));
});

// DELETE /api/invoices/:id/payments/:paymentId — remove a payment recorded by mistake
router.delete('/:id/payments/:paymentId', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM invoice_payments WHERE id = ? AND invoice_id = ?').run(req.params.paymentId, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Payment not found' });
  syncInvoiceStatus(req.params.id);
  res.json(loadInvoice(req.params.id));
});

// DELETE /api/invoices/:id
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM invoice_payments WHERE invoice_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ success: true });
});

// GET /api/invoices/:id/pdf — download as PDF
router.get('/:id/pdf', requireAdmin, (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoice_number.replace(/[^A-Za-z0-9-]/g, '')}.pdf"`);
  buildInvoicePdf(invoice, getSettings(), res);
});

module.exports = router;
