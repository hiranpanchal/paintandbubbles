/**
 * Email service — uses Resend HTTP API (HTTPS, never blocked by Railway).
 * Set RESEND_API_KEY in Railway env vars. Get a free key at https://resend.com
 * Set EMAIL_FROM to your verified sending address, e.g. noreply@paintandbubbles.co.uk
 */

const RESEND_API = 'https://api.resend.com/emails';
const db = require('../database');
const { buildBookingIcs } = require('./ics');

function getFrom() {
  return process.env.EMAIL_FROM || 'Paint & Bubbles <noreply@paintandbubbles.co.uk>';
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Returns the logo URL from site_settings, or null if not set
function getSiteLogo() {
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'logo_url'").get();
    return (row && row.value) ? row.value : null;
  } catch { return null; }
}

// Header logo block — shows logo on white pill, or falls back to decorative dots + text
function getLogoHeaderHtml() {
  const logo = getSiteLogo();
  if (logo) {
    return `<div style="margin-bottom:14px;"><img src="${logo}" alt="Paint &amp; Bubbles" style="height:72px;max-width:240px;object-fit:contain;background:#ffffff;border-radius:12px;padding:10px 18px;display:inline-block;"></div>`;
  }
  return `<div style="margin-bottom:16px;">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.3);margin:0 3px;"></span>
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(255,212,222,0.4);margin:0 3px;"></span>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(143,168,181,0.4);margin:0 3px;"></span>
    </div>
    <h1 style="margin:0 0 4px;color:#ffffff;font-size:32px;font-weight:700;font-family:'Dancing Script',cursive;letter-spacing:0.5px;">Paint &amp; Bubbles</h1>`;
}

// Footer logo block — shows logo or Dancing Script text fallback
function getLogoFooterHtml() {
  const logo = getSiteLogo();
  if (logo) {
    return `<img src="${logo}" alt="Paint &amp; Bubbles" style="height:48px;max-width:180px;object-fit:contain;margin-bottom:4px;display:inline-block;">`;
  }
  return `<p style="margin:0 0 6px;color:#2C2028;font-size:18px;font-weight:700;font-family:'Dancing Script',cursive;">Paint &amp; Bubbles</p>`;
}

/**
 * Core send function — all other functions call this.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string,
 *          attachments?: Array<{ filename: string, content: string|Buffer, contentType?: string }> }} opts
 *
 * Attachments: `content` may be a Buffer or a raw string — we base64-encode it before
 * sending to Resend, which expects base64 in its `content` field.
 */
async function sendEmail({ to, subject, html, replyTo, attachments }) {
  if (!isConfigured()) {
    console.log('[Email] RESEND_API_KEY not set — skipping email to', to);
    return;
  }

  const payload = {
    from: getFrom(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;

  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : Buffer.from(String(a.content), 'utf8').toString('base64'),
      content_type: a.contentType || 'application/octet-stream',
    }));
  }

  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.name || `Resend error ${response.status}`);
  }
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

// ─── Public functions ─────────────────────────────────────────────────────────

async function sendBookingConfirmation(booking) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const bookingRef = `#PB${String(booking.id).padStart(5, '0')}`;
  const bookingRefPlain = `PB${String(booking.id).padStart(5, '0')}`;
  const logoHeader = getLogoHeaderHtml();
  const logoFooter = getLogoFooterHtml();

  // Build the .ics attachment. If anything goes wrong we still send the email
  // without the attachment — the confirmation is the priority.
  let icsFile = null;
  try {
    const icsBody = buildBookingIcs(booking, siteUrl);
    icsFile = {
      filename: `paint-and-bubbles-${bookingRefPlain}.ics`,
      content: icsBody,
      contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
    };
  } catch (err) {
    console.error('[Email] Failed to build .ics for booking', booking.id, err);
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

          <!-- Header / Hero -->
          <tr>
            <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
              ${logoHeader}
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;letter-spacing:0.3px;">🎉 Booking Confirmed!</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 6px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${booking.customer_name},</p>
              <p style="margin:0 0 32px;color:#2C2028;font-size:18px;font-weight:800;">You're all booked in — we can't wait to see you! 🎨</p>

              <!-- Event Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Your Event</p>
                    <h2 style="margin:0 0 18px;color:#2C2028;font-size:20px;font-weight:900;">${booking.event_title}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%;vertical-align:top;">📅 Date</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(booking.event_date)}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">🕐 Time</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.event_time}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">📍 Location</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.event_location}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">🎟 Tickets</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.quantity} ticket${booking.quantity > 1 ? 's' : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0 0;color:#9E8E96;font-size:13px;font-weight:600;border-top:1px solid #FFCCD8;vertical-align:top;">💳 Total Paid</td>
                        <td style="padding:10px 0 0;color:#059669;font-size:15px;font-weight:900;border-top:1px solid #FFCCD8;">${formatPrice(Math.max(0, booking.total_pence - (booking.discount_pence || 0) - (booking.voucher_discount_pence || 0)))}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Booking Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#6B2D42,#C4748A);border-radius:12px;padding:18px 24px;text-align:center;">
                    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Your Booking Reference</p>
                    <p style="margin:0;color:#ffffff;font-size:24px;font-weight:700;font-family:monospace;letter-spacing:3px;">${bookingRef}</p>
                  </td>
                </tr>
              </table>

              <!-- Add to Calendar -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px dashed #FFCCD8;border-radius:12px;margin-bottom:20px;">
                <tr>
                  <td style="padding:18px 24px;text-align:center;">
                    <p style="margin:0 0 4px;color:#2C2028;font-size:14px;font-weight:800;">📅 Add this to your calendar</p>
                    <p style="margin:0 0 10px;color:#9E8E96;font-size:12px;font-weight:500;line-height:1.6;">The <strong>.ics file</strong> attached to this email opens in Google Calendar, Apple Calendar and Outlook. You'll get a reminder 1 day and 1 hour before the event.</p>
                  </td>
                </tr>
              </table>

              <!-- What to bring -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5F7;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#2C2028;font-size:14px;font-weight:800;">What to expect 🖌</p>
                    <p style="margin:0;color:#5C4F57;font-size:13px;font-weight:500;line-height:1.7;">All materials are provided — just arrive on time, ready to have fun! Please save this email as your proof of booking.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9E8E96;font-size:13px;font-weight:500;line-height:1.7;">Got a question? Simply reply to this email and we'll get back to you as soon as possible.</p>
              <p style="margin:16px 0 0;color:#C4748A;font-size:16px;font-weight:700;">See you soon! 🥂✨</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
              ${logoFooter}
              <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;font-weight:500;">Questions? Reply to this email  •  <a href="${siteUrl}" style="color:#C4748A;text-decoration:none;font-weight:700;">${siteUrl}</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: booking.customer_email,
    subject: `Booking Confirmed: ${booking.event_title} — ${bookingRef}`,
    html,
    attachments: icsFile ? [icsFile] : undefined,
  });
  console.log(`[Email] Booking confirmation sent to ${booking.customer_email}${icsFile ? ' (with .ics attached)' : ''}`);
}

