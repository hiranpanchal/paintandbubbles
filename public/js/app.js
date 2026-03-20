/* =============================================
   PAINT & BUBBLES — HOMEPAGE
   Shows the 2 latest upcoming events
   ============================================= */

let stripe = null;
let currentBookingState = {};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
  await loadUpcomingEvents();
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

    // Hero title
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
      const main      = s.hero_title            || 'Paint, Create';
      const highlight = s.hero_title_highlight  || '& Celebrate';
      heroTitle.innerHTML = escHtml(main) + ' <span class="hero-highlight">' + escHtml(highlight) + '</span>';
    }

    // Hero subtitle
    setText('.hero-sub', s.hero_subtitle);

    // CTA buttons
    const ctaPrimary = document.querySelector('.hero-actions .btn-primary');
    if (ctaPrimary) {
      if (s.hero_cta_primary_text) ctaPrimary.textContent = s.hero_cta_primary_text;
      if (s.hero_cta_primary_url)  ctaPrimary.href = s.hero_cta_primary_url;
    }
    const ctaSecondary = document.querySelector('.hero-actions .btn-outline-white');
    if (ctaSecondary) {
      if (s.hero_cta_secondary_text) ctaSecondary.textContent = s.hero_cta_secondary_text;
      if (s.hero_cta_secondary_url)  ctaSecondary.href = s.hero_cta_secondary_url;
    }

    // About section
    setText('.about-title', s.about_title);
    const aboutBodies = document.querySelectorAll('.about-body');
    if (aboutBodies[0] && s.about_body_1) aboutBodies[0].textContent = s.about_body_1;
    if (aboutBodies[1] && s.about_body_2) aboutBodies[1].textContent = s.about_body_2;

    // Hero background image
    if (s.hero_image_url) {
      const hero = document.querySelector('.hero');
      if (hero) {
        hero.style.background = `linear-gradient(135deg, rgba(44,15,24,0.82) 0%, rgba(107,45,66,0.72) 45%, rgba(196,116,138,0.55) 100%), url(${s.hero_image_url}) center/cover no-repeat`;
      }
    }

    // About image
    if (s.about_image_url) {
      const img = document.querySelector('.about-image-inner img');
      if (img) { img.src = s.about_image_url; img.style.display = ''; }
    }

    // Footer tagline
    setText('.footer-tagline', s.footer_tagline);

    // Trust cards
    const TRUST_ICONS = {
      star:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      brush:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08"/><path d="M7.07 14.94C5.79 16.2 5 17.5 5 19c2 0 3-1 4.09-2.03L7.07 14.94z"/></svg>',
      users:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      pin:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
      heart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      smile:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
      award:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>',
      clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      gift:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
      zap:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
      music:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
      camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    };
    for (let i = 1; i <= 4; i++) {
      const iconKey = s[`trust_${i}_icon`];
      if (iconKey && TRUST_ICONS[iconKey]) {
        const iconEl = document.getElementById(`trust-icon-${i}`);
        if (iconEl) iconEl.innerHTML = TRUST_ICONS[iconKey];
      }
      const titleEl = document.getElementById(`trust-title-${i}`);
      if (titleEl && s[`trust_${i}_title`]) titleEl.textContent = s[`trust_${i}_title`];
      const subEl = document.getElementById(`trust-sub-${i}`);
      if (subEl && s[`trust_${i}_sub`]) subEl.textContent = s[`trust_${i}_sub`];
    }
  } catch {}
}

function setText(selector, value) {
  if (!value) return;
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
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

// ---- LOAD 2 UPCOMING EVENTS ----
async function loadUpcomingEvents() {
  const grid = document.getElementById('events-grid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading events…</p></div>';

  try {
    const events = await apiFetch('/api/events');
    const upcoming = events.slice(0, 3);

    if (upcoming.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>No upcoming events</h3><p>Check back soon for new events.</p></div>`;
      return;
    }

    grid.innerHTML = upcoming.map(renderEventCard).join('');
  } catch {
    grid.innerHTML = `<div class="empty-state"><h3>Failed to load events</h3><p>Please try refreshing the page.</p></div>`;
  }
}

// ---- RENDER EVENT CARD ----
function renderEventCard(event) {
  const price = event.price_pence === 0
    ? '<span class="event-price event-price-free">Free</span>'
    : `<span class="event-price">£${(event.price_pence / 100).toFixed(2)}</span>`;
  const spotsLeft = event.spots_remaining;
  const isSoldOut = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;

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
  currentBookingState.event = event;
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

  if (!name || !email) { highlightError(!name ? 'b-name' : 'b-email', 'This field is required'); return; }
  if (!isValidEmail(email)) { highlightError('b-email', 'Please enter a valid email'); return; }

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
    loadUpcomingEvents();
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
