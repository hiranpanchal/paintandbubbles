const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '../public/uploads');
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

// POST /api/design/settings — admin only
router.post('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO site_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  const saveAll = db.transaction(settings => {
    for (const [key, value] of Object.entries(settings)) {
      upsert.run(key, value ?? '');
    }
  });
  saveAll(req.body);
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