async function sendEnquiryNotification(submission, notificationEmail) {
  if (!notificationEmail) {
    console.log('[Email] No notification_email set — skipping enquiry notification');
    return;
  }

  const received = new Date(submission.created_at || new Date()).toLocaleString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:36px 48px;text-align:center;">
              <h1 style="margin:0 0 6px;color:#ffffff;font-size:24px;font-weight:700;">New Contact Enquiry</h1>
              <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">Paint &amp; Bubbles — received ${received}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 48px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%;vertical-align:top;">Name</td>
                        <td style="padding:8px 0;color:#2C2028;font-size:13px;font-weight:700;">${submission.name}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">Email</td>
                        <td style="padding:8px 0;color:#2C2028;font-size:13px;font-weight:700;"><a href="mailto:${submission.email}" style="color:#C4748A;">${submission.email}</a></td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">Phone</td>
                        <td style="padding:8px 0;color:#2C2028;font-size:13px;font-weight:700;">${submission.phone || '—'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#2C2028;font-size:14px;font-weight:700;">Message</p>
              <div style="background:#F9F5F6;border-left:3px solid #C4748A;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:28px;">
                <p style="margin:0;color:#2C2028;font-size:14px;font-weight:500;line-height:1.75;white-space:pre-wrap;">${submission.message}</p>
              </div>

              <p style="margin:0;color:#9E8E96;font-size:13px;">Reply directly to this email to contact them.</p>
              <br>
              <a href="mailto:${submission.email}" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:700;">Reply to ${submission.name}</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF6F8;padding:20px 48px;text-align:center;border-top:1px solid #FFE8EE;">
              <p style="margin:0;color:#9E8E96;font-size:12px;">Paint &amp; Bubbles — Admin Notification</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: notificationEmail,
    subject: `New Enquiry from ${submission.name}`,
    html,
    replyTo: submission.email,
  });
  console.log(`[Email] Enquiry notification sent to ${notificationEmail}`);
}

