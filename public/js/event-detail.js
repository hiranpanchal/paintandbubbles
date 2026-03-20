/* =============================================
   PAINT & BUBBLES — EVENT DETAIL PAGE
   ============================================= */

let stripe = null;
let currentEvent = null;
let currentBookingState = {};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
  fetchStripePK();

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

    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }
  } catch {}
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

// ---- RENDER EVENT DETAIL ----
function renderEventDetail(event) {
  const spotsLeft = event.spots_remaining;
  const isSoldOut = spotsLeft <= 0;
  const isLowStock = spotsLeft > 0 && spotsLeft <= 5;
  const price = event.price_pence === 0 ? 'Free' : `£${(event.price_pence / 100).toFixed(2)}`;
  const duration = formatDuration(event.duration_minutes);

  const heroBg = event.image_url
    ? `style="background: linear-gradient(to bottom, rgba(28,10,18,0.65) 0%, rgba(28,10,18,0.45) 60%, rgba(28,10,18,0.75) 100%), url(${escHtml(event.image_url)}) center/cover no-repeat;"`
    : `style="background: linear-gradient(135deg, var(--rose-dark) 0%, var(--rose-deep) 50%, var(--rose) 100%);"`;

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

          <!-- Description -->
          <div class="ed-section">
            <h2 class="ed-section-title">About this event</h2>
            <div class="ed-description">${escHtml(event.description || 'Join us for a wonderful creative experience. All skill levels welcome!')}</div>
          </div>

          <!-- What's included -->
          <div class="ed-section">
            <h2 class="ed-section-title">What's included</h2>
            <ul class="ed-included-list">
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                All materials and tools provided
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Step-by-step instructor guidance
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Drinks included throughout the session
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Small group setting — max ${event.capacity} people
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 10l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Take your finished creation home
              </li>
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
              ? `<button class="btn btn-full" disabled style="background:var(--border);color:var(--text-light);cursor:not-allowed;padding:16px;border-radius:var(--radius);font-weight:700;font-size:16px;border:none;">Sold Out</button>`
              : `<button class="btn btn-primary btn-full ed-book-btn" onclick="openBooking()">Book Now →</button>`
            }

            <p class="ed-booking-note">No payment taken until the next step</p>
          </div>
        </div>

      </div>
    </div>`;
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
  currentBookingState.event    = currentEvent;
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
      <a href="/events" class="btn btn-primary">Browse More Events</a>
    </div>`;

  openModal('confirm-modal');
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
