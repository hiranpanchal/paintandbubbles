const crypto = require('crypto');
const db = require('../database');
const { sendReminderEmail, sendReviewRequest } = require('./email');

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

async function runScheduledTasks() {
  await sendPendingReminders().catch(e => console.error('[Scheduler] Reminder run error:', e.message));
  await sendPendingReviewRequests().catch(e => console.error('[Scheduler] Review request run error:', e.message));
}

function startScheduler() {
  // Run once 15 seconds after startup (server fully ready)
  setTimeout(runScheduledTasks, 15_000);
  // Then every hour
  setInterval(runScheduledTasks, 60 * 60 * 1_000);
  console.log('[Scheduler] Started — checking hourly for reminders and review requests');
}

module.exports = { startScheduler, makeReviewToken };