async function sendGiftVoucher(voucher) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const logoHeader = getLogoHeaderHtml();
  const logoFooter = getLogoFooterHtml();
  const amount = formatPrice(voucher.amount_pence);
  const recipientLine = voucher.recipient_name ? `<p style="margin:0 0 16px;color:#5C4F57;font-size:14px;font-weight:500;">This voucher is for <strong>${voucher.recipient_name}</strong>.</p>` : '';
  const messageLine = voucher.message ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F6;border-left:3px solid #C4748A;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Personal Message</p>
        <p style="margin:0;color:#2C2028;font-size:14px;font-weight:500;line-height:1.75;white-space:pre-wrap;">${voucher.message}</p>
      </td></tr>
    </table>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

          <!-- Header / Hero -->
          <tr>
            <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
              ${logoHeader}
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;letter-spacing:0.3px;">🎁 You've received a Gift Voucher!</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 6px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${voucher.purchaser_name},</p>
              <p style="margin:0 0 28px;color:#2C2028;font-size:18px;font-weight:800;">Your gift voucher is ready to share! 🎨</p>

              ${recipientLine}

              <!-- Voucher Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#6B2D42,#C4748A);border-radius:16px;padding:28px 24px;text-align:center;">
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">Gift Voucher Code</p>
                    <p style="margin:0 0 12px;color:#ffffff;font-size:30px;font-weight:700;font-family:monospace;letter-spacing:4px;">${voucher.code}</p>
                    <p style="margin:0;color:rgba(255,255,255,0.9);font-size:16px;font-weight:700;">Worth ${amount}</p>
                  </td>
                </tr>
              </table>

              ${messageLine}

              <!-- Instructions -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5F7;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#2C2028;font-size:14px;font-weight:800;">How to use this voucher 🖌</p>
                    <p style="margin:0;color:#5C4F57;font-size:13px;font-weight:500;line-height:1.7;">Present this code at checkout when booking any Paint &amp; Bubbles event. The voucher value will be deducted from your booking total.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9E8E96;font-size:13px;font-weight:500;line-height:1.7;">Got a question? Simply reply to this email and we'll get back to you as soon as possible.</p>
              <p style="margin:16px 0 0;color:#C4748A;font-size:16px;font-weight:700;">Happy creating! 🥂✨</p>
              <div style="margin-top:24px;">
                <a href="${siteUrl}/events" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-size:14px;font-weight:700;">Browse Events →</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
              ${logoFooter}
              <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;font-weight:500;">Questions? Reply to this email  •  <a href="${siteUrl}" style="color:#C4748A;text-decoration:none;font-weight:700;">${siteUrl}</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const subject = `🎁 Your Paint & Bubbles Gift Voucher — ${voucher.code}`;
  await sendEmail({ to: voucher.purchaser_email, subject, html });
  console.log(`[Email] Gift voucher sent to ${voucher.purchaser_email}`);

  // Also send to recipient if different from purchaser
  if (voucher.recipient_email && voucher.recipient_email !== voucher.purchaser_email) {
    const recipientHtml = html
      .replace(`Hi ${voucher.purchaser_name},`, `Hi ${voucher.recipient_name || 'there'},`)
      .replace('Your gift voucher is ready to share! 🎨', `${voucher.purchaser_name} has sent you a gift voucher! 🎨`);
    await sendEmail({ to: voucher.recipient_email, subject, html: recipientHtml });
    console.log(`[Email] Gift voucher also sent to recipient ${voucher.recipient_email}`);
  }
}

async function sendAdminBookingNotification(booking, notificationEmail) {
  if (!notificationEmail) return;

  const bookingRef = `#PB${String(booking.id).padStart(5, '0')}`;
  const charged    = Math.max(0, booking.total_pence - (booking.discount_pence || 0) - (booking.voucher_discount_pence || 0));
  const siteUrl    = process.env.SITE_URL || 'http://localhost:3000';

  const discountRows = [];
  if (booking.discount_pence > 0) discountRows.push(`<tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">Discount code</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">−${formatPrice(booking.discount_pence)} (${booking.discount_code || ''})</td></tr>`);
  if (booking.voucher_discount_pence > 0) discountRows.push(`<tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">Gift voucher</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">−${formatPrice(booking.voucher_discount_pence)} (${booking.voucher_code || ''})</td></tr>`);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr>
          <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:36px 48px;text-align:center;">
            <h1 style="margin:0 0 6px;color:#ffffff;font-size:24px;font-weight:700;">🎉 New Booking!</h1>
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">Paint &amp; Bubbles — ${bookingRef}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 48px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 4px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Customer</p>
                <h2 style="margin:0 0 18px;color:#2C2028;font-size:18px;font-weight:900;">${booking.customer_name}</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">Email</td><td style="padding:6px 0;font-size:13px;font-weight:700;"><a href="mailto:${booking.customer_email}" style="color:#C4748A;">${booking.customer_email}</a></td></tr>
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Event</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.event_title}</td></tr>
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Date</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(booking.event_date)} at ${booking.event_time}</td></tr>
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Tickets</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.quantity}</td></tr>
                  ${discountRows.join('')}
                  <tr><td style="padding:10px 0 0;color:#9E8E96;font-size:13px;font-weight:600;border-top:1px solid #FFCCD8;">Amount paid</td><td style="padding:10px 0 0;color:#059669;font-size:15px;font-weight:900;border-top:1px solid #FFCCD8;">${formatPrice(charged)}</td></tr>
                </table>
              </td></tr>
            </table>
            <a href="${siteUrl}/admin" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:700;">View in Dashboard →</a>
          </td>
        </tr>
        <tr><td style="background:#FFF6F8;padding:20px 48px;text-align:center;border-top:1px solid #FFE8EE;"><p style="margin:0;color:#9E8E96;font-size:12px;">Paint &amp; Bubbles — Admin Notification</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: notificationEmail,
    subject: `New Booking: ${booking.event_title} — ${booking.customer_name} (${bookingRef})`,
    html,
    replyTo: booking.customer_email,
  });
  console.log(`[Email] Admin booking notification sent to ${notificationEmail}`);
}

