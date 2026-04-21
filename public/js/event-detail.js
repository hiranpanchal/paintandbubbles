/* =============================================
   PAINT & BUBBLES — EVENT DETAIL PAGE
   ============================================= */

let stripe = null;
let paymentConfig = { stripe_enabled: false, sumup_enabled: false, stripe_publishable_key: '' };
let currentEvent = null;
let currentBookingState = {};
let siteSettings = {};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
  fetchPaymentConfig();

  const id = getEventIdFromUrl();
  if (!id) {
    showError('Event not found.');
    return;
  }

  try {
    const event = await apiFetch(`/api/events/${id}`);
    currentEvent = event;
    document.title = `${event.title} — Paint & Bubbles`;
    renderEventDetail(event);
  } catch {
    showError('This event could not be found.');
  }
});

function getEventIdFromUrl() {
  const parts = window.location.pathname.split('/');
  const id = parseInt(parts[parts.length - 1]);
  return isNaN(id) ? null : id;
}

// ---- APPLY DESIGN SETTINGS ----
async function applyDesignSettings() {
  try {
    const res = await fetch('/api/design/settings');
    if (!res.ok) return;
    const s = await res.json();

    const vars = [];
    if (s.color_rose)       vars.push(`--rose: ${s.color_rose}`);
    if (s.color_rose_deep)  vars.push(`--rose-deep: ${s.color_rose_deep}`);
    if (s.color_rose_dark)  vars.push(`--rose-dark: ${s.color_rose_dark}`);
    if (s.color_bg)         vars.push(`--bg: ${s.color_bg}`);
    if (s.color_text_dark)  vars.push(`--text-dark: ${s.color_text_dark}`);
    if (s.color_bg_about)   vars.push(`--bg-about: ${s.color_bg_about}`);
    if (s.color_bg_trust)   vars.push(`--bg-trust: ${s.color_bg_trust}`);
    if (s.color_bg_events)  vars.push(`--bg-events: ${s.color_bg_events}`);
    if (s.color_bg_social)  vars.push(`--bg-social: ${s.color_bg_social}`);
    if (s.color_bg_footer)      vars.push(`--bg-footer: ${s.color_bg_footer}`);
    if (s.color_banner_start)   vars.push(`--banner-start: ${s.color_banner_start}`);
    if (s.color_banner_mid)     vars.push(`--banner-mid: ${s.color_banner_mid}`);
    if (s.color_banner_end)     vars.push(`--banner-end: ${s.color_banner_end}`);
    if (vars.length) {
      const st = document.createElement('style');
      st.textContent = `:root { ${vars.join('; ')} }`;
      document.head.appendChild(st);
    }

    if (s.logo_url) {
      document.querySelectorAll('.logo-img').forEach(img => {
        img.src = s.logo_url; img.style.display = '';
      });
      const fb = document.getElementById('logo-fallback');
      if (fb) fb.style.display = 'none';
    }

    if (s.footer_logo_url) {
      const fImg = document.querySelector('.footer-logo-img');
      if (fImg) { fImg.src = s.footer_logo_url; fImg.style.display = ''; }
      const fFb = document.getElementById('footer-logo-fallback');
      if (fFb) fFb.style.display = 'none';
    }
    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }

    // Fonts
    applyFontSettings(s);

    // Social section
    renderSocialSection(s);
    renderReviewsSection();

    siteSettings = s;
  } catch {}
}

