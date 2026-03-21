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
`);

// Migrate: add role, is_active and last_login_at to admin_users if not present
try { db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin'"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN last_login_at TEXT"); } catch {}
// Ensure the seeded admin is a super_admin
db.prepare("UPDATE admin_users SET role = 'super_admin' WHERE role = 'admin' AND id = (SELECT MIN(id) FROM admin_users)").run();

// Migrate: add class_attended column if it doesn't exist yet
try {
  db.exec("ALTER TABLE reviews ADD COLUMN class_attended TEXT DEFAULT ''");
} catch (e) { /* column already exists */ }

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