async function sendAdminVoucherNotification(voucher, notificationEmail) {
  if (!notificationEmail) return;

  const siteUrl     = process.env.SITE_URL || 'http://localhost:3000';
  const amount      = formatPrice(voucher.amount_pence);
  const purchasedAt = new Date(voucher.created_at || new Date()).toLocaleString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr>
          <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:36px 48px;text-align:center;">
            <h1 style="margin:0 0 6px;color:#ffffff;font-size:24px;font-weight:700;">🎁 Gift Voucher Sold!</h1>
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">Paint &amp; Bubbles — ${purchasedAt}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 48px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:24px 28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">Purchased by</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${voucher.purchaser_name}</td></tr>
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Email</td><td style="padding:6px 0;font-size:13px;font-weight:700;"><a href="mailto:${voucher.purchaser_email}" style="color:#C4748A;">${voucher.purchaser_email}</a></td></tr>
                  ${voucher.recipient_name ? `<tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Recipient</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${voucher.recipient_name}${voucher.recipient_email ? ` (${voucher.recipient_email})` : ''}</td></tr>` : ''}
                  <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">Voucher code</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;font-family:monospace;letter-spacing:2px;">${voucher.code}</td></tr>
                  <tr><td style="padding:10px 0 0;color:#9E8E96;font-size:13px;font-weight:600;border-top:1px solid #FFCCD8;">Value</td><td style="padding:10px 0 0;color:#059669;font-size:15px;font-weight:900;border-top:1px solid #FFCCD8;">${amount}</td></tr>
                </table>
              </td></tr>
            </table>
            <a href="${siteUrl}/admin" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:700;">View in Dashboard →</a>
          </td>
        </tr>
        <tr><td style="background:#FFF6F8;padding:20px 48px;text-align:center;border-top:1px solid #FFE8EE;"><p style="margin:0;color:#9E8E96;font-size:12px;">Paint &amp; Bubbles — Admin Notification</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: notificationEmail,
    subject: `Gift Voucher Sold: ${amount} — ${voucher.purchaser_name}`,
    html,
  });
  console.log(`[Email] Admin voucher notification sent to ${notificationEmail}`);
}