// ---- FONT SETTINGS ----
function applyFontSettings(s) {
  const map = {
    font_body:           { cssVar: '--font-body',           selectors: 'body, p, span, li, label, input, textarea, button, a' },
    font_h1:             { cssVar: '--font-h1',             selectors: 'h1' },
    font_h2:             { cssVar: '--font-h2',             selectors: 'h2' },
    font_h3:             { cssVar: '--font-h3',             selectors: 'h3' },
    font_h4:             { cssVar: '--font-h4',             selectors: 'h4' },
    font_hero_highlight: { cssVar: '--font-hero-highlight', selectors: '.hero-highlight' },
  };
  const fontsNeeded = [], vars = [], rules = [];
  for (const [key, { cssVar, selectors }] of Object.entries(map)) {
    if (s[key]) {
      const stack = getFontStack(s[key]);
      vars.push(`${cssVar}: ${stack}`);
      rules.push(`${selectors} { font-family: ${stack} !important; }`);
      fontsNeeded.push(s[key]);
    }
  }
  const unique = [...new Set(fontsNeeded)].filter(f => !['Nunito','Dancing Script'].includes(f));
  if (unique.length) {
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${unique.map(f => f.replace(/ /g,'+')+':wght@400;600;700').join('&family=')}&display=swap`;
    document.head.appendChild(link);
  }
  if (vars.length) {
    const existing = document.getElementById('pb-font-vars'); if (existing) existing.remove();
    const st = document.createElement('style'); st.id = 'pb-font-vars';
    st.textContent = `:root { ${vars.join('; ')} }\n${rules.join('\n')}`; document.head.appendChild(st);
  }
}
function getFontStack(name) {
  if (['Dancing Script','Pacifico','Caveat','Satisfy','Great Vibes','Lobster'].includes(name)) return `'${name}', cursive`;
  if (['Playfair Display','Merriweather','Lora','Cormorant Garamond','DM Serif Display','EB Garamond'].includes(name)) return `'${name}', serif`;
  return `'${name}', sans-serif`;
}

// ---- SOCIAL SECTION ----
const SOCIAL_PLATFORMS = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>' },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  twitter:   { label: 'X (Twitter)', color: '#000000', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
  pinterest: { label: 'Pinterest',  color: '#E60023', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>' },
  linkedin:  { label: 'LinkedIn',   color: '#0A66C2', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' },
  spotify:   { label: 'Spotify',    color: '#1DB954', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>' },
};

function renderSocialSection(s) {
  const section = document.getElementById('social-section');
  if (!section) return;
  const titleEl = document.getElementById('social-section-title');
  if (titleEl && s.social_title) titleEl.textContent = s.social_title;
  let links = [];
  try { links = JSON.parse(s.social_links || '[]'); } catch {}
  links = links.filter(l => l.url);
  if (!links.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  const row = document.getElementById('social-links-row');
  if (row) {
    row.innerHTML = links.map(({ platform, url }) => {
      const p = SOCIAL_PLATFORMS[platform];
      if (!p) return '';
      return `<a href="${url.replace(/"/g,'&quot;')}" class="social-link" target="_blank" rel="noopener"
                 title="${p.label}" style="--sc:${p.color}">${p.icon}</a>`;
    }).join('');
  }
}

async function renderReviewsSection() {
  const section = document.getElementById('reviews-section');
  if (!section) return;
  try {
    const allReviews = await fetch('/api/reviews').then(r => r.json());
    if (!allReviews || !allReviews.length) { section.style.display = 'none'; return; }
    const reviews = allReviews.slice(0, 8);
    section.style.display = '';
    const track = document.getElementById('reviews-track');
    if (!track) return;

    // Calculate average rating (based on all reviews)
    const avg = (allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length).toFixed(1);
    const scoreEl = section.querySelector('.reviews-score');
    if (scoreEl) scoreEl.textContent = avg;
    const starsEl = section.querySelector('.reviews-stars-big');
    if (starsEl) {
      const full = Math.round(parseFloat(avg));
      starsEl.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
    }

    track.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-card-top">
          <div class="review-card-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          <div class="review-tp-logo">
            <svg viewBox="0 0 24 24" fill="#00b67a"><path d="M12 2l2.4 4.8 5.3.8-3.85 3.75.91 5.3L12 14.27l-4.76 2.53.91-5.3L4.3 7.6l5.3-.8z"/></svg>
            Verified
          </div>
        </div>
        <p class="review-card-body">"${escHtml(r.body)}"</p>
        <div class="review-card-author">
          <span class="review-author-name">${escHtml(r.author_name)}</span>
          ${r.author_location ? `<span class="review-author-location">${escHtml(r.author_location)}</span>` : ''}
          ${r.review_date ? `<span class="review-author-location">${new Date(r.review_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch { if (section) section.style.display = 'none'; }
}

async function fetchPaymentConfig() {
  try {
    const res = await fetch('/api/payments/config');
    if (res.ok) {
      paymentConfig = await res.json();
      if (paymentConfig.stripe_enabled && paymentConfig.stripe_publishable_key) {
        stripe = Stripe(paymentConfig.stripe_publishable_key);
      }
    }
  } catch {}
}

// ---- RENDER EVENT DETAIL ----
function renderEventDetail(event) {
  const spotsLeft = event.spots_remaining;
  const isSoldOut = spotsLeft <= 0;
  const isLowStock = spotsLeft > 0 && spotsLeft <= 5;
  const price = event.price_pence === 0 ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const duration = formatDuration(event.duration_minutes);

  const heroBg = event.image_url
    ? `style="background: linear-gradient(to bottom, rgba(28,10,18,0.65) 0%, rgba(28,10,18,0.45) 60%, rgba(28,10,18,0.75) 100%), url(${escHtml(event.image_url)}) center/cover no-repeat;"`
    : `style="background: linear-gradient(135deg, var(--banner-start) 0%, var(--banner-mid) 50%, var(--banner-end) 100%);"`;

  const spotsColor = isSoldOut ? 'var(--coral)' : isLowStock ? 'var(--amber)' : 'var(--green)';
  const spotsText  = isSoldOut
    ? 'Sold out'
    : isLowStock
    ? `Only ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left!`
    : `${spotsLeft} spots available`;

  document.getElementById('event-detail-root').innerHTML = `

    <!-- HERO -->
    <div class="ed-hero" ${heroBg}>
      <div class="container">
        <div class="ed-breadcrumb">
          <a href="/events">← All Events</a>
        </div>
        <span class="ed-category">${escHtml(event.category)}</span>
        <h1 class="ed-title">${escHtml(event.title)}</h1>
        <div class="ed-hero-meta">
          <div class="ed-hero-meta-item">
            <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 4v2M13 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            ${formatDate(event.date)}
          </div>
          <div class="ed-hero-meta-item">
            <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            ${event.time} &nbsp;·&nbsp; ${duration}
          </div>
          <div class="ed-hero-meta-item">
            <svg viewBox="0 0 20 20" fill="none"><path d="M10 2C7.24 2 5 4.24 5 7c0 4.25 5 11 5 11s5-6.75 5-11c0-2.76-2.24-5-5-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/></svg>
            ${escHtml(event.location)}
          </div>
        </div>
      </div>
    </div>

    <!-- TWO-COLUMN LAYOUT -->
    <div class="container">
      <div class="ed-layout">

        <!-- LEFT: Details -->
        <div class="ed-main">

          ${event.image_url ? `
          <!-- Event Image -->
          <div class="ed-event-image">
            <img src="${escHtml(event.image_url)}" alt="${escHtml(event.title)}">
          </div>` : ''}

          <!-- Description -->
          <div class="ed-section">
            <h2 class="ed-section-title">About this event</h2>
            <div class="ed-description">${escHtml(event.description || 'Join us for a wonderful creative experience. All skill levels welcome!')}</div>
          </div>

          <!-- What's included -->
          <div class="ed-section">
            <h2 class="ed-section-title">${escHtml(siteSettings.included_title || "What's included")}</h2>
            <ul class="ed-included-list">
              ${getIncludedItems(event.capacity).map(item => `
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                ${escHtml(item)}
              </li>`).join('')}
            </ul>
          </div>

          <!-- Good to know -->
          <div class="ed-section">
            <h2 class="ed-section-title">Good to know</h2>
            <div class="ed-know-grid">
              <div class="ed-know-item">
                <div class="ed-know-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M10 2a6 6 0 1 0 0 12A6 6 0 0 0 10 2zM4 18a6 6 0 0 1 12 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <div>
                  <div class="ed-know-label">Skill level</div>
                  <div class="ed-know-value">All levels welcome</div>
                </div>
              </div>
              <div class="ed-know-item">
                <div class="ed-know-icon">
                  <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <div>
                  <div class="ed-know-label">Duration</div>
                  <div class="ed-know-value">${duration}</div>
                </div>
              </div>
              <div class="ed-know-item">
                <div class="ed-know-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </div>
                <div>
                  <div class="ed-know-label">Group size</div>
                  <div class="ed-know-value">Up to ${event.capacity} people</div>
                </div>
              </div>
              <div class="ed-know-item">
                <div class="ed-know-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M10 3l1.8 4.8H17l-4.2 3.1 1.6 4.8L10 13l-4.4 2.7 1.6-4.8L3 7.8h5.2L10 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </div>
                <div>
                  <div class="ed-know-label">Experience</div>
                  <div class="ed-know-value">No experience needed</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Location -->
          <div class="ed-section">
            <h2 class="ed-section-title">Location</h2>
            <div class="ed-location-card">
              <div class="ed-location-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              </div>
              <div class="ed-location-info">
                <div class="ed-location-name">${escHtml(event.location)}</div>
                <a class="ed-location-link"
                   href="https://maps.google.com/?q=${encodeURIComponent(event.location)}"
                   target="_blank" rel="noopener">
                  View on Google Maps →
                </a>
              </div>
            </div>
          </div>

        </div>

        <!-- RIGHT: Booking card -->
        <div class="ed-sidebar">
          <div class="ed-booking-card" id="booking-card">
            <div class="ed-booking-price">
              ${event.price_pence === 0
                ? '<span class="ed-price-free">Free</span>'
                : `<span class="ed-price-amount">${price}</span><span class="ed-price-label">per person</span>`}
            </div>

            <div class="ed-booking-details">
              <div class="ed-booking-detail-row">
                <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 4v2M13 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <span>${formatDate(event.date)}</span>
              </div>
              <div class="ed-booking-detail-row">
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <span>${event.time} &nbsp;·&nbsp; ${duration}</span>
              </div>
              <div class="ed-booking-detail-row">
                <svg viewBox="0 0 20 20" fill="none"><path d="M10 2C7.24 2 5 4.24 5 7c0 4.25 5 11 5 11s5-6.75 5-11c0-2.76-2.24-5-5-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>${escHtml(event.location)}</span>
              </div>
            </div>

            <div class="ed-availability" style="color:${spotsColor}">
              <svg viewBox="0 0 20 20" fill="none"><path d="M13 7a3 3 0 11-6 0 3 3 0 016 0zM4 17a8 8 0 0112 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              ${spotsText}
            </div>

            ${isSoldOut
              ? `<button class="btn btn-full" style="background:transparent;color:var(--rose);border:2px solid var(--rose);padding:15px;border-radius:var(--radius);font-weight:700;font-size:16px;cursor:pointer;" onclick="openWaitlist(${event.id}, '${event.title.replace(/'/g,"\\'")}')">Join Waitlist</button>`
              : `<button class="btn btn-primary btn-full ed-book-btn" onclick="openBooking()">Book Now →</button>`
            }

            <p class="ed-booking-note">No payment taken until the next step</p>
            <div class="ed-card-badges">
              <span class="card-badge visa"><svg viewBox="0 0 48 30" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="30" rx="4" fill="#1A1F71"/><text x="24" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" font-style="italic" fill="white" letter-spacing="1">VISA</text></svg></span>
              <span class="card-badge mastercard"><svg viewBox="0 0 48 30" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="30" rx="4" fill="#fff"/><circle cx="19" cy="13" r="7" fill="#EB001B"/><circle cx="29" cy="13" r="7" fill="#F79E1B"/><path d="M24 7a7 7 0 010 12A7 7 0 0124 7z" fill="#FF5F00"/><text x="24" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="6.5" font-weight="bold" fill="#333" letter-spacing="0.3">CREDIT</text></svg></span>
              <span class="card-badge mastercard-debit"><svg viewBox="0 0 48 30" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="30" rx="4" fill="#fff"/><circle cx="19" cy="13" r="7" fill="#EB001B"/><circle cx="29" cy="13" r="7" fill="#F79E1B"/><path d="M24 7a7 7 0 010 12A7 7 0 0124 7z" fill="#FF5F00"/><text x="24" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="6.5" font-weight="bold" fill="#333" letter-spacing="0.3">DEBIT</text></svg></span>
              <span class="card-badge amex"><svg viewBox="0 0 48 30" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="30" rx="4" fill="#2E77BC"/><text x="24" y="19" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white" letter-spacing="0.5">AMEX</text></svg></span>
            </div>
          </div>

          ${event.location ? `
          <div class="ed-map-card">
            <iframe
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              src="https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&output=embed&z=15"
              title="Event location map">
            </iframe>
            <div class="ed-map-card-footer">
              <span class="ed-map-card-address">${escHtml(event.location)}</span>
              <a class="ed-map-card-link"
                 href="https://maps.google.com/?q=${encodeURIComponent(event.location)}"
                 target="_blank" rel="noopener">Get directions →</a>
            </div>
          </div>` : ''}

          ${siteSettings.please_note_text ? `
          <div class="ed-please-note">
            <h3 class="ed-please-note-title">${escHtml(siteSettings.please_note_title || 'Please Note')}</h3>
            <p class="ed-please-note-text">${escHtml(siteSettings.please_note_text)}</p>
          </div>` : ''}
        </div>

      </div>
    </div>`;
}

function getIncludedItems(capacity) {
  let items = [];
  try { items = JSON.parse(siteSettings.included_items || '[]'); } catch {}
  if (!items.length) {
    items = [
      'All materials and tools provided',
      'Step-by-step instructor guidance',
      'Drinks included throughout the session',
      `Small group setting — max ${capacity} people`,
      'Take your finished creation home',
    ];
  }
  return items.map(item => item.replace('{capacity}', capacity));
}

function formatDuration(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

function showError(msg) {
  document.getElementById('event-detail-root').innerHTML = `
    <div class="container" style="padding:80px 0;text-align:center;">
      <h2 style="color:var(--text-dark);margin-bottom:12px;">Oops!</h2>
      <p style="color:var(--text-light);margin-bottom:24px;">${msg}</p>
      <a href="/events" class="btn btn-primary">Browse All Events</a>
    </div>`;
}

// ---- BOOKING FLOW ----
function openBooking() {
  if (!currentEvent) return;
  currentBookingState.event           = currentEvent;
  currentBookingState.quantity        = 1;
  currentBookingState.voucherCode     = null;
  currentBookingState.voucherDiscount = 0;
  currentBookingState.discountCode    = null;
  currentBookingState.discountPence   = 0;
  showBookingStep1();
  openModal('booking-modal');
}

function showBookingStep1() {
  const event = currentBookingState.event;
  const price = event.price_pence === 0 ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;

  document.getElementById('booking-modal-body').innerHTML = `
    <div class="booking-header">
      <h2>${escHtml(event.title)}</h2>
      <p>${formatDate(event.date)} at ${event.time}</p>
    </div>
    <div class="booking-body">
      <div class="booking-steps">
        <div class="booking-step active"></div>
        <div class="booking-step"></div>
        <div class="booking-step"></div>
      </div>
      <div class="form-section">
        <h3>Your Details</h3>
        <div class="form-group">
          <label>First &amp; Last Name *</label>
          <input type="text" id="b-name" placeholder="Jane Smith" value="${escHtml(currentBookingState.name || '')}">
        </div>
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="b-email" placeholder="jane@example.com" value="${escHtml(currentBookingState.email || '')}">
        </div>
        <div class="form-group">
          <label>Phone Number *</label>
          <input type="tel" id="b-phone" placeholder="+44 7700 900000" value="${escHtml(currentBookingState.phone || '')}">
        </div>
      </div>
      <div class="form-section">
        <h3>Number of Tickets</h3>
        <div style="display:flex;align-items:center;gap:16px;">
          <div class="quantity-selector">
            <button class="qty-btn" onclick="changeQty(-1)">−</button>
            <div class="qty-display" id="qty-display">1</div>
            <button class="qty-btn" onclick="changeQty(1)">+</button>
          </div>
          <span style="font-size:14px;color:var(--text-light);">${price} per person · ${event.spots_remaining} available</span>
        </div>
        <div class="form-group" style="margin-top:14px;">
          <label>Special requirements (optional)</label>
          <textarea id="b-notes" rows="2" placeholder="Dietary requirements, accessibility needs, etc.">${escHtml(currentBookingState.notes || '')}</textarea>
        </div>
        <div class="form-group" style="margin-top:14px;">
          <label style="font-weight:700;font-size:15px;">Are you booking as part of a group?</label>
          <p style="font-size:13px;color:var(--text-light);margin:4px 0 8px;">Let us know who you're booking with so we can ensure you're sat together. Or are there any other details about your booking you'd like to tell us?</p>
          <textarea id="b-group-note" rows="3" placeholder="e.g. We're a group of 6 — we've also got Sarah, Tom and Priya booking separately.">${escHtml(currentBookingState.groupNote || '')}</textarea>
        </div>
        <div class="voucher-apply-section">
          <button type="button" class="voucher-toggle" onclick="toggleDiscountInput()">🏷️ Have a discount code?</button>
          <div id="discount-input-wrap" style="display:none">
            <div style="display:flex;gap:8px;margin-top:8px">
              <input type="text" id="b-discount-code" placeholder="e.g. SUMMER20" style="flex:1;text-transform:uppercase" value="${escHtml(currentBookingState.discountCode || '')}">
              <button type="button" class="btn btn-outline" onclick="applyDiscountCode()">Apply</button>
            </div>
            <div id="discount-status" style="font-size:13px;margin-top:6px"></div>
          </div>
        </div>
        <div class="voucher-apply-section" style="margin-top:6px">
          <button type="button" class="voucher-toggle" onclick="toggleVoucherInput()">🎁 Have a gift voucher?</button>
          <div id="voucher-input-wrap" style="display:none">
            <div style="display:flex;gap:8px;margin-top:8px">
              <input type="text" id="b-voucher-code" placeholder="e.g. PB-XXXX-XXXX" style="flex:1;text-transform:uppercase" value="${escHtml(currentBookingState.voucherCode || '')}">
              <button type="button" class="btn btn-outline" onclick="applyVoucher()">Apply</button>
            </div>
            <div id="voucher-status" style="font-size:13px;margin-top:6px"></div>
          </div>
        </div>
      </div>
      <div class="booking-summary" id="booking-summary">${renderBookingSummary(event, 1)}</div>
      <button class="btn btn-primary btn-full" onclick="proceedToPayment()">
        ${event.price_pence === 0 ? 'Confirm Booking →' : 'Continue to Payment →'}
      </button>
    </div>`;

  currentBookingState.quantity = 1;
  updateQtyDisplay();
}

function changeQty(delta) {
  const max = currentBookingState.event.spots_remaining;
  currentBookingState.quantity = Math.min(max, Math.max(1, (currentBookingState.quantity || 1) + delta));
  updateQtyDisplay();
}

function updateQtyDisplay() {
  const qtyEl = document.getElementById('qty-display');
  if (qtyEl) qtyEl.textContent = currentBookingState.quantity;
  const sumEl = document.getElementById('booking-summary');
  if (sumEl) sumEl.innerHTML = renderBookingSummary(currentBookingState.event, currentBookingState.quantity);
}

function renderBookingSummary(event, qty) {
  const subtotal = event.price_pence * qty;
  if (event.price_pence === 0) {
    return `<div class="summary-row"><span>${qty}x ticket</span><span style="color:var(--green);font-weight:700;">Free</span></div>`;
  }
  const voucherDiscount = currentBookingState.voucherDiscount || 0;
  const discountPence   = currentBookingState.discountPence || 0;
  const discount = voucherDiscount + discountPence;
  const total = Math.max(0, subtotal - discount);
  let html = `<div class="summary-row"><span>${qty}x ticket${qty > 1 ? 's' : ''}</span><span>£${(event.price_pence / 100).toFixed(2)} each</span></div>`;
  if (discountPence > 0) {
    html += `<div class="summary-row" style="color:var(--green)"><span>🏷️ Discount (${escHtml(currentBookingState.discountCode)})</span><span>−£${(discountPence / 100).toFixed(2)}</span></div>`;
  }
  if (voucherDiscount > 0) {
    html += `<div class="summary-row" style="color:var(--green)"><span>🎁 Gift Voucher (${escHtml(currentBookingState.voucherCode)})</span><span>−£${(voucherDiscount / 100).toFixed(2)}</span></div>`;
  }
  if (total === 0) {
    html += `<div class="summary-row total"><span>Total</span><span style="color:var(--green);">Free (voucher applied)</span></div>`;
  } else {
    html += `<div class="summary-row total"><span>Total</span><span>£${(total / 100).toFixed(2)}</span></div>`;
  }
  return html;
}

async function proceedToPayment() {
  const name      = document.getElementById('b-name').value.trim();
  const email     = document.getElementById('b-email').value.trim();
  const phone     = document.getElementById('b-phone').value.trim();
  const notes     = document.getElementById('b-notes').value.trim();
  const groupNote = document.getElementById('b-group-note').value.trim();

  if (!name || !email || !phone) { highlightError(!name ? 'b-name' : !email ? 'b-email' : 'b-phone'); return; }
  if (!isValidEmail(email)) { highlightError('b-email'); return; }

  Object.assign(currentBookingState, { name, email, phone, notes, groupNote });

  if (currentBookingState.event.price_pence === 0) { await confirmFreeBooking(); return; }

  const subtotal = currentBookingState.event.price_pence * currentBookingState.quantity;
  const discount = (currentBookingState.voucherDiscount || 0) + (currentBookingState.discountPence || 0);
  const total = Math.max(0, subtotal - discount);

  if (total === 0 && (currentBookingState.voucherCode || currentBookingState.discountCode)) {
    // Fully covered by voucher/discount
    await confirmVoucherCoveredBooking();
    return;
  }

  setLoadingBtn(true, 'Creating booking…');
  try {
    const data = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ event_id: currentBookingState.event.id, name, email, phone, notes, group_note: groupNote, quantity: currentBookingState.quantity })
    });
    currentBookingState.booking  = data.booking;
    currentBookingState.customer = data.customer;
    showPaymentStep();
  } catch (err) {
    alert(err.message || 'Failed to create booking. Please try again.');
  }
  setLoadingBtn(false);
}

async function confirmFreeBooking() {
  setLoadingBtn(true, 'Confirming…');
  try {
    const { event, name, email, phone, notes, groupNote, quantity } = currentBookingState;
    const data = await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify({ event_id: event.id, name, email, phone, notes, group_note: groupNote, quantity }) });
    await apiFetch(`/api/bookings/${data.booking.id}/confirm`, { method: 'POST', body: JSON.stringify({ payment_reference: null }) });
    currentBookingState.booking = data.booking;
    closeModal('booking-modal');
    showConfirmation(data.booking, data.customer, event);
  } catch (err) {
    alert(err.message || 'Booking failed. Please try again.');
  }
  setLoadingBtn(false);
}

async function confirmVoucherCoveredBooking() {
  setLoadingBtn(true, 'Confirming…');
  try {
    const { event, name, email, phone, notes, groupNote, quantity, voucherCode } = currentBookingState;
    const data = await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify({ event_id: event.id, name, email, phone, notes, group_note: groupNote, quantity }) });
    await apiFetch(`/api/bookings/${data.booking.id}/confirm`, { method: 'POST', body: JSON.stringify({ payment_reference: 'voucher:' + voucherCode }) });
    currentBookingState.booking = data.booking;
    // Redeem voucher (non-blocking)
    fetch('/api/vouchers/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: voucherCode, booking_id: data.booking.id })
    }).catch(console.error);
    closeModal('booking-modal');
    showConfirmation(data.booking, data.customer, event);
  } catch (err) {
    alert(err.message || 'Booking failed. Please try again.');
  }
  setLoadingBtn(false);
}

// ---- DISCOUNT CODE INPUT ----
function toggleDiscountInput() {
  const wrap = document.getElementById('discount-input-wrap');
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
}

async function applyDiscountCode() {
  const input = document.getElementById('b-discount-code');
  const statusEl = document.getElementById('discount-status');
  if (!input || !statusEl) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    statusEl.textContent = 'Please enter a discount code.';
    statusEl.style.color = 'var(--coral)';
    return;
  }

  statusEl.textContent = 'Checking…';
  statusEl.style.color = 'var(--text-light)';

  try {
    const subtotal = currentBookingState.event.price_pence * currentBookingState.quantity;
    const res = await fetch(`/api/discounts/validate?code=${encodeURIComponent(code)}&order_pence=${subtotal}`);
    const data = await res.json();

    if (data.valid) {
      currentBookingState.discountCode  = code;
      currentBookingState.discountPence = data.discount_pence;
      statusEl.textContent = data.message;
      statusEl.style.color = 'var(--green)';
      const sumEl = document.getElementById('booking-summary');
      if (sumEl) sumEl.innerHTML = renderBookingSummary(currentBookingState.event, currentBookingState.quantity);
    } else {
      currentBookingState.discountCode  = null;
      currentBookingState.discountPence = 0;
      statusEl.textContent = '✗ ' + (data.message || 'Invalid discount code.');
      statusEl.style.color = 'var(--coral)';
    }
  } catch {
    statusEl.textContent = 'Could not validate code. Please try again.';
    statusEl.style.color = 'var(--coral)';
  }
}

// ---- VOUCHER INPUT ----
function toggleVoucherInput() {
  const wrap = document.getElementById('voucher-input-wrap');
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
}

async function applyVoucher() {
  const input = document.getElementById('b-voucher-code');
  const statusEl = document.getElementById('voucher-status');
  if (!input || !statusEl) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    statusEl.textContent = 'Please enter a voucher code.';
    statusEl.style.color = 'var(--coral)';
    return;
  }

  statusEl.textContent = 'Checking…';
  statusEl.style.color = 'var(--text-light)';

  try {
    const res = await fetch(`/api/vouchers/validate?code=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (data.valid) {
      currentBookingState.voucherCode = code;
      currentBookingState.voucherDiscount = data.amount_pence;
      statusEl.textContent = '✓ ' + data.message;
      statusEl.style.color = 'var(--green)';
      // Refresh summary
      const sumEl = document.getElementById('booking-summary');
      if (sumEl) sumEl.innerHTML = renderBookingSummary(currentBookingState.event, currentBookingState.quantity);
    } else {
      currentBookingState.voucherCode = null;
      currentBookingState.voucherDiscount = 0;
      statusEl.textContent = '✗ ' + (data.message || 'Invalid voucher code.');
      statusEl.style.color = 'var(--coral)';
    }
  } catch {
    statusEl.textContent = 'Could not validate voucher. Please try again.';
    statusEl.style.color = 'var(--coral)';
  }
}

