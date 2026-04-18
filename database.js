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
    hero_subtitle:             'Discover unique painting and craft events in Brighton. All materials provided. Drinks included. Just bring yourself!',
    hero_cta_primary_text:     'Browse All Events',
    hero_cta_primary_url:      '/events',
    hero_cta_secondary_text:   'About Us',
    hero_cta_secondary_url:    '#about',
    about_title:               'Where creativity meets good company',
    about_body_1:              "Paint & Bubbles is Brighton's favourite creative events studio. We host relaxed, fun painting and craft sessions for all skill levels — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.",
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
    ins.run('aboutpage_body_1', "Paint & Bubbles is Brighton's favourite creative events studio. We host relaxed, fun painting and craft sessions for all skill levels — whether you're a total beginner or a seasoned artist, you'll leave with something you're proud of and a smile on your face.");
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
