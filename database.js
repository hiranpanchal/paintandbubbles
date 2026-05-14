// Uses Node.js built-in SQLite (available in Node v22+)
// No native compilation required
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'db');
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, 'paintandbubbles.db');

// Ensure data directory exists (important on Railway where volume may start empty)
const fs = require('fs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

console.log(`[DB] Using database at: ${DB_PATH}`);
const db = new DatabaseSync(path.resolve(DB_PATH));

// Enable WAL mode and foreign keys
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 120,
    location TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 20,
    price_pence INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_pence INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    stripe_payment_intent_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    amount_pence INTEGER NOT NULL,
    currency TEXT DEFAULT 'gbp',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_name TEXT NOT NULL,
    author_location TEXT DEFAULT '',
    class_attended TEXT DEFAULT '',
    rating INTEGER DEFAULT 5,
    body TEXT NOT NULL,
    is_published INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate: add notes to customers if not present
try { db.exec("ALTER TABLE customers ADD COLUMN notes TEXT DEFAULT ''"); } catch {}

// Migrate: add role, is_active and last_login_at to admin_users if not present
try { db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin'"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN last_login_at TEXT"); } catch {}
// Ensure the seeded admin is a super_admin
db.prepare("UPDATE admin_users SET role = 'super_admin' WHERE role = 'admin' AND id = (SELECT MIN(id) FROM admin_users)").run();

// Migrate: add class_attended and review_date columns if they don't exist yet
try { db.exec("ALTER TABLE reviews ADD COLUMN class_attended TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE reviews ADD COLUMN review_date TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE reviews ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}

// Migrate: add group_note to bookings if not present
try { db.exec("ALTER TABLE bookings ADD COLUMN group_note TEXT DEFAULT ''"); } catch {}

// Migrate: add booking source attribution (for analytics dashboard).
// `source`   is a coarse bucket: 'direct' | 'google' | 'facebook' | 'instagram' | 'email' | 'tiktok' | 'other'
// `referrer` keeps the raw document.referrer hostname (or UTM source) for audit/debug.
try { db.exec("ALTER TABLE bookings ADD COLUMN source TEXT DEFAULT 'direct'"); } catch {}
try { db.exec("ALTER TABLE bookings ADD COLUMN referrer TEXT DEFAULT ''"); } catch {}

// Migrate: add timestamp for the "abandoned cart" nudge email. NULL = not sent.
// We only ever set this once per booking, to prevent duplicate nudges.
try { db.exec("ALTER TABLE bookings ADD COLUMN abandoned_email_sent_at TEXT DEFAULT NULL"); } catch {}

// Migrate: add slug to events if not present
try { db.exec("ALTER TABLE events ADD COLUMN slug TEXT"); } catch {}

// Generate slugs for any events that don't have one yet
function toSlug(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
const eventsNeedingSlugs = db.prepare("SELECT id, title FROM events WHERE slug IS NULL OR slug = ''").all();
for (const ev of eventsNeedingSlugs) {
  let slug = toSlug(ev.title);
  let base = slug, counter = 2;
  while (db.prepare("SELECT id FROM events WHERE slug = ? AND id != ?").get(slug, ev.id)) {
    slug = `${base}-${counter++}`;
  }
  db.prepare("UPDATE events SET slug = ? WHERE id = ?").run(slug, ev.id);
}

// Seed admin user if not exists
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(adminUsername);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(adminUsername, hash);
  console.log(`Admin user created: ${adminUsername}`);
}

// Seed default site settings if empty
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM site_settings').get();
if (settingsCount.count === 0) {
  const defaults = {
    hero_title:                'Paint, Create',
    hero_title_highlight:      '& Celebrate',
    hero_subtitle:             'Discover unique painting and craft events across Coventry, Leamington Spa and Solihull. All materials provided. Drinks included. Just bring yourself!',
    hero_cta_primary_text:     'Browse All Events',
    hero_cta_primary_url:      '/events',
    hero_cta_secondary_text:   'About Us',
    hero_cta_secondary_url:    '#about',
    about_title:               'Where creativity meets good company',
    about_body_1:              "Paint & Bubbles is the Midlands' go-to creative events studio, hosting relaxed, fun painting and craft sessions across Coventry, Leamington Spa and Solihull. All skill levels welcome — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.",
    about_body_2:              'Every event includes all the materials you need, a welcoming space, and drinks to keep the creativity flowing. No experience necessary — just show up, let loose, and enjoy the ride.',
    footer_tagline:            'Creative events for everyone',
    color_rose:                '#C4748A',
    color_rose_deep:           '#A85D72',
    color_rose_dark:           '#8A4560',
    color_bg:                  '#FDF8F9',
    color_text_dark:           '#2C2028',
    logo_url:                  '',
    hero_image_url:            '',
    about_image_url:           '',
    trust_1_icon:  'star',  trust_1_title: '5★ Rated on ClassBento',   trust_1_sub: 'Top-reviewed creative studio',
    trust_2_icon:  'brush', trust_2_title: '100% Beginner Friendly',   trust_2_sub: 'No experience needed at all',
    trust_3_icon:  'users', trust_3_title: 'Kids Classes Available',   trust_3_sub: 'Fun sessions for all ages',
    trust_4_icon:  'pin',   trust_4_title: 'Multiple Locations',       trust_4_sub: 'Coventry · Leamington Spa · Solihull · Rugby · Warwickshire',
    included_title: "What's included",
    included_items: JSON.stringify([
      'All materials and tools provided',
      'Step-by-step instructor guidance',
      'Drinks included throughout the session',
      'Small group setting — max {capacity} people',
      'Take your finished creation home',
    ]),
  };
  const upsert = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);
  console.log('Default site settings seeded.');
}

// Ensure font settings exist (added after initial seed)
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'font_body'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ['font_body','font_h1','font_h2','font_h3','font_h4'].forEach(k => ins.run(k, 'Nunito'));
  }
}
// Ensure font_hero_highlight exists (added later)
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'font_hero_highlight'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('font_hero_highlight', 'Dancing Script');
    console.log('Seeded font defaults.');
  }
}

// Abandoned-cart recovery defaults (on by default, fires ~1 hour after drop-off).
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  ins.run('abandoned_cart_enabled',        '1');
  ins.run('abandoned_cart_delay_minutes',  '60');  // lower bound — booking must be at least this old
}

