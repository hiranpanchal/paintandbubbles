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

// GET /api/payments/config — public, tells frontend which providers are active
router.get('/config', (req, res) => {
  const stripeEnabled = getSetting('stripe_enabled', '') === 'true'
    || (!getSetting('stripe_enabled', '') && !!getSetting('stripe_publishable_key', 'STRIPE_PUBLISHABLE_KEY'));
  const sumupEnabled  = getSetting('sumup_enabled', '') === 'true';
  res.json({
    stripe_enabled: stripeEnabled,
    stripe_publishable_key: getSetting('stripe_publishable_key', 'STRIPE_PUBLISHABLE_KEY'),
    sumup_enabled: sumupEnabled
  });
});

// POST /api/payments/create-intent — Stripe payment intent
router.post('/create-intent', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe is not configured' });

  const { booking_id, voucher_code, discount_code } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const booking = db.prepare(`
    SELECT b.*, c.email as customer_email, c.name as customer_name, e.title as event_title
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.id = ?
  `).get(booking_id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'confirmed') return res.status(400).json({ error: 'Booking already confirmed' });

  let amount = booking.total_pence;
  let voucherDiscount = 0;
  let discountPence = 0;

  if (voucher_code) {
    const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE code = ?').get(voucher_code.toUpperCase().trim());
    if (voucher && voucher.status === 'active') {
      voucherDiscount = Math.min(voucher.amount_pence, amount);
      amount = Math.max(0, amount - voucherDiscount);
      db.prepare('UPDATE bookings SET voucher_code=?, voucher_discount_pence=? WHERE id=?')
        .run(voucher_code.toUpperCase().trim(), voucherDiscount, booking_id);
    }
  }

  if (discount_code) {
    const dc = db.prepare('SELECT * FROM discount_codes WHERE code = ?').get(discount_code.toUpperCase().trim());
    if (dc && dc.is_active && !(dc.max_uses !== null && dc.used_count >= dc.max_uses) &&
        !(dc.expires_at && new Date(dc.expires_at) < new Date())) {
      if (dc.discount_type === 'percentage') {
        discountPence = Math.round((amount * dc.discount_value) / 100);
      } else {
        discountPence = dc.discount_value;
      }
      discountPence = Math.min(discountPence, amount);
      amount = Math.max(0, amount - discountPence);
      db.prepare('UPDATE bookings SET discount_code=?, discount_pence=? WHERE id=?')
        .run(discount_code.toUpperCase().trim(), discountPence, booking_id);
    }
  }

  // If fully covered by voucher/discount, no payment needed — client should handle this case
  if (amount === 0) {
    return res.json({ clientSecret: null, paymentIntentId: null, amount: 0, voucherDiscount, discountPence });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      metadata: { booking_id: String(booking_id), event_title: booking.event_title, customer_name: booking.customer_name },
      receipt_email: booking.customer_email
    });
    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount, voucherDiscount, discountPence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/sumup-checkout — create a SumUp checkout session