function showPaymentStep() {
  const event = currentBookingState.event;
  const subtotal = event.price_pence * currentBookingState.quantity;
  const discount = (currentBookingState.voucherDiscount || 0) + (currentBookingState.discountPence || 0);
  const total = (Math.max(0, subtotal - discount) / 100).toFixed(2);
  const bothEnabled = paymentConfig.stripe_enabled && paymentConfig.sumup_enabled;

  // If both providers are active, show a method picker first
  const methodPicker = bothEnabled ? `
    <div class="form-section" id="payment-method-picker">
      <h3>Choose how to pay</h3>
      <div class="payment-method-options">
        <button class="payment-method-btn active" id="pm-stripe" onclick="selectPaymentMethod('stripe')">
          <svg viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg" height="22"><path d="M5 20C5 11.716 11.716 5 20 5h20c8.284 0 15 6.716 15 15v0c0 8.284-6.716 15-15 15H20C11.716 35 5 28.284 5 20v0z" fill="#635BFF"/><path d="M24.576 16.128c0-.768.633-1.063 1.68-1.063 1.502 0 3.403.455 4.905 1.267v-4.642C29.603 11.266 28.05 11 26.496 11c-3.985 0-6.624 2.082-6.624 5.562 0 5.422 7.466 4.556 7.466 6.895 0 .91-.789 1.204-1.892 1.204-1.64 0-3.74-.672-5.398-1.583v4.7C21.51 28.603 23.292 29 25.075 29c4.08 0 6.888-2.024 6.888-5.56 0-5.854-7.387-4.819-7.387-7.312z" fill="#fff"/></svg>
          Card (Stripe)
        </button>
        <button class="payment-method-btn" id="pm-sumup" onclick="selectPaymentMethod('sumup')">
          <svg viewBox="0 0 80 30" fill="none" xmlns="http://www.w3.org/2000/svg" height="22"><rect width="80" height="30" rx="6" fill="#00D66B"/><text x="8" y="21" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="white">SumUp</text></svg>
          Card (SumUp)
        </button>
      </div>
    </div>` : '';

  document.getElementById('booking-modal-body').innerHTML = `
    <div class="booking-header">
      <h2>Payment</h2>
      <p>${escHtml(event.title)} · ${currentBookingState.quantity} ticket${currentBookingState.quantity > 1 ? 's' : ''}</p>
    </div>
    <div class="booking-body">
      <div class="booking-steps">
        <div class="booking-step done"></div>
        <div class="booking-step active"></div>
        <div class="booking-step"></div>
      </div>
      <div class="booking-summary" style="margin-bottom:20px;">${renderBookingSummary(event, currentBookingState.quantity)}</div>
      ${methodPicker}
      <div class="form-section">
        <div id="payment-element"></div>
        <div id="payment-message" class="hidden"></div>
      </div>
      <button class="btn btn-primary btn-full" id="pay-btn" onclick="submitPayment()">Pay £${total}</button>
      <button class="btn btn-ghost btn-full" style="margin-top:8px;" onclick="showBookingStep1()">← Back</button>
    </div>`;

  // Default: mount whichever provider is enabled (Stripe takes priority if both)
  currentBookingState.activeProvider = paymentConfig.stripe_enabled ? 'stripe' : 'sumup';
  mountActivePaymentProvider();
}