// Ensure Social Media settings exist (added after initial seed)
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'social_links'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('social_title', 'Social Media');
    ins.run('social_links', '[]');
    console.log('Seeded social_links defaults.');
  }
}

// Ensure "What's Included" settings exist (added after initial seed)
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'included_items'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('included_title', "What's included");
    ins.run('included_items', JSON.stringify([
      'All materials and tools provided',
      'Step-by-step instructor guidance',
      'Drinks included throughout the session',
      'Small group setting — max {capacity} people',
      'Take your finished creation home',
    ]));
    console.log('Seeded included_items defaults.');
  }
}

// Ensure Section Background colour settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'color_bg_social'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('color_bg_about',  '#ffffff');
    ins.run('color_bg_trust',  '#F5F0EB');
    ins.run('color_bg_events', '#FDF8F9');
    ins.run('color_bg_social', '#F5F0EB');
    ins.run('color_bg_footer', '#2C0F18');
    console.log('Seeded section background colour defaults.');
  }
}

// Ensure "Please Note" settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'please_note_title'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('please_note_title', 'Please Note');
    ins.run('please_note_text', "As a small independent business, we're unable to offer refunds or date transfers due to pre-booked venue costs and materials. A minimum of 5 participants is required for each class to go ahead. In the unlikely event a class doesn't reach this number, you'll be offered a full refund, credit, or an alternative date.");
    console.log('Seeded please_note defaults.');
  }
}

// Ensure About Page settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'aboutpage_title'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('aboutpage_hero_title', 'About Us');
    ins.run('aboutpage_hero_sub', 'The story behind Paint & Bubbles');
    ins.run('aboutpage_label', 'Our Story');
    ins.run('aboutpage_title', 'Where creativity meets good company');
    ins.run('aboutpage_body_1', "Paint & Bubbles is the Midlands' go-to creative events studio, hosting relaxed, fun painting and craft sessions across Coventry, Leamington Spa and Solihull. All skill levels welcome — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.");
    ins.run('aboutpage_body_2', 'Every event includes all the materials you need, a welcoming space, and drinks to keep the creativity flowing. No experience necessary — just show up, let loose, and enjoy the ride.');
    ins.run('aboutpage_body_3', '');
    ins.run('aboutpage_pillar_1_title', 'All levels welcome');
    ins.run('aboutpage_pillar_1_text', 'From first-timers to seasoned creatives');
    ins.run('aboutpage_pillar_2_title', 'Everything included');
    ins.run('aboutpage_pillar_2_text', 'Materials, guidance and drinks provided');
    ins.run('aboutpage_pillar_3_title', 'Small groups');
    ins.run('aboutpage_pillar_3_text', 'Intimate sessions for a personal experience');
    console.log('Seeded about page defaults.');
  }
}

// ─── Migration: fix legacy Brighton references ────────────────────────────────
// Runs on every startup; UPDATE WHERE LIKE '%Brighton%' is a no-op once fixed.
{
  const brightonFix = db.prepare(
    "UPDATE site_settings SET value = ? WHERE key = ? AND value LIKE '%Brighton%'"
  );
  brightonFix.run(
    'Discover unique painting and craft events across Coventry, Leamington Spa and Solihull. All materials provided. Drinks included. Just bring yourself!',
    'hero_subtitle'
  );
  brightonFix.run(
    "Paint & Bubbles is the Midlands' go-to creative events studio, hosting relaxed, fun painting and craft sessions across Coventry, Leamington Spa and Solihull. All skill levels welcome — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.",
    'about_body_1'
  );
  brightonFix.run(
    "Paint & Bubbles is the Midlands' go-to creative events studio, hosting relaxed, fun painting and craft sessions across Coventry, Leamington Spa and Solihull. All skill levels welcome — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.",
    'aboutpage_body_1'
  );
}

// Ensure Contact page settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'contact_page_text'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('contact_hero_title', 'Get In Touch');
    ins.run('contact_hero_sub', "We'd love to hear from you. Fill in the form and we'll get back to you as soon as possible.");
    ins.run('contact_page_text', "Whether you have a question about our events, want to book a private session, or just want to say hello — we're here for it. Drop us a message and we'll get back to you within 24 hours.");
    ins.run('notification_email', '');
    console.log('Seeded contact page defaults.');
  }
}

// Ensure notification_email setting exists (added after initial seed)
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'notification_email'").get();
  if (check.count === 0) {
    db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run('notification_email', '');
    console.log('Seeded notification_email setting.');
  }
}

// Ensure Private Events page settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'private_events_content'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('private_events_hero_title', 'Private Events');
    ins.run('private_events_hero_sub', 'Create an unforgettable experience for your group');
    ins.run('private_events_content', '<h2>Host Your Own Private Event</h2><p>Looking for a unique and memorable experience for your team, hen party, birthday, or any special occasion? We offer fully tailored private painting and craft sessions just for your group.</p><h3>What we offer</h3><ul><li>Fully private session — just your group</li><li>Choose your preferred painting or craft activity</li><li>All materials and guidance included</li><li>Flexible on location — our venue or yours</li><li>Drinks packages available</li></ul><h3>How to book</h3><p>Simply fill in our contact form and tell us a bit about your event — group size, preferred date, and any special requests. We\'ll be in touch within 24 hours to discuss the details.</p>');
    console.log('Seeded private events page defaults.');
  }
}

// Ensure Corporate / Team-Building page settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'corporate_events_hero_title'").get();
  if (!check || check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('corporate_events_hero_title', 'Team bonding that actually lands');
    ins.run('corporate_events_hero_sub',   'Creative workshops your whole team will enjoy — from the quiet newcomer to the loudest exec.');
    ins.run('corporate_events_intro',      'We run facilitated painting and craft workshops for teams of 4 to 100+. Book once, everything is handled — materials, venue, drinks, photos, and an invoice your finance team will actually enjoy.');
    // Editable testimonial quotes (JSON array). Start with sensible placeholders —
    // admins can replace with real quotes via the Content tab.
    ins.run('corporate_events_testimonials', JSON.stringify([
      { quote: 'Easily the best team event we\'ve done. Even our most reserved team member ended up holding court by the end of the night.', author: 'Sarah M.', role: 'People Ops Lead, Midlands tech scale-up' },
      { quote: 'Painless to book, turned up with everything, stayed within budget. Invoiced cleanly with our PO. Will be booking again for Christmas.', author: 'James T.', role: 'HR Business Partner' },
    ]));
    // Editable "trusted by" company list (simple comma-separated string)
    ins.run('corporate_events_trusted_by', '');
    // SEO
    ins.run('seo_desc_corporate_events', '');
    console.log('Seeded corporate events page defaults.');
  } else {
    // Make sure the SEO key exists even if the rest was seeded previously
    db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('seo_desc_corporate_events', '')").run();
  }
}

