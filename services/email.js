/**
 * Email service — uses Resend HTTP API (HTTPS, never blocked by Railway).
 * Set RESEND_API_KEY in Railway env vars. Get a free key at https://resend.com
 * Set EMAIL_FROM to your verified sending address, e.g. noreply@paintandbubbles.co.uk
 */

const RESEND_API = 'https://api.resend.com/emails';

function getFrom() {
  return process.env.EMAIL_FROM || 'Paint & Bubbles <noreply@paintandbubbles.co.uk>';
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Core send function — all other functions call this.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} opts
 */
async function sendEmail({ to, subject, html, replyTo }) {
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
              <div style="margin-bottom:16px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.3);margin:0 3px;"></span>
                <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(255,212,222,0.4);margin:0 3px;"></span>
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(143,168,181,0.4);margin:0 3px;"></span>
              </div>
              <h1 style="margin:0 0 4px;color:#ffffff;font-size:32px;font-weight:700;font-family:'Dancing Script',cursive;letter-spacing:0.5px;">Paint &amp; Bubbles</h1>
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

              <!-- What to bring -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5F7;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;color:#2C2028;font-size:14px;font-weight:800;">What to expect 🖌</p>
                    <p style="margin:0;color:#5C4F57;font-size:13px;font-weight:500;line-height:1.7;">All materials are provided — just arrive on time, ready to have fun! Drinks will be available. Please save this email as your proof of booking.</p>
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
              <p style="margin:0 0 6px;color:#2C2028;font-size:18px;font-weight:700;font-family:'Dancing Script',cursive;">Paint &amp; Bubbles</p>
              <p style="margin:0;color:#9E8E96;font-size:12px;font-weight:500;">Questions? Reply to this email  •  <a href="${siteUrl}" style="color:#C4748A;text-decoration:none;font-weight:700;">${siteUrl}</a></p>
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
  });
  console.log(`[Email] Booking confirmation sent to ${booking.customer_email}`);
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
              <div style="margin-bottom:16px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.3);margin:0 3px;"></span>
                <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(255,212,222,0.4);margin:0 3px;"></span>
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(143,168,181,0.4);margin:0 3px;"></span>
              </div>
              <h1 style="margin:0 0 4px;color:#ffffff;font-size:32px;font-weight:700;font-family:'Dancing Script',cursive;letter-spacing:0.5px;">Paint &amp; Bubbles</h1>
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
              <p style="margin:0 0 6px;color:#2C2028;font-size:18px;font-weight:700;font-family:'Dancing Script',cursive;">Paint &amp; Bubbles</p>
              <p style="margin:0;color:#9E8E96;font-size:12px;font-weight:500;">Questions? Reply to this email  •  <a href="${siteUrl}" style="color:#C4748A;text-decoration:none;font-weight:700;">${siteUrl}</a></p>
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

module.exports = {
  sendBookingConfirmation,
  sendEnquiryNotification,
  sendGiftVoucher,
  sendAdminBookingNotification,
  sendAdminVoucherNotification,
  sendEnquiryReply,
  sendTestEmail,
};
