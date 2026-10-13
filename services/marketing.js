// Marketing consent (GDPR) + "How did you hear about us?" options.

// Exact wording shown next to the checkout checkbox. Stored with every consent
// record so we can prove what the customer agreed to, even if it changes later.
const CHECKOUT_CONSENT_TEXT =
  "I'd like to receive occasional emails / WhatsApp messages from Paint & Bubbles with early event dates, special offers and updates.";

const HEARD_ABOUT_OPTIONS = {
  google:       'Google search',
  instagram:    'Instagram',
  facebook:     'Facebook',
  tiktok:       'TikTok',
  referral:     'Referral',
  repeat:       'Repeat customer',
  gift_voucher: 'Gift voucher',
  other:        'Other',
};

// Append a consent record and update the customer's current preference.
function recordConsent(db, { customerId, email, consented, consentText, source, bookingId = null, req = null }) {
  const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() : null;
  const ua = req ? (req.headers['user-agent'] || '').slice(0, 255) : null;
  db.prepare(`
    INSERT INTO marketing_consents (customer_id, email, consented, consent_text, source, booking_id, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(customerId, email, consented ? 1 : 0, consentText, source, bookingId, ip, ua);
  db.prepare(`UPDATE customers SET marketing_opt_in = ?, marketing_opt_in_updated_at = datetime('now') WHERE id = ?`)
    .run(consented ? 1 : 0, customerId);
}

module.exports = { CHECKOUT_CONSENT_TEXT, HEARD_ABOUT_OPTIONS, recordConsent };
