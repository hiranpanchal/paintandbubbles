const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Store uploads in DATA_DIR/uploads so they persist on the Railway volume
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, '../db');
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.(jpe?g|png|gif|webp|svg)$/i.test(path.extname(file.originalname))) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// GET /api/design/settings — public (used by frontend pages to apply branding)
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => (settings[r.key] = r.value));
  res.json(settings);
});

// GET /api/design/vars.css — inline CSS variables for flash-free page load
router.get('/vars.css', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const s = {};
  rows.forEach(r => (s[r.key] = r.value));

  const colorMap = {
    color_rose:         '--rose',
    color_rose_deep:    '--rose-deep',
    color_rose_dark:    '--rose-dark',
    color_bg:           '--bg',
    color_text_dark:    '--text-dark',
    color_bg_about:     '--bg-about',
    color_bg_trust:     '--bg-trust',
    color_bg_events:    '--bg-events',
    color_bg_social:    '--bg-social',
    color_bg_footer:    '--bg-footer',
    color_banner_start: '--banner-start',
    color_banner_mid:   '--banner-mid',
    color_banner_end:   '--banner-end',
    color_divider:      '--divider',
  };

  const getFontStack = (name) => {
    const cursive = ['Dancing Script','Pacifico','Caveat','Satisfy','Great Vibes','Lobster'];
    const serif   = ['Playfair Display','Merriweather','Lora','Cormorant Garamond','DM Serif Display','EB Garamond'];
    if (cursive.includes(name)) return `'${name}', cursive`;
    if (serif.includes(name))   return `'${name}', serif`;
    return `'${name}', sans-serif`;
  };

  const fontKeys = ['font_body','font_h1','font_h2','font_h3','font_h4','font_hero_highlight'];
  const fontCssVars = { font_body: '--font-body', font_h1: '--font-h1', font_h2: '--font-h2', font_h3: '--font-h3', font_h4: '--font-h4', font_hero_highlight: '--font-hero-highlight' };
  const fontSelectors = { font_body: 'body, p, span, li, label, input, textarea, button, a', font_h1: 'h1', font_h2: 'h2', font_h3: 'h3', font_h4: 'h4', font_hero_highlight: '.hero-highlight' };

  const defaultFonts = ['Nunito', 'Dancing Script'];
  const customFonts = [...new Set(fontKeys.map(k => s[k]).filter(Boolean).filter(f => !defaultFonts.includes(f)))];

  const colorVars = Object.entries(colorMap)
    .filter(([key]) => s[key])
    .map(([key, cssVar]) => `  ${cssVar}: ${s[key]};`)
    .join('\n');

  const fontVarLines = fontKeys
    .filter(k => s[k])
    .map(k => `  ${fontCssVars[k]}: ${getFontStack(s[k])};`)
    .join('\n');

  const fontRules = fontKeys
    .filter(k => s[k])
    .map(k => `${fontSelectors[k]} { font-family: ${getFontStack(s[k])} !important; }`)
    .join('\n');

  const allVars = [colorVars, fontVarLines].filter(Boolean).join('\n');

  const googleImport = customFonts.length
    ? `@import url('https://fonts.googleapis.com/css2?family=${customFonts.map(f => f.replace(/ /g, '+') + ':wght@400;600;700').join('&family=')}&display=swap');\n`
    : '';

  res.setHeader('Content-Type', 'text/css');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${googleImport}${allVars ? `:root {\n${allVars}\n}\n` : ''}${fontRules}`);
});

// POST /api/design/settings — admin only
router.post('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO site_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  db.exec('BEGIN');
  try {
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, value ?? '');
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => (settings[r.key] = r.value));
  res.json(settings);
});

// POST /api/design/upload — admin only
router.post('/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// DELETE /api/design/upload — remove an uploaded file (admin only)
router.delete('/upload', requireAdmin, (req, res) => {
  const { filename } = req.body;
  if (!filename || filename.includes('..')) return res.status(400).json({ error: 'Invalid filename' });
  const filePath = path.join(uploadsDir, path.basename(filename));
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  res.json({ success: true });
});

module.exports = router;
