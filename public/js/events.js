/* =============================================
   PAINT & BUBBLES — EVENTS PAGE
   Full event listing with search, filter, calendar
   ============================================= */

let stripe = null;
let currentBookingState = {};
let calendarInstance = null;
let searchTimer = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
  await Promise.all([loadCategories(), loadEvents()]);
  fetchStripePK();
});

// ---- APPLY DESIGN SETTINGS ----
async function applyDesignSettings() {
  try {
    const res = await fetch('/api/design/settings');
    if (!res.ok) return;
    const s = await res.json();

    // CSS variable overrides
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
    if (s.color_bg_footer)  vars.push(`--bg-footer: ${s.color_bg_footer}`);
    if (vars.length) {
      const st = document.createElement('style');
      st.id = 'design-vars';
      st.textContent = `:root { ${vars.join('; ')} }`;
      document.head.appendChild(st);
    }

    // Logo
    if (s.logo_url) {
      document.querySelectorAll('.logo-img').forEach(img => {
        img.src = s.logo_url;
        img.style.display = '';
      });
      const fb = document.getElementById('logo-fallback');
      if (fb) fb.style.display = 'none';
    }

    // Hero background image (events page hero)
    if (s.hero_image_url) {
      const hero = document.querySelector('.events-page-hero');
      if (hero) {
        hero.style.background = `linear-gradient(135deg, rgba(44,15,24,0.82) 0%, rgba(107,45,66,0.72) 45%, rgba(196,116,138,0.55) 100%), url(${s.hero_image_url}) center/cover no-repeat`;
      }
    }

    // Footer tagline
    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }

    // Fonts
    applyFontSettings(s);

    // Social section
    renderSocialSection(s);
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

async function fetchStripePK() {
  try {
    const res = await fetch('/api/payments/config');
    if (res.ok) {
      const { publishableKey } = await res.json();
      if (publishableKey) stripe = Stripe(publishableKey);
    }
  } catch {}
}

// ---- CATEGORIES ----
async function loadCategories() {
  try {
    const events = await apiFetch('/api/events');
    const cats = [...new Set(events.map(e => e.category).filter(Boolean))].sort();
    const sel = document.getElementById('category-filter');
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
  } catch {}
}

// ---- LOAD EVENTS ----
async function loadEvents() {
  const grid = document.getElementById('events-grid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading events…</p></div>';

  const search   = document.getElementById('search-input')?.value.trim() || '';
  const category = document.getElementById('category-filter')?.value || '';
  const dateFrom = document.getElementById('date-from')?.value || '';

  const params = new URLSearchParams();
  if (search)   params.set('search', search);
  if (category) params.set('category', category);
  if (dateFrom) params.set('from', dateFrom);

  try {
    const events = await apiFetch('/api/events?' + params.toString());
    const label  = document.getElementById('events-count-label');

    if (events.length === 0) {
      if (label) label.textContent = 'No events found';
      grid.innerHTML = `<div class="empty-state"><h3>No events found</h3><p>Try adjusting your search or filters.</p></div>`;
      return;
    }

    if (label) label.textContent = `${events.length} Event${events.length !== 1 ? 's' : ''}`;
    grid.innerHTML = events.map(renderEventCard).join('');
  } catch {
    grid.innerHTML = `<div class="empty-state"><h3>Failed to load events</h3><p>Please try refreshing the page.</p></div>`;
  }
}

// ---- DEBOUNCED SEARCH ----
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadEvents, 350);
}

// ---- VIEW TOGGLE ----
function showView(view) {
  const eventsSection  = document.getElementById('view-events');
  const calSection     = document.getElementById('view-calendar');
  const btnEvents      = document.getElementById('nav-events');
  const btnCalendar    = document.getElementById('nav-calendar');

  if (view === 'events') {
    eventsSection.classList.remove('hidden');
    calSection.classList.add('hidden');
    btnEvents.classList.add('active');
    btnCalendar.classList.remove('active');
  } else {
    eventsSection.classList.add('hidden');
    calSection.classList.remove('hidden');
    btnEvents.classList.remove('active');
    btnCalendar.classList.add('active');
    if (!calendarInstance) initCalendar();
  }
}

// ---- FULLCALENDAR ----
async function initCalendar() {
  let allEvents = [];
  try { allEvents = await apiFetch('/api/events'); } catch {}

  const calEvents = allEvents.map(e => ({
    id:    e.id,
    title: e.title,
    start: e.date,
    backgroundColor: e.spots_remaining <= 0 ? '#9E8E96' : '#C4748A',
    borderColor:     e.spots_remaining <= 0 ? '#9E8E96' : '#A85D72',
    extendedProps: e
  }));

  calendarInstance = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView:   'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
    events: calEvents,
    eventClick(info) {
      openEvent(info.event.id);
    },
    height: 'auto'
  });

  calendarInstance.render();
}