async function sendEnquiryReply(submission, replyBody) {
  const sentDate = new Date(submission.created_at).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:'Nunito',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0eb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#C4748A,#A85D72);padding:28px 32px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Paint &amp; Bubbles</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px">
          <p style="margin:0 0 16px;font-size:16px;color:#2C2028">Hi ${submission.name.split(' ')[0]},</p>
          <div style="font-size:15px;color:#2C2028;line-height:1.7;white-space:pre-wrap;margin-bottom:24px">${replyBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <p style="margin:24px 0 0;font-size:15px;color:#2C2028">Best wishes,<br><strong>The Paint &amp; Bubbles Team</strong></p>
        </td></tr>

        <!-- Quoted original -->
        <tr><td style="padding:0 32px 28px">
          <div style="border-top:2px solid #f0e4e8;padding-top:20px">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#999">Your original message (${sentDate})</p>
            <p style="margin:0;font-size:13px;color:#888;font-style:italic;white-space:pre-wrap">${(submission.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#fdf8f9;padding:16px 32px;text-align:center;border-top:1px solid #f0e4e8">
          <p style="margin:0;font-size:12px;color:#bbb">This message was sent in response to your enquiry at paintandbubbles.co.uk</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: `${submission.name} <${submission.email}>`,
    subject: `Re: Your enquiry to Paint & Bubbles`,
    html,
    replyTo: process.env.EMAIL_FROM || getFrom(),
  });
  console.log(`[Email] Enquiry reply sent to ${submission.email}`);
}

async function sendReminderEmail(booking) {
  const siteUrl = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const bookingRef = `#PB${String(booking.id).padStart(5, '0')}`;
  const firstName = booking.customer_name.split(' ')[0];
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr><td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🎨</div>
          <h1 style="margin:0 0 6px;color:#fff;font-size:28px;font-weight:700;font-family:'Dancing Script',cursive;">See you tomorrow!</h1>
          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">Your event is just around the corner</p>
        </td></tr>
        <tr><td style="padding:40px 48px;">
          <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${firstName},</p>
          <p style="margin:0 0 28px;color:#2C2028;font-size:17px;font-weight:800;">We're so excited to see you at <em>${booking.event_title}</em> tomorrow! 🥂</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 4px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Your Event Details</p>
              <h2 style="margin:0 0 16px;color:#2C2028;font-size:18px;font-weight:900;">${booking.event_title}</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">📅 Date</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(booking.event_date)}</td></tr>
                <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">🕐 Time</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.event_time}</td></tr>
                <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">📍 Location</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.event_location}</td></tr>
                <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">🎟 Tickets</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.quantity} ticket${booking.quantity > 1 ? 's' : ''}</td></tr>
                <tr><td style="padding:6px 0;color:#9E8E96;font-size:13px;font-weight:600;">🔖 Ref</td><td style="padding:6px 0;color:#2C2028;font-size:13px;font-weight:700;font-family:monospace;">${bookingRef}</td></tr>
              </table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5F7;border-radius:12px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;color:#2C2028;font-size:14px;font-weight:800;">What to bring 🖌</p>
              <p style="margin:0;color:#5C4F57;font-size:13px;font-weight:500;line-height:1.7;">All materials are provided — just bring yourself and your enthusiasm! Please arrive a few minutes early so we can get started on time.</p>
            </td></tr>
          </table>
          <p style="margin:0;color:#9E8E96;font-size:13px;line-height:1.7;">Got a question? Reply to this email and we'll get back to you.</p>
          <p style="margin:16px 0 0;color:#C4748A;font-size:16px;font-weight:700;">Can't wait to see you! 🥂✨</p>
        </td></tr>
        <tr><td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
          ${logoFooter}
          <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;"><a href="${siteUrl}" style="color:#C4748A;text-decoration:none;">${siteUrl}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  await sendEmail({ to: `${booking.customer_name} <${booking.customer_email}>`, subject: `See you tomorrow — ${booking.event_title} 🎨`, html });
  console.log(`[Email] Reminder sent to ${booking.customer_email}`);
}

async function sendReviewRequest(booking, reviewUrl) {
  const firstName = booking.customer_name.split(' ')[0];
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr><td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⭐</div>
          <h1 style="margin:0 0 6px;color:#fff;font-size:28px;font-weight:700;font-family:'Dancing Script',cursive;">How was it?</h1>
          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">We'd love to hear what you thought</p>
        </td></tr>
        <tr><td style="padding:40px 48px;">
          <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${firstName},</p>
          <p style="margin:0 0 20px;color:#2C2028;font-size:17px;font-weight:800;">We hope you had an amazing time at <em>${booking.event_title}</em>! 🎨</p>
          <p style="margin:0 0 28px;color:#5C4F57;font-size:15px;font-weight:500;line-height:1.7;">Your feedback means the world to us — it only takes a minute and helps other people discover us. Would you mind leaving a quick review?</p>
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${reviewUrl}" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;">Leave a Review ⭐</a>
          </div>
          <p style="margin:0;color:#9E8E96;font-size:13px;line-height:1.7;text-align:center;">It only takes 30 seconds — and it really does make a difference. Thank you! 🙏</p>
        </td></tr>
        <tr><td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
          ${logoFooter}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  await sendEmail({ to: `${booking.customer_name} <${booking.customer_email}>`, subject: `How was ${booking.event_title}? Leave us a review 🌟`, html });
  console.log(`[Email] Review request sent to ${booking.customer_email}`);
}

async function sendWaitlistConfirmation(entry, event) {
  const siteUrl = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const firstName = entry.name.split(' ')[0];
  const logoHeader = getLogoHeaderHtml();
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr><td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:36px 48px;text-align:center;">
          ${logoHeader}
          <h1 style="margin:8px 0 6px;color:#fff;font-size:24px;font-weight:700;">You're on the waitlist! 🎉</h1>
        </td></tr>
        <tr><td style="padding:36px 48px;">
          <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${firstName},</p>
          <p style="margin:0 0 20px;color:#2C2028;font-size:16px;font-weight:700;">We've added you to the waitlist for <strong>${event.title}</strong>.</p>
          <p style="margin:0 0 24px;color:#5C4F57;font-size:14px;line-height:1.7;">If a spot becomes available, we'll email you straight away with a link to book — so keep an eye on your inbox. We can't guarantee a space but we'll do our best!</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">📅 Date</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(event.date)}</td></tr>
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;">🕐 Time</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${event.time}</td></tr>
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;">📍 Location</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${event.location}</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:0;color:#9E8E96;font-size:12px;text-align:center;">In the meantime, why not browse our other upcoming events?</p>
          <div style="text-align:center;margin-top:16px;">
            <a href="${siteUrl}/events" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:14px;font-weight:700;">Browse Other Events →</a>
          </div>
        </td></tr>
        <tr><td style="background:#FFF6F8;padding:20px 48px;text-align:center;border-top:1px solid #FFE8EE;">
          ${logoFooter}
          <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;">paintandbubbles.co.uk</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  await sendEmail({ to: `${entry.name} <${entry.email}>`, subject: `You're on the waitlist — ${event.title}`, html });
  console.log(`[Email] Waitlist confirmation sent to ${entry.email}`);
}

async function sendWaitlistSpotAvailable(entry, event) {
  const siteUrl = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const firstName = entry.name.split(' ')[0];
  const bookingUrl = `${siteUrl}/events/${event.id}`;
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">
        <tr><td style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);padding:36px 48px;text-align:center;">
          <div style="font-size:40px;margin-bottom:10px;">🎉</div>
          <h1 style="margin:0 0 6px;color:#fff;font-size:24px;font-weight:700;">A spot has opened up!</h1>
          <p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;">${event.title}</p>
        </td></tr>
        <tr><td style="padding:36px 48px;">
          <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${firstName},</p>
          <p style="margin:0 0 16px;color:#2C2028;font-size:17px;font-weight:800;">Great news — a spot has just opened up on your waitlisted event!</p>
          <p style="margin:0 0 24px;color:#5C4F57;font-size:14px;line-height:1.7;">Spaces go fast, so we recommend booking as soon as possible to secure your place.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:12px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <h3 style="margin:0 0 12px;color:#2C2028;font-size:16px;font-weight:800;">${event.title}</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%">📅 Date</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(event.date)}</td></tr>
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;">🕐 Time</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${event.time}</td></tr>
                <tr><td style="padding:5px 0;color:#9E8E96;font-size:13px;font-weight:600;">📍 Location</td><td style="padding:5px 0;color:#2C2028;font-size:13px;font-weight:700;">${event.location}</td></tr>
              </table>
            </td></tr>
          </table>
          <div style="text-align:center;">
            <a href="${bookingUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;">Book My Spot Now →</a>
          </div>
        </td></tr>
        <tr><td style="background:#FFF6F8;padding:20px 48px;text-align:center;border-top:1px solid #FFE8EE;">
          ${logoFooter}
          <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;">paintandbubbles.co.uk</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim();

  await sendEmail({ to: `${entry.name} <${entry.email}>`, subject: `A spot just opened up — ${event.title} 🎉`, html });
  console.log(`[Email] Waitlist spot-available sent to ${entry.email}`);
}

