require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SEO HELPERS ----

function escSeo(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function truncate(s, n) {
  s = stripTags(s);
  return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
}
function getSiteUrl(req) {
  return process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
}
function getSeoSettings() {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const s = {};
  rows.forEach(r => (s[r.key] = r.value));
  return s;
}
function getOgImage(s, siteUrl) {
  const img = s.seo_og_image || s.hero_image_url || s.logo_url || '';
  if (!img) return '';
  return img.startsWith('http') ? img : `${siteUrl}${img}`;
}

function injectSeoMeta(html, { title, description, canonicalUrl, ogImage, ogType = 'website', schema, extraMeta = '' }) {
  const parts = [
    `  <title>${escSeo(title)}</title>`,
    `  <meta name="description" content="${escSeo(description)}">`,
    `  <link rel="canonical" href="${escSeo(canonicalUrl)}">`,
    `  <meta property="og:type" content="${escSeo(ogType)}">`,
    `  <meta property="og:site_name" content="Paint &amp; Bubbles">`,
    `  <meta property="og:title" content="${escSeo(title)}">`,
    `  <meta property="og:description" content="${escSeo(description)}">`,
    `  <meta property="og:url" content="${escSeo(canonicalUrl)}">`,
    ogImage ? `  <meta property="og:image" content="${escSeo(ogImage)}">` : null,
    ogImage ? `  <meta property="og:image:width" content="1200">` : null,
    ogImage ? `  <meta property="og:image:height" content="630">` : null,
    `  <meta name="twitter:card" content="summary_large_image">`,
    `  <meta name="twitter:title" content="${escSeo(title)}">`,
    `  <meta name="twitter:description" content="${escSeo(description)}">`,
    ogImage ? `  <meta name="twitter:image" content="${escSeo(ogImage)}">` : null,
    extraMeta ? `  ${extraMeta}` : null,
    schema ? `  <script type="application/ld+json">${JSON.stringify(schema)}</script>` : null,
  ].filter(Boolean).join('\n');

  // Replace existing title tag, then inject everything before </head>
  let result = html.replace(/<title>[^<]*<\/title>/, '');
  return result.replace('</head>', `${parts}\n</head>`);
}

function serveSeoPage(res, filename, seoOpts) {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', filename), 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(injectSeoMeta(html, seoOpts));
  } catch (err) {
    console.error('SEO page serve error:', err);
    res.sendFile(path.join(__dirname, 'public', filename));
  }
}

// ---- STRIPE WEBHOOK (must be before json middleware) ----
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(cors());
app.use(express.json());

// ---- ROBOTS.TXT & SITEMAP (before static files) ----