// ---- RENDER EVENT CARD ----
function renderEventCard(event) {
  const price = event.price_pence === 0
    ? '<span class="event-price event-price-free">Free</span>'
    : `<span class="event-price">£${(event.price_pence / 100).toFixed(2)}</span>`;
  const spotsLeft = event.spots_remaining;
  const isSoldOut = spotsLeft <= 0;
  const isLow     = spotsLeft > 0 && spotsLeft <= 3;

  const spotsHtml = isSoldOut
    ? '<span class="event-spots" style="color:var(--coral);font-weight:700;">Sold out</span>'
    : isLow
    ? `<span class="event-spots low">${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left!</span>`
    : `<span class="event-spots">${spotsLeft} spots left</span>`;

  const imageHtml = event.image_url
    ? `<img src="${escHtml(event.image_url)}" alt="${escHtml(event.title)}">`
    : '';

  return `
    <div class="event-card" onclick="window.location.href='/events/${event.id}'" style="cursor:pointer">
      <div class="event-card-image">
        ${imageHtml}
        <span class="event-card-category">${escHtml(event.category)}</span>
        ${isSoldOut ? '<div class="event-card-sold-out">Sold Out</div>' : ''}
      </div>
      <div class="event-card-body">
        <h3 class="event-card-title">${escHtml(event.title)}</h3>
        <div class="event-card-meta">
          <div class="event-meta-item">${formatDate(event.date)} at ${event.time}</div>
          <div class="event-meta-item">${escHtml(event.location)}</div>
        </div>
        <div class="event-card-footer">
          ${price}
          ${spotsHtml}
        </div>
      </div>
    </div>`;
}

// ---- OPEN EVENT DETAIL ----
async function openEvent(id) {
  try {
    const event = await apiFetch(`/api/events/${id}`);
    showEventModal(event);
  } catch {
    alert('Failed to load event details.');
  }
}

function showEventModal(event) {
  const spotsLeft = event.spots_remaining;
  const isSoldOut = spotsLeft <= 0;
  const price = event.price_pence === 0 ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const duration = event.duration_minutes >= 60
    ? `${Math.floor(event.duration_minutes / 60)}h${event.duration_minutes % 60 ? ' ' + (event.duration_minutes % 60) + 'm' : ''}`
    : `${event.duration_minutes}m`;

  const imageHtml = event.image_url
    ? `<img src="${escHtml(event.image_url)}" alt="${escHtml(event.title)}">`
    : '';

  document.getElementById('event-modal-body').innerHTML = `
    <div class="event-detail-image">${imageHtml}</div>
    <div class="event-detail-body">
      <span class="event-detail-category">${escHtml(event.category)}</span>
      <h2 class="event-detail-title">${escHtml(event.title)}</h2>
      <div class="event-detail-meta">
        <div class="detail-meta-item"><div><div class="detail-meta-label">Date</div><div class="detail-meta-value">${formatDate(event.date)}</div></div></div>
        <div class="detail-meta-item"><div><div class="detail-meta-label">Time</div><div class="detail-meta-value">${event.time} (${duration})</div></div></div>
        <div class="detail-meta-item"><div><div class="detail-meta-label">Location</div><div class="detail-meta-value">${escHtml(event.location)}</div></div></div>
        <div class="detail-meta-item"><div><div class="detail-meta-label">Availability</div>
          <div class="detail-meta-value" style="color:${isSoldOut ? 'var(--coral)' : spotsLeft <= 3 ? 'var(--amber)' : 'var(--green)'}">
            ${isSoldOut ? 'Sold out' : `${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left`}
          </div></div></div>
      </div>
      <p class="event-detail-desc">${escHtml(event.description || '')}</p>
      <div class="event-detail-footer">
        <div>
          <div style="font-size:12px;color:var(--text-light);margin-bottom:2px;">Price per person</div>
          <div style="font-size:28px;font-weight:900;color:var(--rose-deep)">${price}</div>
        </div>
        <button class="btn btn-primary" ${isSoldOut ? 'disabled' : ''} onclick="openBooking(${event.id})">
          ${isSoldOut ? 'Sold Out' : 'Book Now →'}
        </button>
      </div>
    </div>`;

  openModal('event-modal');
  currentBookingState.event = event;
}

// ---- BOOKING FLOW ----
async function openBooking(eventId) {
  closeModal('event-modal');
  const event = currentBookingState.event || await apiFetch(`/api/events/${eventId}`);
  currentBookingState.event    = event;
  currentBookingState.quantity = 1;
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
          <label>Phone (optional)</label>
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
  return `
    <div class="summary-row"><span>${qty}x ticket${qty > 1 ? 's' : ''}</span><span>£${(event.price_pence / 100).toFixed(2)} each</span></div>
    <div class="summary-row total"><span>Total</span><span>£${(subtotal / 100).toFixed(2)}</span></div>`;
}

async function proceedToPayment() {
  const name  = document.getElementById('b-name').value.trim();
  const email = document.getElementById('b-email').value.trim();
  const phone = document.getElementById('b-phone').value.trim();
  const notes = document.getElementById('b-notes').value.trim();

  if (!name || !email) { highlightError(!name ? 'b-name' : 'b-email'); return; }
  if (!isValidEmail(email)) { highlightError('b-email'); return; }

  Object.assign(currentBookingState, { name, email, phone, notes });

  if (currentBookingState.event.price_pence === 0) { await confirmFreeBooking(); return; }

  setLoadingBtn(true, 'Creating booking…');
  try {
    const data = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ event_id: currentBookingState.event.id, name, email, phone, notes, quantity: currentBookingState.quantity })
    });
    currentBookingState.booking  = data.booking;
    currentBookingState.customer = data.customer;

    const intentData = await apiFetch('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify({ booking_id: data.booking.id })
    });
    currentBookingState.clientSecret    = intentData.clientSecret;
    currentBookingState.paymentIntentId = intentData.paymentIntentId;
    showPaymentStep();
  } catch (err) {
    alert(err.message || 'Failed to create booking. Please try again.');
  }
  setLoadingBtn(false);
}