// Extended corporate page defaults — every text block the HR page surfaces is now
// editable via the admin Content tab. We seed sensible defaults only if the keys
// don't already exist, so existing installs keep whatever content they've set.
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  // Hero
  ins.run('corporate_events_hero_eyebrow', 'For HR & People Teams');
  ins.run('corporate_events_hero_cta_primary_label', 'Get a quote within 24h');
  ins.run('corporate_events_hero_cta_primary_url',   '#ce-form');
  ins.run('corporate_events_hero_cta_secondary_label', 'Why this works for teams');
  ins.run('corporate_events_hero_cta_secondary_url',   '#ce-why');
  // Trust strip (4 stats)
  ins.run('corporate_events_trust_1_num',   '4–100+');
  ins.run('corporate_events_trust_1_label', 'People per session');
  ins.run('corporate_events_trust_2_num',   'On / off-site');
  ins.run('corporate_events_trust_2_label', 'Or virtual kits');
  ins.run('corporate_events_trust_3_num',   '24h');
  ins.run('corporate_events_trust_3_label', 'Quote turnaround');
  ins.run('corporate_events_trust_4_num',   'PO-friendly');
  ins.run('corporate_events_trust_4_label', 'VAT invoice, 30-day terms');
  // Why section
  ins.run('corporate_events_why_eyebrow', 'Why teams love this');
  ins.run('corporate_events_why_title',   'Proper bonding — without the forced fun');
  // Benefit cards (JSON array of {title, body})
  ins.run('corporate_events_benefits', JSON.stringify([
    { title: 'Creativity unlocks conversation', body: 'Painting gives everyone something to do with their hands — so real conversation happens naturally, not at a round-robin icebreaker. Hybrid teams bond in one evening.' },
    { title: 'Inclusive by design',             body: 'No skill required. Non-competitive. Alcohol optional. Quieter team members thrive. We can adapt for dietary, accessibility and cultural needs — just ask.' },
    { title: 'Zero logistical lift for you',    body: 'We bring everything — canvases, paints, aprons, music, a professional facilitator. You show up. Your team leaves with their own painting and a much better group chat.' },
  ]));
  // Formats section
  ins.run('corporate_events_formats_eyebrow', 'Formats');
  ins.run('corporate_events_formats_title',   'On-site, off-site, or entirely remote');
  ins.run('corporate_events_formats_lead',    "Whatever your team shape, we'll flex around it. Hybrid teams often use our virtual kits for quarterly get-togethers.");
  ins.run('corporate_events_formats', JSON.stringify([
    { badge: 'Popular', title: 'At our studio',    body: 'Head to Coventry, Leamington Spa or Solihull. We handle the vibe — you handle getting everyone there.', capacity: 'Up to 30 people' },
    { badge: '',        title: 'At your office',   body: 'We come to you with everything. Ideal for Friday afternoons, onboarding weeks or all-hands wrap-ups.',      capacity: 'Up to 60 people' },
    { badge: '',        title: 'Off-site away day', body: "Tie our session into a broader away day. We'll recommend venues across the Midlands and liaise directly.", capacity: 'Up to 100+ people' },
    { badge: '',        title: 'Virtual kits',     body: 'Canvas + paints posted to each team member (including remote hires overseas). Live facilitator on Zoom.',   capacity: 'No upper limit' },
  ]));
  // Included checklist
  ins.run('corporate_events_included_eyebrow', "What's included");
  ins.run('corporate_events_included_title',   'One price, everything handled');
  ins.run('corporate_events_included', JSON.stringify([
    'All materials — canvases, paints, brushes, aprons',
    'Professional artist to facilitate',
    'Soft drinks included — prosecco optional',
    'Themed music playlist',
    'Photos from the session on request',
    'Dietary & accessibility adjustments',
    'Clean VAT invoice with PO number',
    'Flexible cancellation up to 14 days',
  ]));
  // Social proof section
  ins.run('corporate_events_proof_eyebrow', 'Social proof');
  ins.run('corporate_events_proof_title',   'HR teams keep coming back');
  ins.run('corporate_events_trusted_label', 'Trusted by teams at');
  // FAQ
  ins.run('corporate_events_faq_eyebrow', 'HR-friendly answers');
  ins.run('corporate_events_faq_title',   'The questions we get most often');
  ins.run('corporate_events_faq', JSON.stringify([
    { q: 'Can you accommodate dietary requirements and allergies?',
      a: "Yes — always. Tell us about any allergies, dietary requirements or dry/no-alcohol preferences in the enquiry form and we'll adjust. Our drinks packages include non-alcoholic options as standard." },
    { q: 'Do you invoice with a PO and offer 30-day terms?',
      a: "Yes. We invoice your finance team directly with a clean VAT invoice quoting your PO number. Standard terms are net-30. We're VAT-registered." },
    { q: "What if some of our team genuinely can't paint?",
      a: 'Nobody can. That\'s the point. Our facilitators walk everyone through, step by step, and the atmosphere is firmly non-competitive. The "less artistic" people often end up having the most fun.' },
    { q: 'Is the venue accessible?',
      a: "Our Coventry studio is step-free. For off-site events we'll always check accessibility upfront — just flag any specific requirements (wheelchair access, step-free route, quiet space) and we'll build it into the plan." },
    { q: "What's your cancellation policy for teams?",
      a: 'Full refund if cancelled 14+ days before. Partial refund (50%) between 7 and 14 days. Within 7 days we can reschedule free of charge up to once — after that, the full fee applies. Everything is in writing before you commit.' },
    { q: 'Can you run something for a hybrid team split across offices?',
      a: "Absolutely. We've done this plenty of times — a live in-person session in one office, and our facilitator on Zoom for the remote folks (with kits posted to their homes beforehand). It genuinely works." },
    { q: 'How far in advance should we book?',
      a: '2–4 weeks ahead is ideal so we can lock in your preferred date. For Christmas-party season (Nov–Dec) get in touch 6–8 weeks early — dates disappear quickly.' },
  ]));
  // Quote form copy
  ins.run('corporate_events_form_title', 'Get a quote — no commitment');
  ins.run('corporate_events_form_sub',   "Fill in what you can. We'll come back within 24h with a tailored proposal.");
  ins.run('corporate_events_form_submit_label', 'Send enquiry');
  // Success screen copy
  ins.run('corporate_events_success_title', 'Enquiry received — thank you!');
  ins.run('corporate_events_success_sub',   "We'll put together a tailored proposal and get back to you within 24 hours.");
  ins.run('corporate_events_success_steps', JSON.stringify([
    'Confirmation email on its way with your enquiry summary',
    'We may call to clarify a detail or two before pricing',
    "You'll receive a formal quote with PO/VAT breakdown",
  ]));
}