router.post('/sumup-checkout', async (req, res) => {
  const apiKey       = getSetting('sumup_api_key', 'SUMUP_API_KEY');
  const merchantCode = getSetting('sumup_merchant_code', 'SUMUP_MERCHANT_CODE');
  if (!apiKey || !merchantCode) return res.status(500).json({ error: 'SumUp is not configured' });

  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const booking = db.prepare(`
    SELECT b.*, c.email as customer_email, e.title as event_title
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.id = ?
  `).get(booking_id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'confirmed') return res.status(400).json({ error: 'Booking already confirmed' });

  try {
    const result = await sumupRequest('POST', '/v0.1/checkouts', {
      checkout_reference: `PB-${booking_id}-${Date.now()}`,
      amount: parseFloat((booking.total_pence / 100).toFixed(2)),
      currency: 'GBP',
      merchant_code: merchantCode,
      description: `Paint & Bubbles — ${booking.event_title}`
    }, apiKey);

    if (result.status !== 200 && result.status !== 201) {
      return res.status(500).json({ error: result.body?.message || 'SumUp checkout creation failed' });
    }
    res.json({ checkoutId: result.body.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/sumup-confirm — verify SumUp payment and confirm booking
router.post('/sumup-confirm', async (req, res) => {
  const apiKey = getSetting('sumup_api_key', 'SUMUP_API_KEY');
  if (!apiKey) return res.status(500).json({ error: 'SumUp is not configured' });

  const { checkout_id, booking_id } = req.body;
  if (!checkout_id || !booking_id) return res.status(400).json({ error: 'checkout_id and booking_id required' });

  try {
    const result = await sumupRequest('GET', `/v0.1/checkouts/${checkout_id}`, null, apiKey);
    if (result.status !== 200) return res.status(500).json({ error: 'Could not verify payment' });

    const checkout = result.body;
    if (checkout.status !== 'PAID') return res.status(400).json({ error: `Payment not completed (status: ${checkout.status})` });

    db.prepare('UPDATE bookings SET status = ?, payment_reference = ? WHERE id = ?')
      .run('confirmed', checkout_id, booking_id);

    const existing = db.prepare('SELECT id FROM payments WHERE payment_reference = ?').get(checkout_id);
    if (!existing) {
      const booking = db.prepare('SELECT total_pence FROM bookings WHERE id = ?').get(booking_id);
      if (booking) {
        db.prepare(`INSERT INTO payments (booking_id, payment_reference, amount_pence, status, provider) VALUES (?, ?, ?, 'succeeded', 'sumup')`)
          .run(booking_id, checkout_id, booking.total_pence);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/webhook — Stripe webhook
router.post('/webhook', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(500).send('Not configured');

  const sig           = req.headers['stripe-signature'];
  const webhookSecret = getSetting('stripe_webhook_secret', 'STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent    = event.data.object;
    const bookingId = intent.metadata.booking_id;
    if (bookingId) {
      db.prepare('UPDATE bookings SET status = ?, payment_reference = ? WHERE id = ?')
        .run('confirmed', intent.id, bookingId);
      const existing = db.prepare('SELECT id FROM payments WHERE payment_reference = ?').get(intent.id);
      if (!existing) {
        const booking = db.prepare('SELECT total_pence FROM bookings WHERE id = ?').get(bookingId);
        if (booking) {
          db.prepare(`INSERT INTO payments (booking_id, payment_reference, amount_pence, status, provider) VALUES (?, ?, ?, 'succeeded', 'stripe')`)
            .run(bookingId, intent.id, booking.total_pence);
        }
      }
    }
    // Handle gift voucher payment
    const voucherId = intent.metadata.voucher_id;
    if (voucherId) {
      const voucher = db.prepare('SELECT * FROM gift_vouchers WHERE id = ?').get(voucherId);
      if (voucher && voucher.status === 'pending') {
        db.prepare("UPDATE gift_vouchers SET status='active', payment_reference=? WHERE id=?").run(intent.id, voucherId);
        const { sendGiftVoucher } = require('../services/email');
        sendGiftVoucher(voucher).catch(console.error);
      }
    }
  }
  res.json({ received: true });
});

// GET /api/payments — admin only
router.get('/', requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, b.quantity, b.notes,
           c.name as customer_name, c.email as customer_email,
           e.title as event_title, e.date as event_date
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(payments);
});

// GET /api/payments/summary — admin only
router.get('/summary', requireAdmin, (req, res) => {
  const total = db.prepare("SELECT SUM(amount_pence) as total FROM payments WHERE status = 'succeeded'").get();
  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(amount_pence) as total, COUNT(*) as count
    FROM payments WHERE status = 'succeeded'
    GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();
  const byEvent = db.prepare(`
    SELECT e.title, e.date, COUNT(p.id) as bookings, SUM(p.amount_pence) as revenue
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN events e ON b.event_id = e.id
    WHERE p.status = 'succeeded'
    GROUP BY e.id ORDER BY revenue DESC LIMIT 10
  `).all();
  res.json({ total: total.total || 0, byMonth, byEvent });
});

// GET /api/payments/provider-settings — admin only
router.get('/provider-settings', requireAdmin, (req, res) => {
  const keys = ['stripe_enabled','stripe_publishable_key','stripe_secret_key','stripe_webhook_secret',
                 'sumup_enabled','sumup_api_key','sumup_merchant_code'];
  const result = {};
  keys.forEach(k => { result[k] = getSetting(k, ''); });
  res.json(result);
});

// POST /api/payments/provider-settings — admin only
router.post('/provider-settings', requireAdmin, (req, res) => {
  const allowed = ['stripe_enabled','stripe_publishable_key','stripe_secret_key','stripe_webhook_secret',
                   'sumup_enabled','sumup_api_key','sumup_merchant_code'];
  const upsert = db.prepare(`
    INSERT INTO site_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  db.exec('BEGIN');
  try {
    for (const key of allowed) {
      if (key in req.body) upsert.run(key, req.body[key] ?? '');
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ success: true });
});

module.exports = router;