function syncPayBtn() {
  const btn = document.getElementById('pay-btn');
  if (btn) btn.style.display = currentBookingState.activeProvider === 'sumup' ? 'none' : '';
}

function selectPaymentMethod(provider) {
  currentBookingState.activeProvider = provider;
  document.getElementById('pm-stripe').classList.toggle('active', provider === 'stripe');
  document.getElementById('pm-sumup').classList.toggle('active', provider === 'sumup');
  document.getElementById('payment-element').innerHTML = '';
  currentBookingState.stripeElements = null;
  syncPayBtn();
  mountActivePaymentProvider();
}

async function mountActivePaymentProvider() {
  const provider = currentBookingState.activeProvider;
  syncPayBtn();
  if (provider === 'stripe') {
    await mountStripeElements();
  } else {
    await mountSumUpCheckout();
  }
}

async function mountStripeElements() {
  const el = document.getElementById('payment-element');
  if (!stripe) {
    el.innerHTML = '<p style="color:var(--coral);font-size:14px;">Stripe is not configured. Please contact us to book.</p>';
    return;
  }
  // Create Stripe payment intent if not already done
  if (!currentBookingState.clientSecret) {
    try {
      const intentPayload = { booking_id: currentBookingState.booking.id };
      if (currentBookingState.voucherCode)  intentPayload.voucher_code   = currentBookingState.voucherCode;
      if (currentBookingState.discountCode) intentPayload.discount_code  = currentBookingState.discountCode;
      const intentData = await apiFetch('/api/payments/create-intent', {
        method: 'POST',
        body: JSON.stringify(intentPayload)
      });
      currentBookingState.clientSecret    = intentData.clientSecret;
      currentBookingState.paymentIntentId = intentData.paymentIntentId;
    } catch (err) {
      el.innerHTML = `<p style="color:var(--coral);font-size:14px;">${escHtml(err.message || 'Could not initialise payment. Please try again.')}</p>`;
      return;
    }
  }
  const elements = stripe.elements({ clientSecret: currentBookingState.clientSecret, appearance: {
    theme: 'stripe',
    variables: { colorPrimary: '#C4748A', borderRadius: '10px', fontFamily: 'Nunito, sans-serif' }
  }});
  elements.create('payment').mount('#payment-element');
  currentBookingState.stripeElements = elements;
}