async function sendEnquiryConfirmation(submission) {
  const siteUrl = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const firstName = submission.name.split(' ')[0];
  const receivedAt = new Date(submission.created_at || new Date()).toLocaleString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const logoHeader = getLogoHeaderHtml();
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
              ${logoHeader}
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">We've received your message 💌</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${firstName},</p>
              <p style="margin:0 0 28px;color:#2C2028;font-size:18px;font-weight:800;">Thanks for getting in touch! 🎨</p>
              <p style="margin:0 0 28px;color:#5C4F57;font-size:15px;font-weight:500;line-height:1.7;">We've received your enquiry and will get back to you as soon as possible — usually within 24 hours. In the meantime, here's a copy of what you sent us:</p>

              <!-- Message copy -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;padding:24px 28px;">
                    <p style="margin:0 0 6px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Your message · ${receivedAt}</p>
                    <p style="margin:0;color:#2C2028;font-size:14px;font-weight:500;line-height:1.75;white-space:pre-wrap;">${submission.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;color:#5C4F57;font-size:14px;font-weight:500;line-height:1.7;">While you wait, why not browse our upcoming events? There's always something creative on!</p>

              <div style="text-align:center;">
                <a href="${siteUrl}/events" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700;">Browse Events →</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
              ${logoFooter}
              <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;font-weight:500;">paintandbubbles.co.uk</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: `${submission.name} <${submission.email}>`,
    subject: `We've received your enquiry — Paint & Bubbles`,
    html,
  });
  console.log(`[Email] Enquiry confirmation sent to ${submission.email}`);
}

async function sendCancellationEmail(booking, isRefund = false) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const bookingRef = `#PB${String(booking.id).padStart(5, '0')}`;
  const logoHeader = getLogoHeaderHtml();
  const logoFooter = getLogoFooterHtml();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
              ${logoHeader}
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;letter-spacing:0.3px;">Booking Cancellation</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 6px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${escHtml(booking.customer_name)},</p>
              <p style="margin:0 0 32px;color:#2C2028;font-size:18px;font-weight:800;">Your booking has been cancelled.</p>

              <!-- Event Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;color:#A85D72;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Cancelled Booking</p>
                    <h2 style="margin:0 0 18px;color:#2C2028;font-size:20px;font-weight:900;">${escHtml(booking.event_title)}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;width:30%;vertical-align:top;">📅 Date</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${formatDate(booking.event_date)}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">🕐 Time</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${escHtml(booking.event_time || '')}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">📍 Location</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${escHtml(booking.event_location || '')}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:#9E8E96;font-size:13px;font-weight:600;vertical-align:top;">🎟 Tickets</td>
                        <td style="padding:7px 0;color:#2C2028;font-size:13px;font-weight:700;">${booking.quantity} ticket${booking.quantity > 1 ? 's' : ''}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Booking Reference -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#F0F5F7;border-radius:12px;padding:18px 24px;text-align:center;">
                    <p style="margin:0 0 4px;color:#9E8E96;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Booking Reference</p>
                    <p style="margin:0;color:#2C2028;font-size:24px;font-weight:700;font-family:monospace;letter-spacing:3px;">${bookingRef}</p>
                  </td>
                </tr>
              </table>

              ${isRefund ? `
              <!-- Refund Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px;color:#166534;font-size:14px;font-weight:800;">💳 Refund on its way</p>
                    <p style="margin:0;color:#15803D;font-size:13px;font-weight:500;line-height:1.7;">A refund has been issued to your original payment method. Please allow 5–10 business days for it to appear on your statement.</p>
                  </td>
                </tr>
              </table>` : ''}

              <!-- Browse Events CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${siteUrl}/events" style="display:inline-block;background:linear-gradient(135deg,#6B2D42,#C4748A);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:50px;letter-spacing:0.3px;">Browse Upcoming Events →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9E8E96;font-size:13px;font-weight:500;line-height:1.7;">Got a question about your cancellation? Simply reply to this email and we'll get back to you as soon as possible.</p>
              <p style="margin:16px 0 0;color:#C4748A;font-size:16px;font-weight:700;">We hope to see you at a future event! 🎨</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FFF6F8;padding:24px 48px;text-align:center;border-top:1px solid #FFE8EE;">
              ${logoFooter}
              <p style="margin:4px 0 0;color:#9E8E96;font-size:12px;font-weight:500;">Questions? Reply to this email  •  <a href="${siteUrl}" style="color:#C4748A;text-decoration:none;font-weight:700;">${siteUrl}</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  await sendEmail({
    to: booking.customer_email,
    subject: `Booking Cancelled: ${booking.event_title} — ${bookingRef}`,
    html,
  });
  console.log(`[Email] Cancellation email sent to ${booking.customer_email}`);
}

