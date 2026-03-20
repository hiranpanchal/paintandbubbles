const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

async function sendBookingConfirmation(booking) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('Email not configured — skipping confirmation email for booking', booking.id);
    return;
  }

  const transporter = createTransporter();
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
              <!-- Watercolour dot decoration -->
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
                        <td style="padding:10px 0 0;color:#059669;font-size:15px;font-weight:900;border-top:1px solid #FFCCD8;">${formatPrice(booking.total_pence)}</td>
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
</html>
  `.trim();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Paint & Bubbles <noreply@paintandbubbles.com>',
    to: booking.customer_email,
    subject: `Booking Confirmed: ${booking.event_title} — ${bookingRef}`,
    html
  });

  console.log(`Confirmation email sent to ${booking.customer_email}`);
}

module.exports = { sendBookingConfirmation };