async function confirmFreeBooking() {
  setLoadingBtn(true, 'Confirming…');
  try {
    const { event, name, email, phone, notes, quantity } = currentBookingState;
    const data = await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify({ event_id: event.id, name, email, phone, notes, quantity }) });
    await apiFetch(`/api/bookings/${data.booking.id}/confirm`, { method: 'POST', body: JSON.stringify({ stripe_payment_intent_id: null }) });
    currentBookingState.booking = data.booking;
    closeModal('booking-modal');
    showConfirmation(data.booking, data.customer, event);
  } catch (err) {
    alert(err.message || 'Booking failed. Please try again.');
  }
  setLoadingBtn(false);
}

function showPaymentStep() {
  const event = currentBookingState.event;
  const total = (event.price_pence * currentBookingState.quantity / 100).toFixed(2);

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
      <div class="form-section">
        <h3>Card Details</h3>
        <div id="payment-element"></div>
        <div id="payment-message" class="hidden"></div>
      </div>
      <button class="btn btn-primary btn-full" id="pay-btn" onclick="submitPayment()">Pay £${total}</button>
      <button class="btn btn-ghost btn-full" style="margin-top:8px;" onclick="showBookingStep1()">← Back</button>
    </div>`;

  mountStripeElements();
}

function mountStripeElements() {
  if (!stripe || !currentBookingState.clientSecret) {
    document.getElementById('payment-element').innerHTML = '<p style="color:var(--coral);font-size:14px;">Payment system unavailable. Please add your Stripe keys.</p>';
    return;
  }
  const elements = stripe.elements({ clientSecret: currentBookingState.clientSecret, appearance: {
    theme: 'stripe',
    variables: { colorPrimary: '#C4748A', borderRadius: '10px', fontFamily: 'Nunito, sans-serif' }
  }});
  const paymentEl = elements.create('payment');
  paymentEl.mount('#payment-element');
  currentBookingState.stripeElements = elements;
}

async function submitPayment() {
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
    document.getElementById('pay-btn').textContent = `Pay £${(currentBookingState.event.price_pence * currentBookingState.quantity / 100).toFixed(2)}`;
    return;
  }

  try {
    await apiFetch(`/api/bookings/${currentBookingState.booking.id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ stripe_payment_intent_id: paymentIntent.id })
    });
    closeModal('booking-modal');
    showConfirmation(currentBookingState.booking, currentBookingState.customer, currentBookingState.event);
    loadEvents();
  } catch {
    alert('Payment taken but confirmation failed. Please contact us with your booking reference.');
  }
}

function showConfirmation(booking, customer, event) {
  const total = event.price_pence === 0 ? 'Free' : `£${(booking.total_pence / 100).toFixed(2)}`;
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
      <button class="btn btn-primary" onclick="closeModal('confirm-modal')">Done</button>
    </div>`;

  openModal('confirm-modal');
}

// ---- MODALS ----
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    document.body.style.overflow = ''; }
function closeEventModal(e)   { if (e.target.id === 'event-modal')   closeModal('event-modal'); }
function closeBookingModal(e) { if (e.target.id === 'booking-modal') closeModal('booking-modal'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') ['event-modal','booking-modal','confirm-modal'].forEach(closeModal);
});

// ---- HELPERS ----
async function apiFetch(url, opts = {}) {
  const res  = await fetch(url, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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
