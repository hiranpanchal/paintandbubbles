const router = require('express').Router();
const https  = require('https');
const db     = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Read a setting from the DB, falling back to an env var
function getSetting(dbKey, envKey) {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(dbKey);
    if (row && row.value) return row.value;
  } catch {}
  return (envKey && process.env[envKey]) || '';
}

function getStripe() {
  const key = getSetting('stripe_secret_key', 'STRIPE_SECRET_KEY');
  if (!key) return null;
  try { return require('stripe')(key); } catch { return null; }
}

// Simple HTTPS POST/GET helper for SumUp REST API
function sumupRequest(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.sumup.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  let code, existing;
  do {
    code = `PB-${seg()}-${seg()}`;
    existing = db.prepare('SELECT id FROM gift_vouchers WHERE code = ?').get(code);
  } while (existing);
  return code;
}

// POST /api/vouchers/purchase
router.post('/purchase', async (req, res) => {
  const { amount_pence, purchaser_name, purchaser_email, recipient_name, recipient_email, message } = req.body;

  if (!amount_pence || typeof amount_pence !== 'number') return res.status(400).json({ error: 'amount_pence must be a number' });
  if (amount_pence < 500) return res.status(400).json({ error: 'Minimum voucher amount is £5.00' });
  if (amount_pence > 50000) return res.status(400).json({ error: 'Maximum voucher amount is £500.00' });
  if (!purchaser_name || !purchaser_name.trim()) return res.status(400).json({ error: 'Your name is required' });
  if (!purchaser_email || !purchaser_email.trim()) return res.status(400).json({ error: 'Your email is required' });

  const code = generateVoucherCode();

  const result = db.prepare(`
    INSERT INTO gift_vouchers (code, amount_pence, purchaser_name, purchaser_email, recipient_name, recipient_email, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(code, amount_pence, purchaser_name.trim(), purchaser_email.trim(),
         recipient_name ? recipient_name.trim() : null,
         recipient_email ? recipient_email.trim() : null,
         message ? message.trim() : null);

  const voucherId = result.lastInsertRowid;

  const stripeEnabled = getSetting('stripe_enabled', '') === 'true';
  const sumupEnabled  = getSetting('sumup_enabled', '') === 'true';

  if (stripeEnabled) {
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ error: 'Stripe is not configured' });
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount_pence,
        currency: 'gbp',
        metadata: { voucher_id: String(voucherId) },
        receipt_email: purchaser_email.trim()
      });
      return res.json({ voucher_id: voucherId, code, provider: 'stripe', clientSecret: paymentIntent.client_secret });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (sumupEnabled) {
    const apiKey       = getSetting('sumup_api_key', 'SUMUP_API_KEY');
    const merchantCode = getSetting('sumup_merchant_code', 'SUMUP_MERCHANT_CODE');
    if (!apiKey || !merchantCode) return res.status(500).json({ error: 'SumUp is not configured' });
    try {
      const result2 = await sumupRequest('POST', '/v0.1/checkouts', {
        checkout_reference: `PBV-${voucherId}-${Date.now()}`,
        amount: parseFloat((amount_pence / 100).toFixed(2)),
        currency: 'GBP',
        merchant_code: merchantCode,
        description: `Paint & Bubbles Gift Voucher — ${code}`
      }, apiKey);
      if (result2.status !== 200 && result2.status !== 201) {
        return res.status(500).json({ error: result2.body?.message || 'SumUp checkout creation failed' });
      }
      return res.json({ voucher_id: voucherId, code, provider: 'sumup', checkoutId: result2.body.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // No payment provider — for testing or free vouchers scenario
  return res.json({ voucher_id: voucherId, code, provider: 'none' });
});

// POST /api/vouchers/confirm
router.post('/confirm', async (req, res) => {
  const { voucher_id, payment_reference } = req.body;
  if (!voucher_id) return res.status(400).json({ error: 'voucher_id required' });

  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(voucher_id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.status !== 'pending') return res.status(400).json({ error: `Voucher is already ${voucher.status}` });

  db.prepare("UPDATE gift_vouchers SET status='active', payment_reference=? WHERE id=?")
    .run(payment_reference || null, voucher_id);

  const updatedVoucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(voucher_id);
  const { sendGiftVoucher } = require('../services/email');
  sendGiftVoucher(updatedVoucher).catch(console.error);

  res.json({ success: true, code: voucher.code });
});

// POST /api/vouchers/sumup-confirm
router.post('/sumup-confirm', async (req, res) => {
  const apiKey = getSetting('sumup_api_key', 'SUMUP_API_KEY');
  if (!apiKey) return res.status(500).json({ error: 'SumUp is not configured' });

  const { checkout_id, voucher_id } = req.body;
  if (!checkout_id || !voucher_id) return res.status(400).json({ error: 'checkout_id and voucher_id required' });

  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(voucher_id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.status !== 'pending') return res.status(400).json({ error: `Voucher is already ${voucher.status}` });

  try {
    const result = await sumupRequest('GET', `/v0.1/checkouts/${checkout_id}`, null, apiKey);
    if (result.status !== 200) return res.status(500).json({ error: 'Could not verify payment' });

    const checkout = result.body;
    if (checkout.status !== 'PAID') return res.status(400).json({ error: `Payment not completed (status: ${checkout.status})` });

    db.prepare("UPDATE gift_vouchers SET status='active', payment_reference=? WHERE id=?")
      .run(checkout_id, voucher_id);

    const updatedVoucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(voucher_id);
    const { sendGiftVoucher } = require('../services/email');
    sendGiftVoucher(updatedVoucher).catch(console.error);

    res.json({ success: true, code: voucher.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vouchers/validate?code=XXX
router.get('/validate', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE code = ?').get(code.toUpperCase().trim());
  if (!voucher || voucher.status !== 'active') {
    return res.json({ valid: false, message: 'Voucher not found or not active' });
  }
  res.json({ valid: true, amount_pence: voucher.amount_pence, message: `Valid voucher — worth £${(voucher.amount_pence / 100).toFixed(2)}` });
});

// POST /api/vouchers/redeem
router.post('/redeem', (req, res) => {
  const { code, booking_id } = req.body;
  if (!code || !booking_id) return res.status(400).json({ error: 'code and booking_id required' });

  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE code = ?').get(code.toUpperCase().trim());
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.status !== 'active') return res.status(400).json({ error: `Voucher is not active (status: ${voucher.status})` });

  db.prepare("UPDATE gift_vouchers SET status='used', used_booking_id=? WHERE id=?")
    .run(booking_id, voucher.id);

  res.json({ success: true });
});

// GET /api/vouchers — admin only
router.get('/', requireAdmin, (req, res) => {
  const vouchers = db.prepare('SELECT * FROM gift_vouchers ORDER BY created_at DESC').all();
  res.json(vouchers);
});

// DELETE /api/vouchers/:id — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const voucher = db.prepare('SELECT id FROM gift_vouchers WHERE id = ?').get(id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

  db.prepare("UPDATE gift_vouchers SET status='cancelled' WHERE id=?").run(id);
  res.json({ success: true });
});

module.exports = router;