// Ensure gallery_images setting exists
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'gallery_images'").get();
  if (check.count === 0) {
    db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run('gallery_images', '[]');
    console.log('Seeded gallery_images setting.');
  }
}

// Ensure Gallery page settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'gallery_hero_title'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('gallery_hero_title', 'Our Gallery');
    ins.run('gallery_hero_sub', 'A glimpse of the creativity from our sessions');
    console.log('Seeded gallery page defaults.');
  }
}

// Create gift_vouchers table
db.exec(`
  CREATE TABLE IF NOT EXISTS gift_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount_pence INTEGER NOT NULL,
    purchaser_name TEXT NOT NULL,
    purchaser_email TEXT NOT NULL,
    recipient_name TEXT,
    recipient_email TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    payment_reference TEXT,
    used_booking_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate bookings table: add voucher_code and voucher_discount_pence columns if missing
{
  const cols = db.prepare("PRAGMA table_info(bookings)").all();
  if (!cols.find(c => c.name === 'voucher_code')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN voucher_code TEXT').run();
    console.log('Migrated bookings: added voucher_code column.');
  }
  if (!cols.find(c => c.name === 'voucher_discount_pence')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN voucher_discount_pence INTEGER DEFAULT 0').run();
    console.log('Migrated bookings: added voucher_discount_pence column.');
  }
}

// Migrate bookings table: add payment_reference column if missing
{
  const cols = db.prepare("PRAGMA table_info(bookings)").all();
  if (!cols.find(c => c.name === 'payment_reference')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN payment_reference TEXT').run();
    console.log('Migrated bookings: added payment_reference column.');
  }
}

// Migrate payments table: add payment_reference and provider columns if missing
{
  const cols = db.prepare("PRAGMA table_info(payments)").all();
  if (!cols.find(c => c.name === 'payment_reference')) {
    db.prepare('ALTER TABLE payments ADD COLUMN payment_reference TEXT').run();
    // Copy existing stripe IDs into the new column
    db.prepare("UPDATE payments SET payment_reference = stripe_payment_intent_id WHERE stripe_payment_intent_id IS NOT NULL").run();
    console.log('Migrated payments: added payment_reference column.');
  }
  if (!cols.find(c => c.name === 'provider')) {
    db.prepare("ALTER TABLE payments ADD COLUMN provider TEXT DEFAULT 'stripe'").run();
    console.log('Migrated payments: added provider column.');
  }
}

// Ensure payment provider settings exist
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  ins.run('stripe_enabled', 'false');
  ins.run('stripe_publishable_key', '');
  ins.run('stripe_secret_key', '');
  ins.run('stripe_webhook_secret', '');
  ins.run('sumup_enabled', 'false');
  ins.run('sumup_api_key', '');
  ins.run('sumup_merchant_code', '');
}

// Ensure about banner images setting exists
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
  ins.run('about_banner_images', '[]');
}

// Create discount_codes table
db.exec(`
  CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    discount_type TEXT NOT NULL DEFAULT 'percentage',
    discount_value INTEGER NOT NULL,
    min_order_pence INTEGER DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    expires_at TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate bookings: add discount_code and discount_pence columns if missing
{
  const cols = db.prepare('PRAGMA table_info(bookings)').all();
  if (!cols.find(c => c.name === 'discount_code')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN discount_code TEXT').run();
  }
  if (!cols.find(c => c.name === 'discount_pence')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN discount_pence INTEGER DEFAULT 0').run();
  }
}

// Create categories table
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed default categories if empty
{
  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (count.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    ['Painting', 'Craft', 'Pottery', 'Drawing', 'Sculpture', 'Other'].forEach(n => ins.run(n));
    console.log('Seeded default categories.');
  }
}

// Migrate contact_submissions: add custom_fields column if missing
{
  const cols = db.prepare("PRAGMA table_info(contact_submissions)").all();
  if (!cols.find(c => c.name === 'custom_fields')) {
    db.prepare('ALTER TABLE contact_submissions ADD COLUMN custom_fields TEXT DEFAULT NULL').run();
    console.log('Migrated contact_submissions: added custom_fields column.');
  }
  if (!cols.find(c => c.name === 'reply_body')) {
    db.prepare('ALTER TABLE contact_submissions ADD COLUMN reply_body TEXT DEFAULT NULL').run();
    console.log('Migrated contact_submissions: added reply_body column.');
  }
  if (!cols.find(c => c.name === 'replied_at')) {
    db.prepare('ALTER TABLE contact_submissions ADD COLUMN replied_at TEXT DEFAULT NULL').run();
    console.log('Migrated contact_submissions: added replied_at column.');
  }
}

// Seed contact_form_fields with default WhatsApp consent checkbox
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'contact_form_fields'").get();
  if (check.count === 0) {
    const defaultFields = JSON.stringify([
      { id: 'whatsapp_consent', type: 'checkbox', label: "Yes, add me to the WhatsApp broadcast and mailing list", required: false }
    ]);
    db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run('contact_form_fields', defaultFields);
    console.log('Seeded contact_form_fields defaults.');
  }
}