async function sendTestEmail(to) {
  await sendEmail({
    to,
    subject: '✅ Test Email — Paint & Bubbles',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fdf8f9;border-radius:12px">
        <h2 style="color:#C4748A;margin:0 0 16px">Email is working! 🎉</h2>
        <p style="color:#2C2028;margin:0 0 12px">This is a test email from your <strong>Paint &amp; Bubbles</strong> admin dashboard.</p>
        <p style="color:#2C2028;margin:0 0 12px">Your email settings are correctly configured. Booking confirmations, gift voucher emails and admin notifications will all send successfully.</p>
        <hr style="border:none;border-top:1px solid #e0d0d4;margin:24px 0">
        <p style="color:#999;font-size:12px;margin:0">Sent via Resend from paintandbubbles.co.uk</p>
      </div>
    `,
  });
  console.log(`[Email] Test email sent to ${to}`);
}

// ─── Private Event Quotes ─────────────────────────────────────────────────────

function formatPricePence(pence) {
  if (!pence) return '£0';
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;
}

async function sendPrivateQuoteToAdmin(quote, notificationEmail, labelledAnswers = []) {
  if (!notificationEmail) {
    console.log('[Email] No notification_email set — skipping private quote admin notification');
    return;
  }

  const quoteRef = `#PQ${String(quote.id).padStart(5, '0')}`;
  const siteUrl  = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const dateStr  = quote.preferred_date
    ? new Date(quote.preferred_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Not specified';
  const flexibility = quote.date_flexible ? ' (flexible)' : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
          <div style="font-size:44px;margin-bottom:12px;">🎨</div>
          <h1 style="margin:0 0 6px;color:#fff;font-size:26px;font-weight:700;font-family:'Dancing Script',cursive;">New Private Event Quote</h1>
          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">${quoteRef} &nbsp;·&nbsp; ${new Date(quote.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 48px;">

          <!-- Contact info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Enquirer</p>
              <p style="margin:0 0 2px;font-size:18px;font-weight:800;color:#2C2028;">${escapeHtml(quote.name)}</p>
              <p style="margin:0 0 2px;font-size:14px;color:#6B2D42;"><a href="mailto:${escapeHtml(quote.email)}" style="color:#6B2D42;">${escapeHtml(quote.email)}</a></p>
              ${quote.phone ? `<p style="margin:0;font-size:14px;color:#9E8E96;">${escapeHtml(quote.phone)}</p>` : ''}
            </td></tr>
          </table>

          <!-- Event details grid -->
          <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Event Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
            ${[
              ['Activity',         quote.activity_type],
              ['Group Size',       quote.group_size + ' people'],
              ['Preferred Date',   dateStr + flexibility],
              ['Venue',            quote.venue_preference || 'Not specified'],
              ['Budget Range',     quote.budget_range    || 'Not specified'],
            ].map(([label, val], i) => `
            <tr style="background:${i % 2 === 0 ? '#FFF6F8' : '#fff'}">
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#9E8E96;width:38%;border-radius:${i === 0 ? '10px 10px' : '0'} 0 0;">${label}</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#2C2028;">${escapeHtml(val)}</td>
            </tr>`).join('')}
          </table>

          ${labelledAnswers.length ? `
          <!-- Custom answers -->
          <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Additional Questions</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
            ${labelledAnswers.map(({ label, answer }, i) => `
            <tr style="background:${i % 2 === 0 ? '#FFF6F8' : '#fff'}">
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#9E8E96;width:38%;">${escapeHtml(label)}</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#2C2028;">${escapeHtml(answer)}</td>
            </tr>`).join('')}
          </table>` : ''}

          ${quote.notes ? `
          <!-- Notes -->
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Special Requests / Notes</p>
          <p style="margin:0 0 28px;background:#FFF6F8;border-left:3px solid #C4748A;padding:14px 18px;border-radius:0 10px 10px 0;font-size:14px;color:#2C2028;line-height:1.6;">${escapeHtml(quote.notes)}</p>
          ` : ''}

          <!-- Estimate -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#2C0F18,#6B2D42);border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Auto-Generated Estimate</p>
              <p style="margin:0;color:#fff;font-size:28px;font-weight:800;">${formatPricePence(quote.estimate_low)} – ${formatPricePence(quote.estimate_high)}</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:12px;">Based on ${quote.group_size} people · ${escapeHtml(quote.activity_type)}</p>
            </td></tr>
          </table>

          ${quote.how_heard ? `<p style="margin:0 0 28px;font-size:13px;color:#9E8E96;">Heard about us via: <strong>${escapeHtml(quote.how_heard)}</strong></p>` : ''}

          <!-- CTA -->
          <div style="text-align:center;">
            <a href="mailto:${escapeHtml(quote.email)}?subject=Re: Your Private Event Quote (${quoteRef})" style="display:inline-block;background:linear-gradient(135deg,#A85D72,#6B2D42);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:50px;box-shadow:0 4px 14px rgba(168,93,114,0.35);">
              Reply to ${escapeHtml(quote.name.split(' ')[0])}
            </a>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 48px;text-align:center;border-top:1px solid #F5DDE3;">
          <p style="margin:0;font-size:12px;color:#C8B8BC;">
            <a href="${siteUrl}/admin" style="color:#C4748A;text-decoration:none;font-weight:700;">Open Admin Dashboard</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: notificationEmail,
    subject: `New Private Event Quote ${quoteRef} — ${quote.name} (${quote.group_size}, ${quote.activity_type})`,
    html,
    replyTo: quote.email,
  });
  console.log(`[Email] Private quote admin notification sent for quote ${quoteRef}`);
}

async function sendPrivateQuoteConfirmation(quote, labelledAnswers = []) {
  const quoteRef   = `#PQ${String(quote.id).padStart(5, '0')}`;
  const siteUrl    = process.env.SITE_URL || 'https://paintandbubbles.co.uk';
  const firstName  = quote.name.split(' ')[0];
  const logoFooter = getLogoFooterHtml();
  const dateStr    = quote.preferred_date
    ? new Date(quote.preferred_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#FDF8F9;font-family:'Nunito','Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(160,80,110,0.15);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2C0F18 0%,#6B2D42 50%,#C4748A 100%);padding:44px 48px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🥂</div>
          <h1 style="margin:0 0 6px;color:#fff;font-size:28px;font-weight:700;font-family:'Dancing Script',cursive;">Quote Request Received!</h1>
          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;font-weight:600;">We'll be in touch within 24 hours</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 48px;">
          <p style="margin:0 0 8px;color:#9E8E96;font-size:14px;font-weight:600;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:0 0 28px;color:#2C2028;font-size:17px;font-weight:800;">Thank you for your enquiry — we're thrilled you're considering a private event with Paint &amp; Bubbles! 🎨</p>

          <p style="margin:0 0 16px;font-size:14px;color:#6B2D42;line-height:1.6;">Your quote request <strong>${quoteRef}</strong> has been received and one of our team will review your details and send you a personalised proposal within 24 hours.</p>

          <!-- Summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Your Request Summary</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${[
                  ['Reference',   quoteRef],
                  ['Activity',    quote.activity_type],
                  ['Group Size',  quote.group_size + ' people'],
                  ...(dateStr ? [['Preferred Date', dateStr + (quote.date_flexible ? ' (flexible)' : '')]] : []),
                  ...(quote.venue_preference ? [['Venue', quote.venue_preference]] : []),
                ].map(([label, val]) => `
                <tr>
                  <td style="padding:5px 0;font-size:13px;font-weight:700;color:#9E8E96;width:40%;vertical-align:top;">${label}</td>
                  <td style="padding:5px 0;font-size:13px;font-weight:600;color:#2C2028;">${escapeHtml(val)}</td>
                </tr>`).join('')}
              </table>
            </td></tr>
          </table>

          ${labelledAnswers.length ? `
          <!-- Custom answers -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F8;border:1px solid #FFCCD8;border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 14px;font-size:12px;font-weight:700;color:#C4748A;text-transform:uppercase;letter-spacing:.8px">Your Additional Answers</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${labelledAnswers.map(({ label, answer }) => `
                <tr>
                  <td style="padding:5px 0;font-size:13px;font-weight:700;color:#9E8E96;width:40%;vertical-align:top;">${escapeHtml(label)}</td>
                  <td style="padding:5px 0;font-size:13px;font-weight:600;color:#2C2028;">${escapeHtml(answer)}</td>
                </tr>`).join('')}
              </table>
            </td></tr>
          </table>` : ''}

          <!-- Estimate banner -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#2C0F18,#6B2D42);border-radius:14px;margin-bottom:28px;">
            <tr><td style="padding:24px 28px;text-align:center;">
              <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px">Estimated Price Range</p>
              <p style="margin:0;color:#fff;font-size:30px;font-weight:800;">${formatPricePence(quote.estimate_low)} – ${formatPricePence(quote.estimate_high)}</p>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:12px;line-height:1.5;">This is an initial estimate based on your group size &amp; activity.<br>Your finalised quote may vary based on your specific requirements.</p>
            </td></tr>
          </table>

          <!-- What happens next -->
          <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#2C2028;">What happens next?</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            ${[
              ['✉️', 'We\'ll review your details and craft a personalised proposal'],
              ['📞', 'We may call or email you to discuss any specific requirements'],
              ['🎨', 'Once you\'re happy, we\'ll lock in your date and get the fun started!'],
            ].map(([icon, text]) => `
            <tr><td style="padding:8px 0;vertical-align:top;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="font-size:18px;padding-right:12px;vertical-align:top;padding-top:2px;">${icon}</td>
                <td style="font-size:14px;color:#6B2D42;line-height:1.5;">${text}</td>
              </tr></table>
            </td></tr>`).join('')}
          </table>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${siteUrl}/private-events" style="display:inline-block;background:linear-gradient(135deg,#A85D72,#6B2D42);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:50px;box-shadow:0 4px 14px rgba(168,93,114,0.35);">
              View Private Events Page
            </a>
          </div>

          <p style="margin:0;font-size:13px;color:#9E8E96;text-align:center;line-height:1.6;">Questions in the meantime? Just reply to this email — we'd love to chat! 💬</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 48px;text-align:center;border-top:1px solid #F5DDE3;">
          ${logoFooter}
          <p style="margin:4px 0 0;font-size:12px;color:#C8B8BC;">Creative experiences for unforgettable moments</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: `${quote.name} <${quote.email}>`,
    subject: `Your Private Event Quote Request ${quoteRef} — Paint & Bubbles`,
    html,
  });
  console.log(`[Email] Private quote confirmation sent to ${quote.email}`);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendReminderEmail,
  sendReviewRequest,
  sendWaitlistConfirmation,
  sendWaitlistSpotAvailable,
  sendEnquiryNotification,
  sendEnquiryConfirmation,
  sendGiftVoucher,
  sendAdminBookingNotification,
  sendAdminVoucherNotification,
  sendEnquiryReply,
  sendPrivateQuoteToAdmin,
  sendPrivateQuoteConfirmation,
  sendTestEmail,
};