async function mountSumUpCheckout() {
  const el = document.getElementById('payment-element');
  el.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div></div>';
  try {
    const sumupPayload = { booking_id: currentBookingState.booking.id };
    if (currentBookingState.voucherCode)  sumupPayload.voucher_code  = currentBookingState.voucherCode;
    if (currentBookingState.discountCode) sumupPayload.discount_code = currentBookingState.discountCode;
    const data = await apiFetch('/api/payments/sumup-checkout', {
      method: 'POST',
      body: JSON.stringify(sumupPayload)
    });
    currentBookingState.sumupCheckoutId = data.checkoutId;
    el.innerHTML = '<div id="sumup-card"></div><div id="payment-message" class="hidden"></div>';

    // Load SumUp SDK dynamically
    if (!window.SumUpCard) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    SumUpCard.mount({
      id: 'sumup-card',
      checkoutId: currentBookingState.sumupCheckoutId,
      onResponse: async (type, body) => {
        if (type === 'success') {
          try {
            await apiFetch('/api/payments/sumup-confirm', {
              method: 'POST',
              body: JSON.stringify({ checkout_id: currentBookingState.sumupCheckoutId, booking_id: currentBookingState.booking.id })
            });
            // Redeem voucher if one was applied (non-blocking)
            if (currentBookingState.voucherCode) {
              fetch('/api/vouchers/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: currentBookingState.voucherCode, booking_id: currentBookingState.booking.id })
              }).catch(console.error);
            }
            closeModal('booking-modal');
            showConfirmation(currentBookingState.booking, currentBookingState.customer, currentBookingState.event);
          } catch {
            alert('Payment taken but confirmation failed. Please contact us with your booking reference.');
          }
        } else if (type === 'error') {
          const msgEl = document.getElementById('payment-message');
          if (msgEl) { msgEl.textContent = body?.message || 'Payment failed. Please try again.'; msgEl.classList.remove('hidden'); }
        }
      }
    });
  } catch (err) {
    el.innerHTML = `<p style="color:var(--coral);font-size:14px;">${escHtml(err.message || 'Could not initialise SumUp payment.')}</p>`;
  }
}

