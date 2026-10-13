// Ticket-hold helpers. A booking occupies seats when it is confirmed, or when
// it is pending and its 15-minute hold has not yet run out.
const HOLD_MINUTES = 15;

// SQL predicate for "this booking row currently occupies seats".
function occupiesSeats(alias = 'b') {
  return `(${alias}.status = 'confirmed' OR (${alias}.status = 'pending' AND ${alias}.hold_expires_at > datetime('now')))`;
}

// Subquery returning seats left for event alias `e`.
function spotsRemainingSql(eventAlias = 'e') {
  return `(${eventAlias}.capacity - COALESCE(
        (SELECT SUM(b.quantity) FROM bookings b WHERE b.event_id = ${eventAlias}.id AND ${occupiesSeats('b')}),
        0
      ))`;
}

// Seconds left on a booking's hold (0 if expired / not pending).
function holdSecondsRemaining(db, bookingId) {
  const row = db.prepare(`
    SELECT CAST(ROUND((julianday(hold_expires_at) - julianday('now')) * 86400) AS INTEGER) AS secs
    FROM bookings WHERE id = ? AND status = 'pending' AND hold_expires_at IS NOT NULL
  `).get(bookingId);
  return Math.max(0, row?.secs || 0);
}

// Make sure a pending booking still holds its seats. If the hold lapsed but
// the seats are still free, renew it for another HOLD_MINUTES. Returns
// { ok, secondsRemaining, error }.
function ensureHold(db, bookingId) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return { ok: false, error: 'Booking not found' };
  if (booking.status !== 'pending') return { ok: true, secondsRemaining: 0 };

  const secs = holdSecondsRemaining(db, bookingId);
  if (secs > 0) return { ok: true, secondsRemaining: secs };

  const event = db.prepare(`SELECT ${spotsRemainingSql('e')} AS spots_remaining FROM events e WHERE e.id = ?`).get(booking.event_id);
  if (!event || event.spots_remaining < booking.quantity) {
    return { ok: false, error: 'Sorry — your 15-minute hold has expired and these tickets are no longer available.' };
  }
  db.prepare(`UPDATE bookings SET hold_expires_at = datetime('now', '+${HOLD_MINUTES} minutes') WHERE id = ?`).run(bookingId);
  return { ok: true, secondsRemaining: HOLD_MINUTES * 60 };
}

module.exports = { HOLD_MINUTES, occupiesSeats, spotsRemainingSql, holdSecondsRemaining, ensureHold };