// Ensure homepage pillar (key points) settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'about_pillar_1_title'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('about_pillar_1_title', 'All levels welcome');
    ins.run('about_pillar_1_text',  'From first-timers to seasoned creatives');
    ins.run('about_pillar_2_title', 'Everything included');
    ins.run('about_pillar_2_text',  'Materials, guidance and drinks provided');
    ins.run('about_pillar_3_title', 'Small groups');
    ins.run('about_pillar_3_text',  'Intimate sessions for a personal experience');
    console.log('Seeded homepage pillar defaults.');
  }
}

// Migrate bookings: add reminder and review tracking columns if missing
{
  const cols = db.prepare('PRAGMA table_info(bookings)').all();
  if (!cols.find(c => c.name === 'reminder_sent_at')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT DEFAULT NULL').run();
    console.log('Migrated bookings: added reminder_sent_at column.');
  }
  if (!cols.find(c => c.name === 'review_request_sent_at')) {
    db.prepare('ALTER TABLE bookings ADD COLUMN review_request_sent_at TEXT DEFAULT NULL').run();
    console.log('Migrated bookings: added review_request_sent_at column.');
  }
}

// Create waitlist table
db.exec(`
  CREATE TABLE IF NOT EXISTS event_waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    notified_at TEXT DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id)
  )
`);

