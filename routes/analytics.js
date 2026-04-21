/* =============================================
   PAINT & BUBBLES — ADMIN ANALYTICS
   One endpoint, one big JSON payload covering:
     · Headline KPIs (revenue, bookings, AOV, fill %,
       cancellations, new customers) with prev-period
       comparison
     · Revenue & booking volume time series
     · Booking source attribution mix
     · Top events by revenue
     · Fastest-filling events
     · Top customers (LTV)
     · Category mix
     · Day-of-week & hour-of-day demand
     · Voucher sold/redeemed
     · Waitlist conversion
     · 30-day forward forecast
   All guarded by `requireAdmin`.
   ============================================= */

const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

// ─── Range helpers ─────────────────────────────────────────────────────────

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

function resolveRange(rangeParam) {
  const key = (rangeParam || '30d').toLowerCase();
  if (key === 'all') {
    return { key: 'all', days: null, since: null, prevSince: null, prevUntil: null };
  }
  const days = RANGE_DAYS[key] || 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400000);
  const prevUntil = since;
  const prevSince = new Date(since.getTime() - days * 86400000);
  return {
    key: RANGE_DAYS[key] ? key : '30d',
    days,
    since: since.toISOString(),
    prevSince: prevSince.toISOString(),
    prevUntil: prevUntil.toISOString(),
  };
}

function pctChange(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : null; // null = "no prior data"
  return ((curr - prev) / prev) * 100;
}

