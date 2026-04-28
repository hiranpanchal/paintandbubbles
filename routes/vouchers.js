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
  const { sendGiftVoucher, sendAdminVoucherNotification } = require('../services/email');
  sendGiftVoucher(updatedVoucher).catch(console.error);
  const notifSetting = db.prepare("SELECT value FROM site_settings WHERE key = 'notification_email'").get();
  const notificationEmail = notifSetting?.value || process.env.NOTIFICATION_EMAIL || '';
  sendAdminVoucherNotification(updatedVoucher, notificationEmail).catch(console.error);

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
    const { sendGiftVoucher, sendAdminVoucherNotification } = require('../services/email');
    sendGiftVoucher(updatedVoucher).catch(console.error);
    const notifSetting2 = db.prepare("SELECT value FROM site_settings WHERE key = 'notification_email'").get();
    const notificationEmail2 = notifSetting2?.value || process.env.NOTIFICATION_EMAIL || '';
    sendAdminVoucherNotification(updatedVoucher, notificationEmail2).catch(console.error);

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

// POST /api/vouchers — admin only (manually issue a voucher, e.g. comp / staff giveaway)
// Skips the payment flow entirely. Defaults to status='active' so the code is
// usable immediately. Optionally emails the recipient.
router.post('/', requireAdmin, async (req, res) => {
  const {
    amount_pence,
    purchaser_name, purchaser_email,
    recipient_name, recipient_email, message,
    status, send_email
  } = req.body;

  if (!amount_pence || typeof amount_pence !== 'number') return res.status(400).json({ error: 'amount_pence must be a number' });
  if (amount_pence < 100) return res.status(400).json({ error: 'Minimum voucher amount is £1.00' });
  if (amount_pence > 100000) return res.status(400).json({ error: 'Maximum voucher amount is £1000.00' });

  const allowedStatuses = ['pending', 'active', 'used', 'cancelled'];
  const finalStatus = allowedStatuses.includes(status) ? status : 'active';

  // Sensible defaults for the manual case — purchaser metadata isn't meaningful
  // when an admin issues the voucher, but the columns are NOT NULL so we fill them.
  const pName  = (purchaser_name && purchaser_name.trim()) || 'Manual issue';
  const pEmail = (purchaser_email && purchaser_email.trim()) ||
                 getSetting('notification_email', 'NOTIFICATION_EMAIL') ||
                 'admin@paintandbubbles.co.uk';

  const code = generateVoucherCode();

  const result = db.prepare(`
    INSERT INTO gift_vouchers (code, amount_pence, purchaser_name, purchaser_email, recipient_name, recipient_email, message, status, payment_reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `).run(code, amount_pence, pName, pEmail,
         recipient_name ? recipient_name.trim() : null,
         recipient_email ? recipient_email.trim() : null,
         message ? message.trim() : null,
         finalStatus);

  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(result.lastInsertRowid);

  // If asked, email the recipient now (active vouchers only — pending shouldn't ship yet).
  if (send_email && finalStatus === 'active' && voucher.recipient_email) {
    try {
      const { sendGiftVoucher } = require('../services/email');
      sendGiftVoucher(voucher).catch(err => console.error('[Email] Manual voucher send failed:', err));
    } catch (err) {
      console.error('[Email] Manual voucher dispatch error:', err);
    }
  }

  res.status(201).json(voucher);
});

// PATCH /api/vouchers/:id — admin only (edit mutable fields)
router.patch('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

  const allowedStatuses = ['pending', 'active', 'used', 'cancelled'];
  const updates = [];
  const params  = [];

  const { amount_pence, purchaser_name, purchaser_email, recipient_name, recipient_email, message, status } = req.body;

  if (typeof amount_pence === 'number') {
    if (amount_pence < 100 || amount_pence > 100000) return res.status(400).json({ error: 'amount must be between £1 and £1000' });
    updates.push('amount_pence = ?'); params.push(amount_pence);
  }
  if (typeof purchaser_name === 'string')  { updates.push('purchaser_name = ?');  params.push(purchaser_name.trim()  || voucher.purchaser_name); }
  if (typeof purchaser_email === 'string') { updates.push('purchaser_email = ?'); params.push(purchaser_email.trim() || voucher.purchaser_email); }
  if (typeof recipient_name === 'string')  { updates.push('recipient_name = ?');  params.push(recipient_name.trim()  || null); }
  if (typeof recipient_email === 'string') { updates.push('recipient_email = ?'); params.push(recipient_email.trim() || null); }
  if (typeof message === 'string')         { updates.push('message = ?');         params.push(message.trim()         || null); }
  if (status !== undefined) {
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    updates.push('status = ?'); params.push(status);
  }

  if (!updates.length) return res.json(voucher);

  params.push(id);
  db.prepare(`UPDATE gift_vouchers SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/vouchers/:id — admin only (hard delete)
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const voucher = db.prepare('SELECT id FROM gift_vouchers WHERE id = ?').get(id);
  if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

  db.prepare('DELETE FROM gift_vouchers WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