// Create private event quotes table
db.exec(`
  CREATE TABLE IF NOT EXISTS private_event_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    group_size TEXT NOT NULL,
    preferred_date TEXT DEFAULT '',
    date_flexible INTEGER DEFAULT 0,
    activity_type TEXT NOT NULL,
    venue_preference TEXT DEFAULT '',
    budget_range TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    how_heard TEXT DEFAULT '',
    estimate_low INTEGER DEFAULT 0,
    estimate_high INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate private_event_quotes: add custom_answers column if missing
{
  const cols = db.prepare('PRAGMA table_info(private_event_quotes)').all();
  if (!cols.find(c => c.name === 'custom_answers')) {
    db.prepare('ALTER TABLE private_event_quotes ADD COLUMN custom_answers TEXT DEFAULT NULL').run();
    console.log('Migrated private_event_quotes: added custom_answers column.');
  }
}

// Migrate private_event_quotes: add quote_type + company_name columns for
// the Corporate / Team-Building landing page.
try { db.exec("ALTER TABLE private_event_quotes ADD COLUMN quote_type TEXT DEFAULT 'private'"); } catch {}
try { db.exec("ALTER TABLE private_event_quotes ADD COLUMN company_name TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE private_event_quotes ADD COLUMN job_title TEXT DEFAULT ''"); } catch {}

// Seed default quote form config if not already set
db.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('pe_quote_config', ?)").run(
  JSON.stringify({
    activities: [
      { name: 'Sip & Paint',         price_pence: 3500 },
      { name: 'Canvas Workshop',      price_pence: 4000 },
      { name: 'Watercolour Workshop', price_pence: 3500 },
      { name: 'Life Drawing',         price_pence: 4500 },
      { name: 'Craft Night',          price_pence: 3000 },
      { name: "Kids' Art Party",      price_pence: 2500 },
      { name: 'Custom / Other',       price_pence: 3500 },
    ],
    group_sizes: [
      { label: '6–10',  min: 6,  max: 10 },
      { label: '11–15', min: 11, max: 15 },
      { label: '16–20', min: 16, max: 20 },
      { label: '21–30', min: 21, max: 30 },
      { label: '30+',   min: 30, max: 50  },
    ],
    venues: ['Your venue', 'Our venue', 'Flexible'],
  })
);

// Ensure SEO settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'seo_business_name'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
    ins.run('seo_business_name',    'Paint & Bubbles');
    ins.run('seo_business_phone',   '');
    ins.run('seo_business_address', '');
    ins.run('seo_business_city',    '');
    ins.run('seo_business_postcode','');
    ins.run('seo_google_verification', '');
    ins.run('seo_og_image',         '');
    ins.run('seo_desc_home',        '');
    ins.run('seo_desc_about',       '');
    ins.run('seo_desc_events',      '');
    ins.run('seo_desc_reviews',     '');
    ins.run('seo_desc_gallery',     '');
    ins.run('seo_desc_faq',         '');
    ins.run('seo_desc_contact',     '');
    ins.run('seo_desc_gift_vouchers',    '');
    ins.run('seo_desc_private_events',   '');
    console.log('Seeded SEO settings.');
  }
}

// Seed LocalBusiness schema details (phone, city, areas served, opening hours).
// Each key is added only if missing — never overwrites a value the admin has
// already set via the SEO settings tab. The opening-hours JSON matches
// schema.org's OpeningHoursSpecification format so server.js can emit it
// straight into the LocalBusiness JSON-LD block.
{
  const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');

  // Set phone in international format so Google can validate it.
  const phoneRow = db.prepare("SELECT value FROM site_settings WHERE key='seo_business_phone'").get();
  if (!phoneRow || !phoneRow.value) {
    db.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('seo_business_phone', '+447877336620')").run();
  }

  const cityRow = db.prepare("SELECT value FROM site_settings WHERE key='seo_business_city'").get();
  if (!cityRow || !cityRow.value) {
    db.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('seo_business_city', 'Coventry')").run();
  }

  ins.run('seo_areas_served', 'Coventry, Leamington Spa, Solihull');

  // Opening-hours spec — schema.org OpeningHoursSpecification array, two
  // shifts per weekday for the split lunch/evening hours.
  const defaultHours = JSON.stringify([
    { dayOfWeek: 'Monday',    opens: '10:00', closes: '14:00' },
    { dayOfWeek: 'Monday',    opens: '18:00', closes: '21:00' },
    { dayOfWeek: 'Tuesday',   opens: '10:00', closes: '14:00' },
    { dayOfWeek: 'Tuesday',   opens: '18:00', closes: '21:00' },
    { dayOfWeek: 'Wednesday', opens: '10:00', closes: '14:00' },
    { dayOfWeek: 'Wednesday', opens: '18:00', closes: '21:00' },
    { dayOfWeek: 'Thursday',  opens: '10:00', closes: '14:00' },
    { dayOfWeek: 'Thursday',  opens: '18:00', closes: '21:00' },
    { dayOfWeek: 'Friday',    opens: '10:00', closes: '14:00' },
    { dayOfWeek: 'Saturday',  opens: '10:00', closes: '17:00' },
    { dayOfWeek: 'Sunday',    opens: '09:00', closes: '17:00' },
  ]);
  ins.run('seo_opening_hours_json', defaultHours);
}

// Ensure Legal pages (Terms, Privacy, Refund Policy) settings exist
{
  const check = db.prepare("SELECT COUNT(*) as count FROM site_settings WHERE key = 'legal_terms_content'").get();
  if (check.count === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');

    // Hero titles/subtitles
    ins.run('legal_terms_hero_title',    'Terms & Conditions');
    ins.run('legal_terms_hero_sub',      'The terms that apply when you book with us');
    ins.run('legal_privacy_hero_title',  'Privacy Policy');
    ins.run('legal_privacy_hero_sub',    'How we collect, use and protect your information');
    ins.run('legal_refund_hero_title',   'Refund Policy');
    ins.run('legal_refund_hero_sub',     'Our policy on cancellations, refunds and changes');

    // Terms & Conditions — Paint & Bubbles official copy (Version 1.0 — 2025)
    ins.run('legal_terms_content', `
<p><strong>Creative Events — Public, Corporate &amp; Private</strong><br><em>Version 1.0 — 2025</em></p>
<p>Please read the following terms and conditions carefully. By paying a deposit or any part of your booking fee, you confirm that you have read, understood, and agreed to these terms on behalf of yourself and, where applicable, all members of your group or organisation.</p>

<h2>1. About Paint &amp; Bubbles</h2>
<p>Paint &amp; Bubbles is a creative events business providing painting and craft experiences for individuals, groups, and corporate clients. Events take place at a variety of venues including third-party venues, outdoor spaces, restaurants, bars, and private homes, as agreed at the time of booking.</p>

<h2>2. Booking &amp; Deposit</h2>
<p>A deposit of 50% of the total booking value is required to secure your date. Your booking is not confirmed and no date is held until the deposit has been received in full. All deposits are strictly non-refundable under all circumstances.</p>
<p>The exact deposit amount and payment deadline will be confirmed on your invoice, by email, or via WhatsApp at the time of booking.</p>

<h2>3. Final Balance</h2>
<p>The remaining balance must be paid in full no later than 4 weeks before your event date, unless a different date has been confirmed on your invoice, by email, or via WhatsApp.</p>
<p>If full payment is not received by the agreed date, Paint &amp; Bubbles reserves the right to cancel the booking. In the event of cancellation for non-payment, all payments made including the deposit remain non-refundable.</p>

<h2>4. Corporate Bookings &amp; Invoicing</h2>
<p>Corporate clients booking on behalf of a company or organisation are subject to the following additional terms:</p>
<ul>
  <li>A signed booking confirmation or purchase order number may be required before the event date is secured.</li>
  <li>Payment must be made by the date stated on your invoice or as requested by Paint &amp; Bubbles by email or WhatsApp. Your date is not secured until payment has been received in full.</li>
  <li>If payment is not made by the agreed date, Paint &amp; Bubbles reserves the right to cancel the booking. All payments made remain non-refundable.</li>
  <li>The company placing the booking accepts liability for full payment regardless of internal procurement processes or delays.</li>
  <li>Corporate cancellation terms are the same as those set out in Section 6.</li>
</ul>

<h2>5. Minimum Guest Numbers</h2>
<p>All bookings are made on the basis of a minimum guest number, which will be confirmed at the time of booking. If fewer guests attend or numbers drop below this minimum for any reason, the full price for the minimum number remains due and payable.</p>

<h2>6. Cancellations &amp; Date Changes</h2>
<p>All bookings are strictly non-refundable and non-cancellable once a deposit or full payment has been made. All payments, including deposits, remain non-refundable under all circumstances.</p>
<p>In exceptional circumstances, a one-time date change may be considered, subject to availability and entirely at the discretion of Paint &amp; Bubbles. All date change requests must be submitted in writing.</p>
<p>Paint &amp; Bubbles reserves the right to cancel or reschedule an event in circumstances beyond our reasonable control, including but not limited to severe weather, venue unavailability, or safety concerns. In such cases, an alternative date will be offered. Where a suitable alternative cannot be agreed, a credit or partial refund may be considered at the discretion of Paint &amp; Bubbles.</p>

<h2>7. Outdoor &amp; External Venue Events</h2>
<p>Where events take place outdoors or at external venues (including restaurants, bars, corporate premises, or private outdoor spaces), the following applies:</p>
<ul>
  <li>Paint &amp; Bubbles accepts no responsibility for weather conditions affecting outdoor events. No refund will be issued due to weather unless the event is cancelled by Paint &amp; Bubbles.</li>
  <li>The client or venue host is responsible for ensuring the outdoor or external space is suitable, safe, and accessible for all guests prior to the event.</li>
  <li>Paint &amp; Bubbles will carry out a basic visual assessment on arrival but does not accept liability for hazards inherent to the venue or outdoor environment.</li>
  <li>Where a venue cancels or becomes unavailable, Paint &amp; Bubbles will make reasonable efforts to offer an alternative date but accepts no liability for costs incurred by the client as a result.</li>
</ul>

<h2>8. Private Home Events</h2>
<p>Where an event takes place at a client's private home or at the home of a guest:</p>
<ul>
  <li>The host is responsible for ensuring the space is safe, clear, and suitable for the activity prior to the instructor's arrival.</li>
  <li>Paint &amp; Bubbles accepts no liability for damage to flooring, furniture, soft furnishings, or personal property. The use of protective coverings is strongly recommended and the responsibility of the host.</li>
  <li>Paint &amp; Bubbles holds Public Liability Insurance. A copy of the certificate is available upon request.</li>
</ul>

<h2>9. Public Liability Insurance</h2>
<p>Paint &amp; Bubbles holds Public Liability Insurance to the value required by our insurers. A copy of our current PLI certificate is available upon written request. Corporate clients requiring evidence of cover prior to an event should request this at the time of booking.</p>

<h2>10. Third-Party Additions</h2>
<p>Any additional elements arranged alongside your Paint &amp; Bubbles session — such as food, drinks packages, or other venue services — are organised directly with the venue or third-party provider. Paint &amp; Bubbles accepts no responsibility for any part of these arrangements. All payments for third-party additions must be made directly to the relevant provider, subject to their own terms and conditions.</p>

<h2>11. Liability &amp; Damage</h2>
<p>Paint and art materials are used throughout all Paint &amp; Bubbles events. We strongly recommend that all guests wear clothing they do not mind getting paint on. Paint &amp; Bubbles accepts no responsibility for damage to clothing, personal belongings, or property.</p>
<p>Where events take place at third-party venues, Paint &amp; Bubbles accepts no liability for any loss, injury, or accident occurring on the premises. All guests attend at their own risk.</p>
<p>Paint &amp; Bubbles' total liability to any client in connection with any event shall not exceed the total amount paid by that client for the event in question.</p>

<h2>12. Health &amp; Safety</h2>
<p>Paint &amp; Bubbles will conduct a basic risk assessment prior to or upon arrival at each event location. Clients and guests are expected to follow any reasonable safety instructions given by the Paint &amp; Bubbles instructor.</p>
<p>Any known health conditions, allergies, or mobility requirements that may be relevant to the event should be disclosed to Paint &amp; Bubbles in writing prior to the event date.</p>

<h2>13. Conduct</h2>
<p>Paint &amp; Bubbles reserves the right to ask any guest to leave the event if their behaviour is deemed disruptive, threatening, or inappropriate. No refund will be issued in such circumstances.</p>

<h2>14. Photography &amp; Video</h2>
<p>Paint &amp; Bubbles may take photographs and videos during events for use on our social media, website, and marketing materials. By proceeding with payment you confirm acceptance of this unless you notify us in writing before the event.</p>
<p>If you or any of your guests do not wish to be photographed or filmed, please inform us in writing prior to your event date and we will ensure those individuals are not included in any content we publish.</p>
<p>For corporate events, Paint &amp; Bubbles will seek written confirmation from the event organiser regarding photography and video permissions before the event takes place.</p>

<h2>15. Data Protection &amp; Marketing</h2>
<p>Paint &amp; Bubbles collects and processes personal data (including names, email addresses, and contact details) for the purpose of administering bookings and communicating with clients. Your data will never be sold or shared with third parties except where strictly required to process your booking.</p>
<p>Unless you have informed us in writing at the time of booking, or verbally during your event, that you do not wish to be contacted for future bookings, Paint &amp; Bubbles may contact you by email or WhatsApp regarding future events and offers. If you wish to opt out at any point, please inform us in writing and we will remove you from all future communications immediately.</p>
<p>Paint &amp; Bubbles complies with the UK General Data Protection Regulation (UK GDPR) and the Privacy and Electronic Communications Regulations (PECR).</p>

<h2>16. Governing Law</h2>
<p>These terms and conditions are governed by the laws of England and Wales. Any disputes arising from bookings with Paint &amp; Bubbles shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>

<p style="text-align:center;margin-top:32px"><strong>By proceeding with payment, you confirm that you have read, understood, and agreed to these Terms &amp; Conditions.</strong></p>
<p style="text-align:center;font-style:italic;color:#8A4560">Paint &amp; Bubbles | paint · create · connect</p>
`.trim());

    // Privacy Policy — default body
    ins.run('legal_privacy_content', `
<p><em>Last updated: April 2026</em></p>
<p>Paint &amp; Bubbles (\"we\", \"us\", \"our\") is committed to protecting your privacy. This Privacy Policy explains how we collect, use and protect your personal information when you visit our website, book an event, or get in touch with us.</p>

<h2>1. Information We Collect</h2>
<p>We collect information that you give us directly, including:</p>
<ul>
  <li>Your name, email address and phone number when you book an event, purchase a gift voucher, join a waiting list or submit our contact form.</li>
  <li>Event booking details, including any notes or dietary requirements you share with us.</li>
  <li>Records of any correspondence between you and us.</li>
</ul>
<p>We also automatically collect limited technical information when you visit our website, such as your IP address, browser type, and pages viewed. This is used only to keep the site secure and improve the experience.</p>

<h2>2. Payment Data</h2>
<p>Payments are processed directly by our payment provider, SumUp. We never see or store your full card number, CVV or expiry date. SumUp holds this data securely in line with PCI-DSS standards. Please see the SumUp privacy notice for details of how they process your payment information.</p>

<h2>3. How We Use Your Information</h2>
<p>We use your personal data to:</p>
<ul>
  <li>Process your booking and send you confirmation and reminder emails.</li>
  <li>Contact you if there is a change or problem with your booking.</li>
  <li>Respond to any enquiries you make through our contact form.</li>
  <li>Issue refunds or credits where applicable.</li>
  <li>Send you occasional marketing emails or WhatsApp broadcasts — only if you have opted in.</li>
  <li>Keep financial records as required by UK tax law.</li>
</ul>

<h2>4. Legal Basis for Processing</h2>
<p>We rely on the following lawful bases under UK GDPR:</p>
<ul>
  <li><strong>Contract</strong> — to process your booking and deliver the event.</li>
  <li><strong>Consent</strong> — for marketing messages and non-essential cookies. You can withdraw consent at any time.</li>
  <li><strong>Legitimate interest</strong> — to improve our website and protect against fraud.</li>
  <li><strong>Legal obligation</strong> — to keep records required by HMRC and other regulators.</li>
</ul>

<h2>5. Sharing Your Data</h2>
<p>We never sell your data. We only share it with trusted service providers who help us run our business, including:</p>
<ul>
  <li><strong>SumUp</strong> — to take card payments.</li>
  <li><strong>Our email provider</strong> — to send booking confirmations and notifications.</li>
  <li><strong>Our hosting provider</strong> — who stores our website and database securely within the UK/EU.</li>
</ul>
<p>We may also disclose your data if required by law, or to protect our rights.</p>

<h2>6. Cookies</h2>
<p>Our website uses a small number of cookies to function correctly and to remember your preferences. We do not use advertising cookies. You can control cookies at any time through your browser settings.</p>

<h2>7. How Long We Keep Your Data</h2>
<p>We keep your booking records for up to 6 years to comply with UK accounting requirements. Marketing contacts are kept until you unsubscribe. Contact form enquiries are kept for up to 2 years.</p>

<h2>8. Your Rights</h2>
<p>Under UK GDPR you have the right to:</p>
<ul>
  <li>Access a copy of the personal data we hold about you.</li>
  <li>Ask us to correct inaccurate data.</li>
  <li>Ask us to delete your data (subject to legal retention requirements).</li>
  <li>Object to processing or ask us to restrict it.</li>
  <li>Withdraw consent for marketing at any time.</li>
  <li>Lodge a complaint with the Information Commissioner\\'s Office (ICO) at <a href=\"https://ico.org.uk\" target=\"_blank\" rel=\"noopener\">ico.org.uk</a>.</li>
</ul>

<h2>9. Security</h2>
<p>We take reasonable steps to protect your personal data, including the use of secure HTTPS, encrypted database storage, and limited access controls. However, no transmission over the internet can be guaranteed 100% secure.</p>

<h2>10. Contact</h2>
<p>If you have any questions about this policy or wish to exercise your rights, please <a href=\"/contact\">get in touch</a>.</p>
`.trim());

    // Refund Policy — default body (aligned with Terms & Conditions v1.0)
    ins.run('legal_refund_content', `
<p><em>Last updated: April 2026</em></p>
<p>This Refund Policy sets out how refunds are handled at Paint &amp; Bubbles. It should be read alongside our full <a href="/terms">Terms &amp; Conditions</a>, which take precedence in the event of any conflict.</p>

<h2>1. All Payments Are Non-Refundable</h2>
<p>All bookings with Paint &amp; Bubbles are strictly non-refundable and non-cancellable once a deposit or full payment has been made. This includes the 50% deposit required to secure your date and any subsequent balance payments.</p>
<p>We pre-book venues, materials and instructors well in advance of each event, which is why payments cannot be returned once your booking is confirmed.</p>

<h2>2. Date Changes</h2>
<p>In exceptional circumstances, a one-time date change may be considered, subject to availability and entirely at the discretion of Paint &amp; Bubbles. All date change requests must be submitted in writing to <a href="/contact">our contact page</a>.</p>

<h2>3. Minimum Guest Numbers</h2>
<p>All bookings are made on the basis of a minimum guest number, which is confirmed at the time of booking. If fewer guests attend or numbers drop below the agreed minimum, the full price for the minimum number remains due and payable — no partial refunds will be issued.</p>

<h2>4. Cancellations By Paint &amp; Bubbles</h2>
<p>Paint &amp; Bubbles reserves the right to cancel or reschedule an event in circumstances beyond our reasonable control, including but not limited to severe weather, venue unavailability, or safety concerns. In such cases, an alternative date will be offered.</p>
<p>Where a suitable alternative cannot be agreed, a credit towards a future event or a partial refund may be offered at the discretion of Paint &amp; Bubbles. Approved refunds are issued back to the original card or payment method via SumUp, our payment provider, and usually appear in your account within 5–10 business days.</p>

<h2>5. Outdoor &amp; Weather</h2>
<p>Paint &amp; Bubbles accepts no responsibility for weather conditions affecting outdoor events. No refund will be issued due to weather unless the event is cancelled by Paint &amp; Bubbles.</p>

<h2>6. Gift Vouchers</h2>
<p>Gift vouchers are non-refundable and cannot be exchanged for cash. They can be redeemed against any eligible event up to the value of the voucher, and any unused balance remains on the voucher for future use.</p>

<h2>7. Conduct</h2>
<p>Paint &amp; Bubbles reserves the right to ask any guest to leave an event if their behaviour is deemed disruptive, threatening, or inappropriate. No refund will be issued in such circumstances.</p>

<h2>8. Chargebacks</h2>
<p>If you believe there has been a genuine issue with your payment, please <a href="/contact">contact us</a> before raising a chargeback with your bank — we'll nearly always be able to resolve things quickly and directly.</p>

<h2>9. Your Statutory Rights</h2>
<p>Nothing in this Refund Policy affects your statutory rights under the Consumer Rights Act 2015 or any other applicable UK law.</p>

<h2>10. Contact</h2>
<p>Questions about a booking? Please <a href="/contact">get in touch</a> and we'll do our best to help.</p>
`.trim());

    // SEO meta descriptions for legal pages
    ins.run('seo_desc_terms',   '');
    ins.run('seo_desc_privacy', '');
    ins.run('seo_desc_refund',  '');

    console.log('Seeded legal pages (Terms, Privacy, Refund) defaults.');
  }
}

// Seed sample events if empty
const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get();
if (eventCount.count === 0) {
  const sampleEvents = [
    ['Sunset Watercolours', 'Join us for a relaxing evening of watercolour painting. All materials provided. Suitable for beginners and experienced artists alike. Enjoy a glass of prosecco while you paint!', 'Painting', '2026-04-05', '18:00', 120, '12 Studio Lane, Brighton BN1 1AB', 16, 4500, null],
    ['Floral Acrylic Night', 'Paint a stunning floral arrangement using acrylics. Our friendly instructor will guide you through every brushstroke. Wine and nibbles included.', 'Painting', '2026-04-12', '19:00', 150, '12 Studio Lane, Brighton BN1 1AB', 20, 5000, null],
    ['Candle Making & Cocktails', 'Create your own hand-poured soy candle while enjoying expertly crafted cocktails. Take your candle home as a beautiful keepsake.', 'Craft', '2026-04-18', '19:30', 120, '7 The Arches, Brighton BN2 1TB', 12, 5500, null],
    ['Abstract Painting Masterclass', 'Explore the world of abstract art with our expert tutor. Learn techniques used by the greats and create your own abstract masterpiece to take home.', 'Painting', '2026-04-25', '14:00', 180, '12 Studio Lane, Brighton BN1 1AB', 14, 6000, null],
    ['Pottery & Prosecco', 'Get your hands dirty with clay! Learn hand-building techniques to craft your own bowl or vase. Prosecco and light bites served throughout.', 'Craft', '2026-05-03', '11:00', 180, '7 The Arches, Brighton BN2 1TB', 10, 6500, null]
  ];

  const insertSql = 'INSERT INTO events (title, description, category, date, time, duration_minutes, location, capacity, price_pence, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  sampleEvents.forEach(e => db.prepare(insertSql).run(...e));
  console.log('Sample events seeded.');
}

module.exports = db;
