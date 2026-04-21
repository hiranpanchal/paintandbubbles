/**
 * iCalendar (.ics) builder — RFC 5545 compliant.
 * Used for "Add to Calendar" attachments in booking confirmation emails,
 * and mirrored client-side so the success modal can also download the same file.
 *
 * Handles:
 *  - CRLF line endings (required by spec)
 *  - Text escaping (backslash, comma, semicolon, newline)
 *  - Line folding at 75 octets
 *  - Europe/London VTIMEZONE block so the event sits in BST/GMT correctly
 *    in Google / Apple / Outlook calendars
 */

const CRLF = '\r\n';

// Escape text per RFC 5545 §3.3.11
function escapeText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Fold lines at 75 octets (we approximate with chars, which is fine for mostly-ASCII content)
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let i = 0;
  parts.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join(CRLF);
}

// "2025-11-22" + "18:30" → "20251122T183000"
function toLocalDateTime(dateStr, timeStr) {
  const d = String(dateStr || '').replace(/-/g, '');
  const t = String(timeStr || '00:00').replace(/:/g, '').padEnd(4, '0').slice(0, 4) + '00';
  return `${d}T${t}`;
}

// Add minutes to a local date/time string and return new YYYYMMDDTHHMMSS.
function addMinutesLocal(dateStr, timeStr, minutes) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  // Build a Date in UTC to avoid the host timezone leaking in; we're treating
  // these values as wall-clock London time — the VTIMEZONE block tells the
  // calendar client what that means.
  const dt = new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0));
  dt.setUTCMinutes(dt.getUTCMinutes() + (minutes || 0));
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

// UTC stamp for DTSTAMP (must be UTC per spec).
function utcStamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// Minimal Europe/London VTIMEZONE. Covers the standard BST/GMT rules
// (last Sun in March → BST +0100; last Sun in October → GMT +0000).
const LONDON_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/London',
  'X-LIC-LOCATION:Europe/London',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join(CRLF);

/**
 * Build an .ics file body for a single event.
 *
 * @param {Object} opts
 * @param {string} opts.title            Event title
 * @param {string} opts.date             YYYY-MM-DD (local London date)
 * @param {string} opts.time             HH:MM (24h, local London time)
 * @param {number} [opts.durationMinutes=120]
 * @param {string} [opts.location]
 * @param {string} [opts.description]
 * @param {string} [opts.url]            Link back to the event page / booking
 * @param {string} opts.uid              Stable unique ID (e.g. booking ref + domain)
 * @returns {string} full .ics file contents (CRLF-separated)
 */
function buildIcsFile({ title, date, time, durationMinutes = 120, location = '', description = '', url = '', uid }) {
  const dtStart = toLocalDateTime(date, time);
  const dtEnd = addMinutesLocal(date, time, durationMinutes);
  const stamp = utcStamp();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paint and Bubbles//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    LONDON_VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/London:${dtStart}`,
    `DTEND;TZID=Europe/London:${dtEnd}`,
    `SUMMARY:${escapeText(title)}`,
  ];
  if (location)    lines.push(`LOCATION:${escapeText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (url)         lines.push(`URL:${escapeText(url)}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');

  // Reminders: one day before, and one hour before — cuts no-shows.
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT1H',
    'END:VALARM',
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // Fold every line individually. (LONDON_VTIMEZONE is already multi-line
  // CRLF-separated, so splitting on CRLF handles it cleanly.)
  return lines
    .join(CRLF)
    .split(CRLF)
    .map(foldLine)
    .join(CRLF) + CRLF;
}

/**
 * Build the .ics specifically for a booking row (as joined in routes/bookings.js).
 * @param {Object} booking  must include id, event_title, event_date, event_time,
 *                          event_location, event_duration_minutes (optional)
 * @param {string} [siteUrl]
 */
function buildBookingIcs(booking, siteUrl) {
  const ref = `PB${String(booking.id).padStart(5, '0')}`;
  const host = (siteUrl || process.env.SITE_URL || 'paintandbubbles.co.uk').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return buildIcsFile({
    title: booking.event_title,
    date: booking.event_date,
    time: booking.event_time,
    durationMinutes: booking.event_duration_minutes || booking.duration_minutes || 120,
    location: booking.event_location || '',
    description: `Your Paint & Bubbles booking (${ref}). We can't wait to see you! Reply to your confirmation email if you have any questions.`,
    url: siteUrl || process.env.SITE_URL || '',
    uid: `booking-${ref}@${host}`,
  });
}

module.exports = { buildIcsFile, buildBookingIcs };
