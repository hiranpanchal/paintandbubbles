const router = require('express').Router();
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch {
  console.warn('Stripe not configured — payment routes will fail gracefully.');
}

// GET /api/payments/config — public (returns publishable key for frontend)
router.get('/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
});

// POST /api/payments/create-intent — public
router.post('/create-intent', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Payment system not configured' });

  const { booking_id } = req.body;
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

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.total_pence,
      currency: 'gbp',
      metadata: {
        booking_id: String(booking_id),
        event_title: booking.event_title,
        customer_name: booking.customer_name
      },
      receipt_email: booking.customer_email
    });

    res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/webhook — Stripe webhook
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(500).send('Not configured');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const bookingId = intent.metadata.booking_id;

    if (bookingId) {
      db.prepare('UPDATE bookings SET status = ?, stripe_payment_intent_id = ? WHERE id = ?')
        .run('confirmed', intent.id, bookingId);

      const existing = db.prepare('SELECT id FROM payments WHERE stripe_payment_intent_id = ?').get(intent.id);
      if (!existing) {
        const booking = db.prepare('SELECT total_pence FROM bookings WHERE id = ?').get(bookingId);
        if (booking) {
          db.prepare(`
            INSERT INTO payments (booking_id, stripe_payment_intent_id, amount_pence, status)
            VALUES (?, ?, ?, 'succeeded')
          `).run(bookingId, intent.id, booking.total_pence);
        }
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

module.exports = router;