app.get('/robots.txt', (req, res) => {
  const siteUrl = getSiteUrl(req);
  res.setHeader('Content-Type', 'text/plain');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const siteUrl = getSiteUrl(req);
  const now = new Date().toISOString().split('T')[0];
  const events = db.prepare(
    "SELECT id, slug, date FROM events WHERE is_active = 1 ORDER BY date ASC"
  ).all();

  const staticPages = [
    { url: '/',                priority: '1.0', changefreq: 'weekly',  lastmod: now },
    { url: '/events',          priority: '0.9', changefreq: 'daily',   lastmod: now },
    { url: '/coventry',        priority: '0.9', changefreq: 'weekly',  lastmod: now },
    { url: '/leamington-spa',  priority: '0.9', changefreq: 'weekly',  lastmod: now },
    { url: '/solihull',        priority: '0.9', changefreq: 'weekly',  lastmod: now },
    { url: '/gift-vouchers',   priority: '0.8', changefreq: 'monthly', lastmod: now },
    { url: '/private-events',  priority: '0.8', changefreq: 'monthly', lastmod: now },
    { url: '/about',           priority: '0.7', changefreq: 'monthly', lastmod: now },
    { url: '/reviews',         priority: '0.7', changefreq: 'weekly',  lastmod: now },
    { url: '/gallery',         priority: '0.6', changefreq: 'weekly',  lastmod: now },
    { url: '/faq',             priority: '0.6', changefreq: 'monthly', lastmod: now },
    { url: '/contact',         priority: '0.5', changefreq: 'monthly', lastmod: now },
    { url: '/terms',           priority: '0.3', changefreq: 'yearly',  lastmod: now },
    { url: '/privacy',         priority: '0.3', changefreq: 'yearly',  lastmod: now },
    { url: '/refund-policy',   priority: '0.3', changefreq: 'yearly',  lastmod: now },
  ];
  const eventPages = events.map(e => ({
    url: `/events/${e.slug || e.id}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: e.date || now,
  }));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...staticPages, ...eventPages].map(p =>
      `  <url>\n    <loc>${siteUrl}${p.url}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

// ---- STATIC FILES ----
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'db');
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ---- API ROUTES ----
// Analytics is mounted BEFORE /api/admin so its more-specific path wins.
app.use('/api/admin/analytics', require('./routes/analytics'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/events',     require('./routes/events'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/design',     require('./routes/design'));
app.use('/api/faqs',       require('./routes/faqs'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/contact',    require('./routes/contact'));
app.use('/api/vouchers',   require('./routes/vouchers'));
app.use('/api/discounts',  require('./routes/discounts'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/waitlist',        require('./routes/waitlist'));
app.use('/api/private-quotes', require('./routes/private-quotes'));

// ---- PAGE ROUTES WITH SEO META INJECTION ----

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);

// HOME
app.get('/', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    const ogImage = getOgImage(s, siteUrl);
    const city = s.seo_business_city || '';
    const biz  = s.seo_business_name || 'Paint & Bubbles';
    const desc = s.seo_desc_home ||
      `Join us for fun painting and craft events${city ? ' in ' + city : ''}. All materials and drinks provided. Perfect for all skill levels — no experience needed!`;

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'EntertainmentBusiness',
      name: biz,
      description: desc,
      url: siteUrl,
      ...(s.seo_business_phone  ? { telephone: s.seo_business_phone }      : {}),
      ...(s.notification_email  ? { email: s.notification_email }           : {}),
      ...(ogImage               ? { image: ogImage }                        : {}),
      priceRange: '££',
      currenciesAccepted: 'GBP',
      paymentAccepted: 'Credit Card, Debit Card',
      ...(s.seo_business_address || city ? {
        address: {
          '@type': 'PostalAddress',
          ...(s.seo_business_address  ? { streetAddress: s.seo_business_address }   : {}),
          ...(city                    ? { addressLocality: city }                    : {}),
          ...(s.seo_business_postcode ? { postalCode: s.seo_business_postcode }      : {}),
          addressCountry: 'GB',
        },
      } : {}),
    };

    const extraMeta = s.seo_google_verification
      ? `<meta name="google-site-verification" content="${escSeo(s.seo_google_verification)}">`
      : '';

    serveSeoPage(res, 'index.html', {
      title: `${biz} — Creative Art Events${city ? ' in ' + city : ''}`,
      description: desc,
      canonicalUrl: `${siteUrl}/`,
      ogImage,
      schema,
      extraMeta,
    });
  } catch (err) {
    console.error('Home SEO error:', err);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ABOUT
app.get('/about', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    const city = s.seo_business_city || '';
    serveSeoPage(res, 'about.html', {
      title: `About Us — Paint & Bubbles${city ? ' ' + city : ''}`,
      description: s.seo_desc_about ||
        `Learn about Paint & Bubbles${city ? ' in ' + city : ''} — a creative events studio hosting fun, relaxed painting and craft sessions for all skill levels.`,
      canonicalUrl: `${siteUrl}/about`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'about.html')); }
});

// EVENTS LIST
app.get('/events', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    const city = s.seo_business_city || '';
    serveSeoPage(res, 'events.html', {
      title: `Upcoming Painting & Craft Events${city ? ' in ' + city : ''} — Paint & Bubbles`,
      description: s.seo_desc_events ||
        `Browse all upcoming painting and craft events${city ? ' in ' + city : ''}. All materials and drinks included. Book your spot — no experience needed!`,
      canonicalUrl: `${siteUrl}/events`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'events.html')); }
});

// EVENT DETAIL — Event schema + OG (accepts numeric id or slug)
app.get('/events/:idOrSlug', (req, res) => {
  try {
    const param    = req.params.idOrSlug;
    const isNumeric = /^\d+$/.test(param);
    const event    = isNumeric
      ? db.prepare('SELECT * FROM events WHERE id = ? AND is_active = 1').get(param)
      : db.prepare('SELECT * FROM events WHERE slug = ? AND is_active = 1').get(param);
    const html     = fs.readFileSync(path.join(__dirname, 'public', 'event-detail.html'), 'utf8');
    if (!event) return res.send(html);

    // Redirect numeric id URLs to slug URL (301 permanent)
    if (isNumeric && event.slug) {
      return res.redirect(301, `/events/${event.slug}`);
    }

    const s        = getSeoSettings();
    const siteUrl  = getSiteUrl(req);
    const pageUrl  = `${siteUrl}/events/${event.slug || event.id}`;
    const imgUrl   = event.image_url
      ? (event.image_url.startsWith('http') ? event.image_url : `${siteUrl}${event.image_url}`)
      : getOgImage(s, siteUrl);
    const desc = truncate(event.description || '', 160);

    // Build ISO start/end datetimes
    const startDate = event.date && event.time ? `${event.date}T${event.time}` : event.date;
    let endDate = null;
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start)) {
        start.setMinutes(start.getMinutes() + (event.duration_minutes || 120));
        endDate = start.toISOString().slice(0, 16);
      }
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      description: desc,
      startDate,
      ...(endDate ? { endDate } : {}),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: event.location,
        address: {
          '@type': 'PostalAddress',
          name: event.location,
          addressCountry: 'GB',
        },
      },
      organizer: {
        '@type': 'Organization',
        name: s.seo_business_name || 'Paint & Bubbles',
        url: siteUrl,
      },
      offers: {
        '@type': 'Offer',
        price: ((event.price_pence || 0) / 100).toFixed(2),
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: pageUrl,
      },
      ...(imgUrl ? { image: [imgUrl] } : {}),
    };

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(injectSeoMeta(html, {
      title: `${event.title} — Paint & Bubbles`,
      description: desc,
      canonicalUrl: pageUrl,
      ogImage: imgUrl,
      ogType: 'website',
      schema,
    }));
  } catch (err) {
    console.error('Event SEO error:', err);
    res.sendFile(path.join(__dirname, 'public', 'event-detail.html'));
  }
});