// ─── The endpoint ──────────────────────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const range = resolveRange(req.query.range);
  const nowIso = new Date().toISOString();

  // A WHERE-clause helper: returns ['fragment', params[]] for the date-window
  // applied to the given column name. If range is 'all', returns an empty gate.
  function since(col, sinceIso) {
    if (!sinceIso) return { sql: '', params: [] };
    return { sql: ` AND ${col} >= ?`, params: [sinceIso] };
  }

  // ─── Summary KPIs (current + previous window) ────────────────────────────
  // We compute both in one query each so the % change comparison is cheap.

  function summaryForWindow(sinceIso) {
    const g = since('p.created_at', sinceIso);
    const rev = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN p.status='succeeded' THEN p.amount_pence END), 0) AS revenue_pence,
        COUNT(DISTINCT CASE WHEN p.status='succeeded' THEN p.booking_id END)    AS paid_bookings
      FROM payments p
      WHERE 1=1 ${g.sql}
    `).get(...g.params);

    const b = since('b.created_at', sinceIso);
    const bk = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN b.status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN b.status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN b.status='refunded'  THEN 1 ELSE 0 END) AS refunded,
        SUM(CASE WHEN b.status='confirmed' THEN b.quantity ELSE 0 END) AS tickets_sold
      FROM bookings b
      WHERE 1=1 ${b.sql}
    `).get(...b.params);

    const c = since('c.created_at', sinceIso);
    const cust = db.prepare(`
      SELECT COUNT(*) AS new_customers FROM customers c WHERE 1=1 ${c.sql}
    `).get(...c.params);

    const confirmed = bk.confirmed || 0;
    const aov = confirmed > 0 ? Math.round((rev.revenue_pence || 0) / confirmed) : 0;
    const cancellationRate = bk.total > 0 ? ((bk.cancelled || 0) / bk.total) * 100 : 0;
    const refundRate       = bk.total > 0 ? ((bk.refunded  || 0) / bk.total) * 100 : 0;

    return {
      revenue_pence:      rev.revenue_pence || 0,
      bookings_confirmed: confirmed,
      bookings_total:     bk.total || 0,
      tickets_sold:       bk.tickets_sold || 0,
      new_customers:      cust.new_customers || 0,
      avg_order_pence:    aov,
      cancellation_pct:   +cancellationRate.toFixed(1),
      refund_pct:         +refundRate.toFixed(1),
    };
  }

  const curr = summaryForWindow(range.since);
  const prev = range.prevSince ? (() => {
    // previous window has a both-ends gate — simpler to inline
    const rev = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN status='succeeded' THEN amount_pence END),0) AS r,
             COUNT(DISTINCT CASE WHEN status='succeeded' THEN booking_id END)    AS pb
      FROM payments WHERE created_at >= ? AND created_at < ?
    `).get(range.prevSince, range.prevUntil);
    const bk = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed
      FROM bookings WHERE created_at >= ? AND created_at < ?
    `).get(range.prevSince, range.prevUntil);
    const cust = db.prepare(`
      SELECT COUNT(*) AS n FROM customers WHERE created_at >= ? AND created_at < ?
    `).get(range.prevSince, range.prevUntil);
    return {
      revenue_pence:      rev.r || 0,
      bookings_confirmed: bk.confirmed || 0,
      bookings_total:     bk.total || 0,
      new_customers:      cust.n || 0,
    };
  })() : null;

  const summary = {
    ...curr,
    // Deltas vs previous equivalent window (null if prev had zero and curr != 0,
    // or when range === 'all').
    delta: prev ? {
      revenue_pct:        pctChange(curr.revenue_pence,      prev.revenue_pence),
      bookings_pct:       pctChange(curr.bookings_confirmed, prev.bookings_confirmed),
      new_customers_pct:  pctChange(curr.new_customers,      prev.new_customers),
    } : null,
  };

  // ─── Revenue time series (daily buckets) ─────────────────────────────────
  // If range is 'all' we bucket by month instead of day, otherwise things get
  // silly for multi-year-old shops.

  const bucketByMonth = range.key === 'all';
  const revTs = (() => {
    const gate = range.since ? `WHERE created_at >= ?` : '';
    const params = range.since ? [range.since] : [];
    const bucket = bucketByMonth ? `strftime('%Y-%m', created_at)` : `substr(created_at, 1, 10)`;
    return db.prepare(`
      SELECT ${bucket} AS bucket,
             SUM(CASE WHEN status='succeeded' THEN amount_pence ELSE 0 END) AS revenue_pence,
             COUNT(DISTINCT CASE WHEN status='succeeded' THEN booking_id END) AS bookings
      FROM payments
      ${gate}
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(...params);
  })();

  // Fill zero-buckets for day ranges so the chart doesn't have visual gaps.
  const revenueByDay = (() => {
    if (bucketByMonth || !range.since) return revTs;
    const map = new Map(revTs.map(r => [r.bucket, r]));
    const out = [];
    const start = new Date(range.since);
    start.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i <= range.days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const hit = map.get(key);
      out.push({ bucket: key, revenue_pence: hit ? hit.revenue_pence : 0, bookings: hit ? hit.bookings : 0 });
    }
    return out;
  })();

  // ─── Booking source mix ──────────────────────────────────────────────────

  const sources = (() => {
    const g = since('b.created_at', range.since);
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(b.source, ''), 'direct') AS source,
             COUNT(*)       AS bookings,
             SUM(CASE WHEN b.status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
             SUM(CASE WHEN b.status='confirmed' THEN b.total_pence - COALESCE(b.discount_pence,0) - COALESCE(b.voucher_discount_pence,0) ELSE 0 END) AS revenue_pence
      FROM bookings b
      WHERE 1=1 ${g.sql}
      GROUP BY source
      ORDER BY bookings DESC
    `).all(...g.params);
    const total = rows.reduce((s, r) => s + r.bookings, 0) || 1;
    return rows.map(r => ({ ...r, pct: +(r.bookings / total * 100).toFixed(1) }));
  })();

  // ─── Top events by revenue (within window) ───────────────────────────────

  const topEvents = (() => {
    const g = since('b.created_at', range.since);
    return db.prepare(`
      SELECT e.id, e.title, e.date, e.capacity,
             SUM(CASE WHEN b.status IN ('confirmed','pending') THEN b.quantity ELSE 0 END) AS tickets,
             SUM(CASE WHEN b.status='confirmed' THEN b.total_pence - COALESCE(b.discount_pence,0) - COALESCE(b.voucher_discount_pence,0) ELSE 0 END) AS revenue_pence,
             COUNT(CASE WHEN b.status='confirmed' THEN b.id END) AS confirmed_bookings
      FROM events e
      JOIN bookings b ON b.event_id = e.id
      WHERE 1=1 ${g.sql}
      GROUP BY e.id
      ORDER BY revenue_pence DESC
      LIMIT 10
    `).all(...g.params).map(r => ({
      ...r,
      fill_pct: r.capacity > 0 ? +((r.tickets / r.capacity) * 100).toFixed(1) : 0,
    }));
  })();

  // ─── Fastest-filling events ──────────────────────────────────────────────
  // For each event whose confirmed+pending tickets == capacity (sold out),
  // compute the interval between first booking and last booking that filled
  // the capacity. Shorter = faster.

  const fastestFilling = (() => {
    const g = since('b.created_at', range.since);
    return db.prepare(`
      SELECT e.id, e.title, e.date, e.capacity,
             MIN(b.created_at) AS first_booking,
             MAX(b.created_at) AS last_booking,
             SUM(CASE WHEN b.status IN ('confirmed','pending') THEN b.quantity ELSE 0 END) AS tickets,
             ROUND(
               (julianday(MAX(b.created_at)) - julianday(MIN(b.created_at))) * 24, 2
             ) AS hours_to_fill
      FROM events e
      JOIN bookings b ON b.event_id = e.id
      WHERE b.status IN ('confirmed','pending') ${g.sql}
      GROUP BY e.id
      HAVING tickets >= e.capacity AND e.capacity > 0
      ORDER BY hours_to_fill ASC
      LIMIT 10
    `).all(...g.params);
  })();

  // ─── Top customers (lifetime — ignores range window deliberately) ────────

  const topCustomers = db.prepare(`
    SELECT c.id, c.name, c.email,
           COUNT(b.id) AS bookings,
           SUM(CASE WHEN b.status='confirmed' THEN b.total_pence - COALESCE(b.discount_pence,0) - COALESCE(b.voucher_discount_pence,0) ELSE 0 END) AS total_spent_pence,
           MIN(b.created_at) AS first_booking,
           MAX(b.created_at) AS last_booking
    FROM customers c
    JOIN bookings b ON b.customer_id = c.id
    WHERE b.status IN ('confirmed','pending')
    GROUP BY c.id
    HAVING bookings > 0
    ORDER BY total_spent_pence DESC
    LIMIT 10
  `).all();

  // ─── Category mix ────────────────────────────────────────────────────────

  const categoryMix = (() => {
    const g = since('b.created_at', range.since);
    return db.prepare(`
      SELECT COALESCE(NULLIF(e.category, ''), 'Uncategorised') AS category,
             COUNT(*) AS bookings,
             SUM(CASE WHEN b.status='confirmed' THEN b.total_pence - COALESCE(b.discount_pence,0) - COALESCE(b.voucher_discount_pence,0) ELSE 0 END) AS revenue_pence
      FROM bookings b
      JOIN events e ON e.id = b.event_id
      WHERE 1=1 ${g.sql}
      GROUP BY category
      ORDER BY revenue_pence DESC
    `).all(...g.params);
  })();

  // ─── Day-of-week demand ──────────────────────────────────────────────────
  // strftime('%w', ...) returns 0=Sun..6=Sat

  const dowRaw = (() => {
    const g = since('created_at', range.since);
    return db.prepare(`
      SELECT CAST(strftime('%w', created_at) AS INTEGER) AS dow, COUNT(*) AS bookings
      FROM bookings
      WHERE 1=1 ${g.sql}
      GROUP BY dow
    `).all(...g.params);
  })();
  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowMap = new Map(dowRaw.map(r => [r.dow, r.bookings]));
  const bookingsByDow = dowLabels.map((label, i) => ({ dow: i, label, bookings: dowMap.get(i) || 0 }));

  // ─── Hour-of-day booking time ────────────────────────────────────────────
  // Note: stored timestamps are UTC. This is a rough proxy, fine for spotting
  // "people book in the evening vs lunchtime" patterns.

  const hourRaw = (() => {
    const g = since('created_at', range.since);
    return db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS bookings
      FROM bookings
      WHERE 1=1 ${g.sql}
      GROUP BY hour
    `).all(...g.params);
  })();
  const hourMap = new Map(hourRaw.map(r => [r.hour, r.bookings]));
  const bookingsByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, bookings: hourMap.get(h) || 0 }));

  // ─── Voucher stats (range-windowed) ──────────────────────────────────────

  const voucherStats = (() => {
    const g = since('created_at', range.since);
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('active','used') THEN 1 ELSE 0 END) AS sold_count,
        SUM(CASE WHEN status IN ('active','used') THEN amount_pence ELSE 0 END) AS sold_pence,
        SUM(CASE WHEN status='used' THEN 1 ELSE 0 END) AS redeemed_count,
        SUM(CASE WHEN status='used' THEN amount_pence ELSE 0 END) AS redeemed_pence
      FROM gift_vouchers
      WHERE 1=1 ${g.sql}
    `).get(...g.params);
    return {
      sold_count:     row.sold_count || 0,
      sold_pence:     row.sold_pence || 0,
      redeemed_count: row.redeemed_count || 0,
      redeemed_pence: row.redeemed_pence || 0,
    };
  })();

  // ─── Waitlist conversion (entries in range → ended up booking same event) ──

  const waitlistConversion = (() => {
    const g = since('w.created_at', range.since);
    const total = db.prepare(`
      SELECT COUNT(*) AS n FROM event_waitlist w WHERE 1=1 ${g.sql}
    `).get(...g.params);
    const notified = db.prepare(`
      SELECT COUNT(*) AS n FROM event_waitlist w WHERE notified_at IS NOT NULL ${g.sql}
    `).get(...g.params);
    // Converted = waitlist person later booked this event (match on email + event_id)
    const converted = db.prepare(`
      SELECT COUNT(DISTINCT w.id) AS n
      FROM event_waitlist w
      JOIN customers c ON c.email = w.email
      JOIN bookings b  ON b.customer_id = c.id AND b.event_id = w.event_id
                       AND b.status IN ('confirmed','pending')
                       AND b.created_at >= w.created_at
      WHERE 1=1 ${g.sql}
    `).get(...g.params);
    return {
      total: total.n || 0,
      notified: notified.n || 0,
      converted: converted.n || 0,
      conversion_pct: total.n > 0 ? +((converted.n / total.n) * 100).toFixed(1) : 0,
    };
  })();

  // ─── 30-day forward forecast ─────────────────────────────────────────────
  // Looks at future events (date >= today), sums confirmed+pending tickets
  // already held, and computes projected revenue at full capacity vs current.

  const forecast = (() => {
    const today = nowIso.slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const row = db.prepare(`
      SELECT
        COUNT(DISTINCT e.id) AS events_count,
        SUM(e.capacity)      AS capacity_total,
        SUM(e.capacity * e.price_pence) AS capacity_revenue_pence,
        COALESCE(SUM((
          SELECT SUM(b.quantity) FROM bookings b
          WHERE b.event_id = e.id AND b.status IN ('confirmed','pending')
        )), 0) AS tickets_booked,
        COALESCE(SUM((
          SELECT SUM(b.total_pence - COALESCE(b.discount_pence,0) - COALESCE(b.voucher_discount_pence,0))
          FROM bookings b WHERE b.event_id = e.id AND b.status='confirmed'
        )), 0) AS revenue_booked_pence
      FROM events e
      WHERE e.is_active = 1 AND e.date BETWEEN ? AND ?
    `).get(today, in30);
    const cap = row.capacity_total || 0;
    const sold = row.tickets_booked || 0;
    return {
      events_count:           row.events_count || 0,
      capacity_total:         cap,
      tickets_booked:         sold,
      fill_pct:               cap > 0 ? +((sold / cap) * 100).toFixed(1) : 0,
      revenue_booked_pence:   row.revenue_booked_pence || 0,
      revenue_potential_pence: row.capacity_revenue_pence || 0,
    };
  })();

  // ─── Repeat-customer ratio (lifetime) ────────────────────────────────────

  const repeatCustomers = db.prepare(`
    SELECT
      SUM(CASE WHEN bk_count = 1 THEN 1 ELSE 0 END) AS one_timers,
      SUM(CASE WHEN bk_count > 1 THEN 1 ELSE 0 END) AS repeaters
    FROM (
      SELECT customer_id, COUNT(*) AS bk_count
      FROM bookings
      WHERE status IN ('confirmed','pending')
      GROUP BY customer_id
    )
  `).get();

  // ─── Response ────────────────────────────────────────────────────────────

  res.json({
    range: range.key,
    days:  range.days,
    since: range.since,
    generated_at: nowIso,
    summary,
    revenueByDay,
    bucketByMonth,
    sources,
    topEvents,
    fastestFilling,
    topCustomers,
    categoryMix,
    bookingsByDow,
    bookingsByHour,
    voucherStats,
    waitlistConversion,
    forecast,
    repeatCustomers: {
      one_timers: repeatCustomers.one_timers || 0,
      repeaters:  repeatCustomers.repeaters  || 0,
    },
  });
});

module.exports = router;
