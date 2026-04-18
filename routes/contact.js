const router = require('express').Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendEnquiryNotification, sendEnquiryReply } = require('../services/email');

// POST /api/contact — public, submit contact form
router.post('/', (req, res) => {
  const { name, email, phone, message, custom_fields } = req.body;
  if (!name || !email || !phone || !message) return res.status(400).json({ error: 'Name, email, phone and message are required' });
  const customJson = custom_fields && typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : null;
  const result = db.prepare(
    'INSERT INTO contact_submissions (name, email, phone, message, custom_fields) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), email.trim(), phone.trim(), message.trim(), customJson);

  // Fetch the stored submission (includes created_at) and send notification (non-blocking)
  const submission = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(result.lastInsertRowid);
  const notifSetting = db.prepare("SELECT value FROM site_settings WHERE key = 'notification_email'").get();
  const notificationEmail = notifSetting?.value || process.env.NOTIFICATION_EMAIL || '';
  sendEnquiryNotification(submission, notificationEmail).catch(err => console.error('Enquiry email error:', err));

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

// GET /api/contact — admin, get all submissions
router.get('/', requireAdmin, (req, res) => {
  const submissions = db.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC').all();
  res.json(submissions);
});

// PATCH /api/contact/:id/read — admin, mark as read
router.patch('/:id/read', requireAdmin, (req, res) => {
  db.prepare('UPDATE contact_submissions SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/contact/:id/reply — admin, send email reply to customer
router.post('/:id/reply', requireAdmin, async (req, res) => {
  const { reply_body } = req.body;
  if (!reply_body || !reply_body.trim()) {
    return res.status(400).json({ error: 'Reply message cannot be empty' });
  }
  const submission = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Enquiry not found' });

  try {
    await sendEnquiryReply(submission, reply_body.trim());
    db.prepare(
      "UPDATE contact_submissions SET reply_body = ?, replied_at = datetime('now'), is_read = 1 WHERE id = ?"
    ).run(reply_body.trim(), req.params.id);
    const updated = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(req.params.id);
    res.json({ success: true, submission: updated });
  } catch (err) {
    console.error('Reply send error:', err);
    res.status(500).json({ error: err.message || 'Failed to send reply' });
  }
});

// GET /api/contact/unread-count — admin, get unread count
router.get('/unread-count', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM contact_submissions WHERE is_read = 0').get();
  res.json({ count: row.count });
});

// DELETE /api/contact/:id — admin, delete submission
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