// REVIEWS — AggregateRating schema
app.get('/reviews', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    const published = db.prepare(
      'SELECT * FROM reviews WHERE is_published = 1 ORDER BY sort_order ASC'
    ).all();
    const count     = published.length;
    const avg       = count > 0
      ? (published.reduce((sum, r) => sum + (r.rating || 5), 0) / count).toFixed(1)
      : '5.0';

    const schema = count > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: s.seo_business_name || 'Paint & Bubbles',
      url: siteUrl,
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: avg,
        reviewCount: count,
        bestRating: '5',
        worstRating: '1',
      },
      review: published.slice(0, 10).map(r => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.author_name },
        reviewRating: { '@type': 'Rating', ratingValue: String(r.rating || 5), bestRating: '5' },
        reviewBody: r.body,
        ...(r.review_date ? { datePublished: r.review_date } : {}),
      })),
    } : null;

    serveSeoPage(res, 'reviews.html', {
      title: 'Customer Reviews — Paint & Bubbles',
      description: s.seo_desc_reviews ||
        `See what our guests say about Paint & Bubbles. Rated ${avg} stars from ${count} reviews. Join us for a creative event today!`,
      canonicalUrl: `${siteUrl}/reviews`,
      ogImage: getOgImage(s, siteUrl),
      schema,
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'reviews.html')); }
});

// GALLERY
app.get('/gallery', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveSeoPage(res, 'gallery.html', {
      title: 'Gallery — Paintings & Artwork — Paint & Bubbles',
      description: s.seo_desc_gallery ||
        'Browse our gallery of paintings and artwork created at Paint & Bubbles events. Get inspired for your next creative session!',
      canonicalUrl: `${siteUrl}/gallery`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'gallery.html')); }
});

// FAQ — FAQPage schema
app.get('/faq', (req, res) => {
  try {
    const s    = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    const faqs = db.prepare(
      'SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order ASC'
    ).all();

    const schema = faqs.length > 0 ? {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: stripTags(f.answer) },
      })),
    } : null;

    serveSeoPage(res, 'faq.html', {
      title: 'FAQs — Paint & Bubbles',
      description: s.seo_desc_faq ||
        'Frequently asked questions about Paint & Bubbles events — what\'s included, how to book, cancellation policy and more.',
      canonicalUrl: `${siteUrl}/faq`,
      ogImage: getOgImage(s, siteUrl),
      schema,
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'faq.html')); }
});

// CONTACT
app.get('/contact', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveSeoPage(res, 'contact.html', {
      title: 'Contact Us — Paint & Bubbles',
      description: s.seo_desc_contact ||
        "Get in touch with Paint & Bubbles. Have a question about our events? We'd love to hear from you — we reply within 24 hours.",
      canonicalUrl: `${siteUrl}/contact`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'contact.html')); }
});

// GIFT VOUCHERS
app.get('/gift-vouchers', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveSeoPage(res, 'gift-vouchers.html', {
      title: 'Gift Vouchers — Paint & Bubbles',
      description: s.seo_desc_gift_vouchers ||
        'Give the gift of creativity with a Paint & Bubbles gift voucher. Perfect for birthdays, anniversaries and special occasions.',
      canonicalUrl: `${siteUrl}/gift-vouchers`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'gift-vouchers.html')); }
});

