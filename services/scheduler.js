const crypto = require('crypto');
const db = require('../database');
const { sendReminderEmail, sendReviewRequest, sendAbandonedCartEmail } = require('./email');

// Read a site_setting with a default fallback.
function getSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
    return (row && row.value != null) ? row.value : fallback;
  } catch { return fallback; }
}

function makeReviewToken(bookingId) {
  const secret = process.env.JWT_SECRET || 'review-secret';
  return crypto.createHmac('sha256', secret).update(String(bookingId)).digest('hex').slice(0, 16);
}

async function sendPendingReminders() {
  // Find confirmed bookings for events happening in 47–49 hours, no reminder sent yet
  const bookings = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email,
           e.title as event_title, e.date as event_date, e.time as event_time,
           e.location as event_location
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.status = 'confirmed'
      AND b.reminder_sent_at IS NULL
      AND (e.date || 'T' || e.time) >= datetime('now', '+47 hours')
      AND (e.date || 'T' || e.time) <= datetime('now', '+49 hours')
  `).all();

  for (const booking of bookings) {
    try {
      await sendReminderEmail(booking);
      db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?").run(booking.id);
      console.log(`[Scheduler] Reminder sent for booking #${booking.id} (${booking.event_title})`);
    } catch (err) {
      console.error(`[Scheduler] Reminder failed for booking #${booking.id}:`, err.message);
    }
  }
}

async function sendPendingReviewRequests() {
  const siteUrl = process.env.SITE_URL || 'https://paintandbubbles.co.uk';

  // Events that ended between 23 and 25 hours ago (end time = start + duration_minutes)
  const bookings = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email,
           e.title as event_title, e.date as event_date, e.time as event_time,
           e.duration_minutes
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events e ON b.event_id = e.id
    WHERE b.status = 'confirmed'
      AND b.review_request_sent_at IS NULL
      AND datetime(e.date || ' ' || e.time, '+' || e.duration_minutes || ' minutes') <= datetime('now', '-23 hours')
      AND datetime(e.date || ' ' || e.time, '+' || e.duration_minutes || ' minutes') >= datetime('now', '-25 hours')
  `).all();

  for (const booking of bookings) {
    try {
      const token = makeReviewToken(booking.id);
      const reviewUrl = `${siteUrl}/leave-review?id=${booking.id}&token=${token}`;
      await sendReviewRequest(booking, reviewUrl);
      db.prepare("UPDATE bookings SET review_request_sent_at = datetime('now') WHERE id = ?").run(booking.id);
      console.log(`[Scheduler] Review request sent for booking #${booking.id} (${booking.event_title})`);
    } catch (err) {
      console.error(`[Scheduler] Review request failed for booking #${booking.id}:`, err.message);
    }
  }
}

// ─── Abandoned-cart nudge ────────────────────────────────────────────────────
// Fires ~1 hour (configurable) after a pending booking was created without
// being confirmed. The scheduler runs hourly, so actual delivery lands between
// `delay` and `delay + 60` minutes — acceptable for a soft recovery nudge.
//
// Eligibility:
//   - booking.status = 'pending'
//   - abandoned_email_sent_at IS NULL (we only nudge once)
//   - created at least `delay` minutes ago, no more than 24 hours ago
//   - event date is still in the future
//   - event is not sold out (no point nudging toward a full event)
//   - customer has no other confirmed booking for the same event
//     (they may have re-booked successfully from a new session)
async function sendAbandonedCartNudges() {
  const enabled = getSetting('abandoned_cart_enabled', '1');
  if (String(enabled) !== '1') return;

  const delayMinutes = parseInt(getSetting('abandoned_cart_delay_minutes', '60'), 10) || 60;

  const bookings = db.prepare(`
    SELECT b.id, b.event_id, b.quantity, b.total_pence, b.discount_pence,
           b.voucher_discount_pence, b.created_at,
           c.name  as customer_name,
           c.email as customer_email,
           e.title       as event_title,
           e.date        as event_date,
           e.time        as event_time,
           e.location    as event_location,
           e.slug        as event_slug,
           e.capacity    as event_capacity,
           (
             SELECT COALESCE(SUM(b2.quantity), 0)
             FROM bookings b2
             WHERE b2.event_id = b.event_id AND b2.status = 'confirmed'
           ) as tickets_sold,
           (
             SELECT COUNT(*) FROM bookings b3
             WHERE b3.event_id = b.event_id
               AND b3.customer_id = b.customer_id
               AND b3.status = 'confirmed'
           ) as already_confirmed
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN events    e ON b.event_id    = e.id
    WHERE b.status = 'pending'
      AND b.abandoned_email_sent_at IS NULL
      AND b.created_at <= datetime('now', '-' || ? || ' minutes')
      AND b.created_at >= datetime('now', '-24 hours')
      AND e.date >= date('now')
  `).all(delayMinutes);

  for (const b of bookings) {
    try {
      if (b.already_confirmed > 0) {
        // User re-booked successfully — mark as "handled" so we never try again.
        db.prepare("UPDATE bookings SET abandoned_email_sent_at = datetime('now') WHERE id = ?").run(b.id);
        continue;
      }
      const spotsRemaining = Math.max(0, (b.event_capacity || 0) - (b.tickets_sold || 0));
      if (spotsRemaining <= 0) {
        // Event sold out — no point sending a nudge the customer can't act on.
        db.prepare("UPDATE bookings SET abandoned_email_sent_at = datetime('now') WHERE id = ?").run(b.id);
        continue;
      }
      await sendAbandonedCartEmail({ ...b, spots_remaining: spotsRemaining });
      db.prepare("UPDATE bookings SET abandoned_email_sent_at = datetime('now') WHERE id = ?").run(b.id);
      console.log(`[Scheduler] Abandoned-cart nudge sent for booking #${b.id} (${b.event_title})`);
    } catch (err) {
      console.error(`[Scheduler] Abandoned-cart nudge failed for booking #${b.id}:`, err.message);
    }
  }
}

async function runScheduledTasks() {
  await sendPendingReminders().catch(e => console.error('[Scheduler] Reminder run error:', e.message));
  await sendPendingReviewRequests().catch(e => console.error('[Scheduler] Review request run error:', e.message));
  await sendAbandonedCartNudges().catch(e => console.error('[Scheduler] Abandoned-cart run error:', e.message));
}

function startScheduler() {
  // Run once 15 seconds after startup (server fully ready)
  setTimeout(runScheduledTasks, 15_000);
  // Then every hour
  setInterval(runScheduledTasks, 60 * 60 * 1_000);
  console.log('[Scheduler] Started — checking hourly for reminders, review requests, and abandoned-cart nudges');
}

module.exports = { startScheduler, makeReviewToken, runScheduledTasks };