async function submitPayment() {
  const provider = currentBookingState.activeProvider;

  // SumUp handles its own submission via the SDK widget — this button is Stripe only
  if (provider === 'sumup') return;

  const elements = currentBookingState.stripeElements;
  if (!stripe || !elements) return;

  document.getElementById('pay-btn').disabled = true;
  document.getElementById('pay-btn').textContent = 'Processing…';

  const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });

  if (error) {
    const msgEl = document.getElementById('payment-message');
    msgEl.textContent = error.message;
    msgEl.classList.remove('hidden');
    document.getElementById('pay-btn').disabled = false;
    const subtotal = currentBookingState.event.price_pence * currentBookingState.quantity;
    const disc = (currentBookingState.discountPence || 0) + (currentBookingState.voucherDiscount || 0);
    document.getElementById('pay-btn').textContent = `Pay £${(Math.max(0, subtotal - disc) / 100).toFixed(2)}`;
    return;
  }

  try {
    await apiFetch(`/api/bookings/${currentBookingState.booking.id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ payment_reference: paymentIntent.id })
    });
    // Redeem voucher if one was applied (non-blocking)
    if (currentBookingState.voucherCode) {
      fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentBookingState.voucherCode, booking_id: currentBookingState.booking.id })
      }).catch(console.error);
    }
    closeModal('booking-modal');
    showConfirmation(currentBookingState.booking, currentBookingState.customer, currentBookingState.event);
  } catch {
    alert('Payment taken but confirmation failed. Please contact us with your booking reference.');
  }
}

function showConfirmation(booking, customer, event) {
  const discountPence   = currentBookingState.discountPence   || 0;
  const voucherDiscount = currentBookingState.voucherDiscount || 0;
  const charged = Math.max(0, booking.total_pence - discountPence - voucherDiscount);
  const total = event.price_pence === 0 ? 'Free' : charged === 0 ? 'Free (fully discounted)' : `£${(charged / 100).toFixed(2)}`;
  const ref   = `#PB${String(booking.id).padStart(5, '0')}`;

  document.getElementById('confirm-modal-body').innerHTML = `
    <div class="confirmation-body">
      <h2 class="confirm-title">You're all booked!</h2>
      <p class="confirm-subtitle">A confirmation email has been sent to<br><strong>${escHtml(booking.customer_email || customer?.email || '')}</strong></p>
      <div class="booking-ref">${ref}</div>
      <div class="confirm-details">
        <div class="confirm-detail-row"><span>Event</span><span>${escHtml(event.title)}</span></div>
        <div class="confirm-detail-row"><span>Date</span><span>${formatDate(event.date)} at ${event.time}</span></div>
        <div class="confirm-detail-row"><span>Location</span><span>${escHtml(event.location)}</span></div>
        <div class="confirm-detail-row"><span>Tickets</span><span>${booking.quantity}</span></div>
        <div class="confirm-detail-row"><span>Total Paid</span><span style="color:var(--green);font-weight:700;">${total}</span></div>
      </div>
      <a href="/events" class="btn btn-primary">Browse More Events</a>
    </div>`;

  openModal('confirm-modal');
}

// ---- WAITLIST ----
function openWaitlist(eventId, eventTitle) {
  const modal = document.getElementById('waitlist-modal');
  if (!modal) return;
  modal.querySelector('.waitlist-event-name').textContent = eventTitle;
  modal.dataset.eventId = eventId;
  modal.querySelector('#wl-name').value = '';
  modal.querySelector('#wl-email').value = '';
  modal.querySelector('#wl-phone').value = '';
  modal.querySelector('#wl-status').textContent = '';
  openModal('waitlist-modal');
}

async function submitWaitlist() {
  const modal = document.getElementById('waitlist-modal');
  const eventId = modal.dataset.eventId;
  const name  = modal.querySelector('#wl-name').value.trim();
  const email = modal.querySelector('#wl-email').value.trim();
  const phone = modal.querySelector('#wl-phone').value.trim();
  const status = modal.querySelector('#wl-status');
  const btn = modal.querySelector('#wl-submit-btn');
  if (!name || !email) { status.textContent = 'Please enter your name and email.'; status.style.color = 'var(--coral)'; return; }
  btn.disabled = true; btn.textContent = 'Joining…'; status.textContent = '';
  try {
    await apiFetch('/api/waitlist', { method: 'POST', body: JSON.stringify({ event_id: parseInt(eventId), name, email, phone }) });
    modal.querySelector('.waitlist-form').innerHTML = `<div style="text-align:center;padding:24px 0"><div style="font-size:48px;margin-bottom:12px;">🎉</div><p style="font-size:17px;font-weight:800;color:var(--text-dark);margin-bottom:8px;">You're on the waitlist!</p><p style="font-size:14px;color:var(--text-light);line-height:1.6;">We'll email you immediately if a spot opens up.</p><button class="btn btn-primary" style="margin-top:20px;padding:12px 28px;font-size:14px;" onclick="closeModal('waitlist-modal')">Close</button></div>`;
  } catch (err) {
    status.textContent = err.message || 'Something went wrong. Please try again.';
    status.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = 'Join Waitlist';
  }
}

// ---- MODALS ----
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    document.body.style.overflow = ''; }
function closeBookingModal(e) { if (e.target.id === 'booking-modal') closeModal('booking-modal'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') ['booking-modal','confirm-modal'].forEach(closeModal);
});

// ---- HELPERS ----
async function apiFetch(url, opts = {}) {
  const res  = await fetch(url, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function highlightError(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderColor = 'var(--coral)';
  el.focus();
  el.addEventListener('input', () => el.style.borderColor = '', { once: true });
}

function setLoadingBtn(loading, text) {
  const btn = document.querySelector('.booking-body .btn-primary');
  if (!btn) return;
  btn.disabled = loading;
  if (text && loading) btn.textContent = text;
}