// PRIVATE EVENTS
app.get('/private-events', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveSeoPage(res, 'private-events.html', {
      title: 'Private Events & Hen Parties — Paint & Bubbles',
      description: s.seo_desc_private_events ||
        'Book a private painting or craft event for your group. Perfect for hen parties, corporate team building, birthdays and special occasions.',
      canonicalUrl: `${siteUrl}/private-events`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'private-events.html')); }
});

// LEAVE A REVIEW page — linked from post-event email
app.get('/leave-review', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leave-review.html'));
});

// ── LEGAL PAGES (Terms, Privacy, Refund Policy) ───────────────────────────────
// All three share public/legal.html — we tag <body data-legal-page="..."> so
// the shared legal.js knows which settings keys to render.

function serveLegalPage(res, { page, title, description, canonicalUrl, ogImage }) {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'legal.html'), 'utf8');
    // Tag the <body> with which legal page this is so legal.js picks the right settings
    const tagged = html.replace(
      /<body\s+data-legal-page="[^"]*"/,
      `<body data-legal-page="${page}"`
    );
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.send(injectSeoMeta(tagged, {
      title, description, canonicalUrl, ogImage, ogType: 'website',
    }));
  } catch (err) {
    console.error('Legal page serve error:', err);
    res.sendFile(path.join(__dirname, 'public', 'legal.html'));
  }
}

app.get('/terms', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveLegalPage(res, {
      page: 'terms',
      title: 'Terms & Conditions — Paint & Bubbles',
      description: s.seo_desc_terms ||
        'The terms that apply when you book a Paint & Bubbles creative event — public, corporate or private.',
      canonicalUrl: `${siteUrl}/terms`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'legal.html')); }
});

app.get('/privacy', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveLegalPage(res, {
      page: 'privacy',
      title: 'Privacy Policy — Paint & Bubbles',
      description: s.seo_desc_privacy ||
        'How Paint & Bubbles collects, uses and protects your personal information.',
      canonicalUrl: `${siteUrl}/privacy`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'legal.html')); }
});

app.get('/refund-policy', (req, res) => {
  try {
    const s = getSeoSettings();
    const siteUrl = getSiteUrl(req);
    serveLegalPage(res, {
      page: 'refund',
      title: 'Refund Policy — Paint & Bubbles',
      description: s.seo_desc_refund ||
        'Our policy on cancellations, refunds and date changes for Paint & Bubbles events.',
      canonicalUrl: `${siteUrl}/refund-policy`,
      ogImage: getOgImage(s, siteUrl),
    });
  } catch (err) { res.sendFile(path.join(__dirname, 'public', 'legal.html')); }
});

// ── LOCATION PAGES ────────────────────────────────────────────────────────────

const LOCATION_PAGES = [
  {
    path:    '/coventry',
    city:    'Coventry',
    county:  'West Midlands',
    slug:    'coventry',
  },
  {
    path:    '/leamington-spa',
    city:    'Leamington Spa',
    county:  'Warwickshire',
    slug:    'leamington-spa',
  },
  {
    path:    '/solihull',
    city:    'Solihull',
    county:  'West Midlands',
    slug:    'solihull',
  },
];

LOCATION_PAGES.forEach(({ path: routePath, city, county }) => {
  app.get(routePath, (req, res) => {
    try {
      const s       = getSeoSettings();
      const siteUrl = getSiteUrl(req);
      const ogImage = getOgImage(s, siteUrl);
      const biz     = s.seo_business_name || 'Paint & Bubbles';

      const schema = {
        '@context': 'https://schema.org',
        '@type':    'EntertainmentBusiness',
        name:       biz,
        description: `Fun, relaxed paint and sip events in ${city}, ${county}. All materials and drinks included. No experience needed.`,
        url:        `${siteUrl}${routePath}`,
        ...(s.seo_business_phone ? { telephone: s.seo_business_phone } : {}),
        ...(ogImage              ? { image: ogImage }                  : {}),
        priceRange: '££',
        currenciesAccepted: 'GBP',
        address: {
          '@type':           'PostalAddress',
          addressLocality:   city,
          addressRegion:     county,
          addressCountry:    'GB',
        },
        areaServed: {
          '@type': 'City',
          name:    city,
        },
      };

      serveSeoPage(res, 'location.html', {
        title:        `Paint and Sip Events in ${city} | ${biz}`,
        description:  `Join ${biz} for fun, relaxed paint and sip events in ${city}. All materials and drinks included. All abilities welcome — no experience needed. Book your spot online!`,
        canonicalUrl: `${siteUrl}${routePath}`,
        ogImage,
        schema,
      });
    } catch (err) {
      console.error(`Location page error (${routePath}):`, err);
      res.sendFile(path.join(__dirname, 'public', 'location.html'));
    }
  });
});

// CATCH-ALL
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Paint & Bubbles running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  require('./services/scheduler').startScheduler();
});
