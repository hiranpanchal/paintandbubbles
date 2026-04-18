/* =============================================
   PAINT & BUBBLES — ADMIN DASHBOARD
   ============================================= */

let authToken = localStorage.getItem('pb_admin_token');
let currentTab = 'overview';
let customerSearchTimeout = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    showDashboard();
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
  }
});

// ---- AUTH ----
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  if (!username || !password) {
    showLoginError('Please enter your username and password.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errEl.classList.add('hidden');

  try {
    const data = await apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authToken = data.token;
    localStorage.setItem('pb_admin_token', authToken);
    localStorage.setItem('pb_admin_role', data.role || 'admin');
    document.getElementById('login-screen').classList.add('hidden');
    showDashboard();
  } catch (err) {
    showLoginError(err.message || 'Invalid credentials');
  }

  btn.disabled = false;
  btn.textContent = 'Sign In';
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function signOut() {
  authToken = null;
  localStorage.removeItem('pb_admin_token');
  localStorage.removeItem('pb_admin_role');
  location.reload();
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  // Show Users tab only for super_admin
  const role = localStorage.getItem('pb_admin_role') || 'admin';
  const usersTab = document.getElementById('tab-users');
  if (usersTab) usersTab.style.display = role === 'super_admin' ? '' : 'none';
  // Populate topbar username
  try {
    const payload = JSON.parse(atob(authToken.split('.')[1]));
    const nameEl = document.getElementById('topbar-username');
    if (nameEl) nameEl.textContent = payload.username || '';
  } catch {}
  refreshMessagesBadge();
  refreshPQBadge();
  switchTab('overview');
}

// ---- TABS ----
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`content-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('active');

  const titles = { overview: 'Overview', events: 'Events', bookings: 'Bookings', customers: 'Customers', payments: 'Payments', design: 'Design', faq: 'FAQ', reviews: 'Reviews', users: 'Users', content: 'Content', enquiries: 'Messages', 'private-quotes': 'Private Event Quotes', vouchers: 'Gift Vouchers', discounts: 'Discount Codes' };
  document.getElementById('page-title').textContent = titles[tab] || tab;

  // Close sidebar on mobile
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  // Load data for tab
  if (tab === 'overview') loadOverview();
  else if (tab === 'events') loadAdminEvents();
  else if (tab === 'bookings') loadAdminBookings();
  else if (tab === 'customers') loadAdminCustomers();
  else if (tab === 'payments') loadAdminPayments();
  else if (tab === 'design') loadDesign();
  else if (tab === 'faq')     loadAdminFAQs();
  else if (tab === 'reviews') loadAdminReviews();
  else if (tab === 'users')     loadAdminUsers();
  else if (tab === 'content')   loadContentTab();
  else if (tab === 'enquiries')      loadEnquiries();
  else if (tab === 'private-quotes') loadPrivateQuotes();
  else if (tab === 'vouchers')       loadAdminVouchers();
  else if (tab === 'discounts')   loadAdminDiscounts();
  else if (tab === 'categories')  loadAdminCategories();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ---- OVERVIEW ----
async function loadOverview() {
  try {
    const data = await apiFetch('/api/admin/stats');
    renderStats(data.stats);
    renderRecentBookings(data.recentBookings);
    renderRevenueChart(data.monthlyRevenue);
  } catch (err) {
    if (err.status === 401) handleUnauth();
  }
}

function renderStats(stats) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Active Events</div>
      <div class="stat-value">${stats.totalEvents}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Bookings</div>
      <div class="stat-value">${stats.totalBookings}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Customers</div>
      <div class="stat-value">${stats.totalCustomers}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value">${formatPrice(stats.totalRevenue)}</div>
    </div>`;
}

function renderRecentBookings(bookings) {
  const el = document.getElementById('recent-bookings-table');
  if (!bookings || bookings.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No bookings yet</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Customer</th>
        <th>Event</th>
        <th>Date</th>
        <th>Status</th>
        <th>Amount</th>
        <th></th>
      </tr></thead>
      <tbody>${bookings.map(b => `
        <tr class="clickable-row" onclick="viewBookingDetail(${b.id})" style="cursor:pointer">
          <td><div style="font-weight:600">${escHtml(b.customer_name)}</div><div style="color:var(--text-light);font-size:11px">${escHtml(b.customer_email)}</div></td>
          <td>${escHtml(b.event_title)}</td>
          <td class="hide-mobile">${formatDate(b.event_date)}</td>
          <td>${statusBadge(b.status)}</td>
          <td><strong>${formatPrice(b.total_pence)}</strong></td>
          <td style="color:var(--text-light)">›</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function viewBookingDetail(id) {
  const modal = document.getElementById('generic-modal');
  const body  = document.getElementById('generic-modal-body');
  body.innerHTML = `
    <div class="modal-header">
      <h2>Booking Detail</h2>
      <button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button>
    </div>
    <div class="modal-body" style="padding:24px">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>`;
  modal.classList.remove('hidden');

  try {
    const b = await apiFetch(`/api/bookings/${id}`);
    const ref = `#PB${String(b.id).padStart(5,'0')}`;
    const discount = (b.discount_pence || 0) + (b.voucher_discount_pence || 0);
    const charged  = Math.max(0, b.total_pence - discount);

    body.innerHTML = `
      <div class="modal-header">
        <div>
          <h2>${ref}</h2>
          <div style="margin-top:2px">${statusBadge(b.status)}</div>
        </div>
        <button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:20px">

        <div class="booking-detail-section">
          <div class="booking-detail-label">Customer</div>
          <div class="booking-detail-value">${escHtml(b.customer_name)}</div>
          <div class="booking-detail-sub">${escHtml(b.customer_email)}${b.customer_phone ? ' · ' + escHtml(b.customer_phone) : ''}</div>
        </div>

        <div class="booking-detail-section">
          <div class="booking-detail-label">Event</div>
          <div class="booking-detail-value">${escHtml(b.event_title)}</div>
          <div class="booking-detail-sub">${formatDate(b.event_date)} at ${escHtml(b.event_time || '')} · ${b.quantity} ticket${b.quantity !== 1 ? 's' : ''}</div>
        </div>

        <div class="booking-detail-section">
          <div class="booking-detail-label">Payment</div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
            <div class="booking-detail-row-split"><span>Subtotal</span><span>${formatPrice(b.total_pence)}</span></div>
            ${b.discount_pence > 0 ? `<div class="booking-detail-row-split" style="color:var(--green)"><span>🏷️ Discount (${escHtml(b.discount_code || '')})</span><span>−${formatPrice(b.discount_pence)}</span></div>` : ''}
            ${b.voucher_discount_pence > 0 ? `<div class="booking-detail-row-split" style="color:var(--green)"><span>🎁 Voucher (${escHtml(b.voucher_code || '')})</span><span>−${formatPrice(b.voucher_discount_pence)}</span></div>` : ''}
            <div class="booking-detail-row-split" style="font-weight:700;border-top:1px solid var(--border);padding-top:6px"><span>Total Charged</span><span style="color:var(--green)">${formatPrice(charged)}</span></div>
          </div>
        </div>

        ${b.notes ? `<div class="booking-detail-section">
          <div class="booking-detail-label">Notes</div>
          <div class="booking-detail-value" style="font-weight:400;font-size:13px;color:var(--text-mid)">${escHtml(b.notes)}</div>
        </div>` : ''}

        ${b.payment_reference ? `<div class="booking-detail-section">
          <div class="booking-detail-label">Payment Reference</div>
          <div style="font-family:monospace;font-size:12px;color:var(--text-mid);word-break:break-all;margin-top:4px">${escHtml(b.payment_reference)}</div>
        </div>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          ${b.status !== 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="updateBookingStatus(${b.id},'confirmed');closeAdminModal('generic-modal')">Mark Confirmed</button>` : ''}
          ${b.status !== 'cancelled' ? `<button class="btn btn-sm btn-ghost" onclick="updateBookingStatus(${b.id},'cancelled');closeAdminModal('generic-modal')">Cancel Booking</button>` : ''}
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;margin-left:auto" onclick="deleteBooking(${b.id})">Delete Booking</button>
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="modal-header"><h2>Error</h2><button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button></div>
      <div class="modal-body" style="padding:24px"><p style="color:var(--coral)">${escHtml(err.message || 'Failed to load booking')}</p></div>`;
  }
}

function renderRevenueChart(months) {
  const el = document.getElementById('revenue-chart');
  if (!months || months.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No revenue data yet</p></div>';
    return;
  }

  const max = Math.max(...months.map(m => m.total));
  const reversed = [...months].reverse();

  el.innerHTML = `<div class="bar-chart">${reversed.map(m => {
    const pct = max > 0 ? (m.total / max * 100) : 0;
    const label = m.month ? m.month.slice(0, 7) : '';
    return `
      <div class="bar-row">
        <div class="bar-label">${label.slice(5)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="bar-value">${formatPrice(m.total)}</div>
      </div>`;
  }).join('')}</div>`;
}

// ---- EVENTS ----
async function loadAdminEvents() {
  const el = document.getElementById('events-table');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const [events, waitlistCounts] = await Promise.all([
      apiFetch('/api/events?include_inactive=true', { headers: authHeaders() }),
      apiFetch('/api/waitlist/counts', { headers: authHeaders() }).catch(() => ({})),
    ]);
    renderEventsTable(events, waitlistCounts);
  } catch { el.innerHTML = '<div class="empty-state"><p>Failed to load events</p></div>'; }
}

function renderEventsTable(events, waitlistCounts = {}) {
  const el = document.getElementById('events-table');
  if (!events.length) {
    el.innerHTML = '<div class="empty-state"><p>No events yet. Add your first event!</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Event</th>
        <th>Date & Time</th>
        <th class="hide-mobile">Location</th>
        <th>Price</th>
        <th>Spots</th>
        <th>Status</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>${events.map(e => `
        <tr>
          <td>
            <div style="font-weight:600;">${escHtml(e.title)}</div>
            <div style="color:var(--text-light);font-size:11px;">${escHtml(e.category)}</div>
          </td>
          <td>${formatDate(e.date)}<br><span style="color:var(--text-light);font-size:11px">${e.time}</span></td>
          <td class="hide-mobile" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(e.location)}</td>
          <td><strong>${e.price_pence === 0 ? 'Free' : formatPrice(e.price_pence)}</strong></td>
          <td>
            <span style="color:${e.spots_remaining <= 0 ? 'var(--coral)' : e.spots_remaining <= 3 ? 'var(--amber)' : 'var(--green)'}">
              ${e.spots_remaining}/${e.capacity}
            </span>
            ${(waitlistCounts[e.id] || 0) > 0 ? `<br><span style="font-size:11px;color:var(--rose);font-weight:700;cursor:pointer" onclick="viewWaitlist(${e.id},'${escHtml(e.title)}')">⏳ ${waitlistCounts[e.id]} waiting</span>` : ''}
          </td>
          <td>${e.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Hidden</span>'}</td>
          <td>
            <div class="actions">
              <button class="btn btn-ghost btn-xs" onclick="window.open('/events/${e.id}','_blank')">View</button>
              <button class="btn btn-ghost btn-xs" onclick="viewEventBookings(${e.id}, '${escHtml(e.title)}')">Bookings</button>
              <button class="btn btn-ghost btn-xs" onclick="viewWaitlist(${e.id},'${escHtml(e.title)}')">Waitlist</button>
              <button class="btn btn-ghost btn-xs" onclick="openEventForm(${e.id})">Edit</button>
              <button class="btn btn-ghost btn-xs" onclick="cloneEvent(${e.id})">Clone</button>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none" onclick="confirmDelete(${e.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function viewWaitlist(eventId, eventTitle) {
  const modal = document.getElementById('generic-modal');
  const body  = document.getElementById('generic-modal-body');
  body.innerHTML = `
    <div class="modal-header">
      <div>
        <h2>Waitlist</h2>
        <div style="font-size:13px;color:var(--text-mid);margin-top:2px">${escHtml(eventTitle)}</div>
      </div>
      <button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button>
    </div>
    <div class="modal-body" style="padding:24px">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>`;
  modal.classList.remove('hidden');

  try {
    const entries = await apiFetch(`/api/waitlist/event/${eventId}`, { headers: authHeaders() });
    const bodyEl = body.querySelector('.modal-body');

    if (!entries.length) {
      bodyEl.innerHTML = '<p style="color:var(--text-mid);text-align:center;padding:32px 0">No one on the waitlist for this event.</p>';
      return;
    }

    const notified = entries.filter(e => e.notified_at);
    const waiting  = entries.filter(e => !e.notified_at);

    bodyEl.innerHTML = `
      <div style="font-size:13px;color:var(--text-mid);margin-bottom:16px">
        <strong style="color:var(--text)">${waiting.length}</strong> waiting &nbsp;·&nbsp;
        <strong style="color:var(--text)">${notified.length}</strong> already notified
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Name</th>
          <th>Email</th>
          <th class="hide-mobile">Phone</th>
          <th>Added</th>
          <th>Status</th>
          <th></th>
        </tr></thead>
        <tbody>${entries.map(e => `
          <tr id="wl-row-${e.id}">
            <td style="font-weight:600">${escHtml(e.name)}</td>
            <td>${escHtml(e.email)}</td>
            <td class="hide-mobile">${escHtml(e.phone || '—')}</td>
            <td style="font-size:12px;color:var(--text-mid)">${formatDate(e.created_at.split('T')[0])}</td>
            <td>${e.notified_at
              ? `<span class="badge badge-green">Notified</span>`
              : `<span class="badge badge-gray">Waiting</span>`}
            </td>
            <td>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none"
                onclick="removeWaitlistEntry(${e.id})">Remove</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    body.querySelector('.modal-body').innerHTML = `<p style="color:var(--coral);text-align:center;padding:32px 0">Failed to load waitlist.</p>`;
  }
}

async function removeWaitlistEntry(id) {
  try {
    await apiFetch(`/api/waitlist/${id}`, { method: 'DELETE', headers: authHeaders() });
    const row = document.getElementById(`wl-row-${id}`);
    if (row) row.remove();
    toast('Entry removed', 'success');
  } catch (err) {
    toast('Failed to remove entry', 'error');
  }
}

function openEventForm(eventId = null) {
  document.getElementById('event-form-title').textContent = eventId ? 'Edit Event' : 'Add Event';

  if (eventId) {
    // Show spinner immediately so the modal has content when it opens —
    // otherwise the empty body lets clicks reach the overlay and close it
    document.getElementById('event-form-body').innerHTML =
      '<div class="loading-state" style="padding:40px 0"><div class="spinner"></div></div>';
    openAdminModal('event-form-modal');
    apiFetch(`/api/events/${eventId}`)
      .then(event => renderEventForm(event))
      .catch(() => { closeAdminModal('event-form-modal'); toast('Failed to load event', 'error'); });
  } else {
    renderEventForm(null);
    openAdminModal('event-form-modal');
  }
}

async function renderEventForm(event = null) {
  const isEdit = !!event;
  document.getElementById('event-form-body').innerHTML = `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Event Title *</label>
        <input type="text" id="ef-title" value="${escHtml(event?.title || '')}" placeholder="e.g. Sunset Watercolours">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="ef-category">
          <option value="">Loading…</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="ef-description" rows="3" placeholder="Describe the event...">${escHtml(event?.description || '')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date *</label>
        <input type="date" id="ef-date" value="${event?.date || ''}">
      </div>
      <div class="form-group">
        <label>Time *</label>
        <input type="time" id="ef-time" value="${event?.time || ''}">
      </div>
      <div class="form-group">
        <label>Duration (mins)</label>
        <input type="number" id="ef-duration" value="${event?.duration_minutes || 120}" min="15" step="15">
      </div>
    </div>
    <div class="form-group">
      <label>Location *</label>
      <input type="text" id="ef-location" value="${escHtml(event?.location || '')}" placeholder="e.g. 12 Studio Lane, Brighton">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Capacity (max attendees) *</label>
        <input type="number" id="ef-capacity" value="${event?.capacity || 20}" min="1">
      </div>
      <div class="form-group">
        <label>Price (£) *</label>
        <input type="number" id="ef-price" value="${event ? (event.price_pence / 100).toFixed(2) : ''}" min="0" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="form-group">
      <label>Event Image (optional)</label>
      <input type="hidden" id="ef-image" value="${escHtml(event?.image_url || '')}">
      <div class="ef-image-zone" id="ef-image-zone" onclick="document.getElementById('ef-image-file').click()"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="event.preventDefault();this.classList.remove('drag-over');handleEventImageDrop(event.dataTransfer.files[0])">
        ${event?.image_url
          ? `<img src="${escHtml(event.image_url)}" id="ef-image-preview" style="max-height:140px;max-width:100%;border-radius:8px;display:block;margin:0 auto">
             <p style="margin-top:8px;font-size:12px;color:var(--text-light)">Click or drag to replace</p>`
          : `<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
             <p>Drop image here or click to upload</p>`
        }
      </div>
      <input type="file" id="ef-image-file" accept="image/*" style="display:none" onchange="handleEventImageFile(this.files[0])">
      ${event?.image_url ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;font-size:12px" onclick="clearEventImage()">✕ Remove image</button>` : ''}
    </div>
    ${isEdit ? `
    <div class="form-group">
      <label>
        <input type="checkbox" id="ef-active" ${event?.is_active ? 'checked' : ''}> Show on public site
      </label>
    </div>` : ''}
    <div style="display:flex;gap:12px;margin-top:8px;">
      <button class="btn btn-ghost btn-full" onclick="closeAdminModal('event-form-modal')">Cancel</button>
      <button class="btn btn-primary btn-full" onclick="saveEvent(${event?.id || 'null'})">${isEdit ? 'Save Changes' : 'Create Event'}</button>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px">
      <button type="button" class="btn-fb-share" style="flex:1" onclick="openFacebookEventHelper()">
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Create FB Event
      </button>
      <button type="button" class="btn-social-post" style="flex:1" onclick="openSocialPostHelper(${event?.id || 'null'})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        Share as Post
      </button>
    </div>`;

  // Populate category dropdown from API
  try {
    const cats = await apiFetch('/api/categories');
    const sel = document.getElementById('ef-category');
    if (sel) {
      sel.innerHTML = cats.map(c =>
        `<option value="${escHtml(c.name)}" ${event?.category === c.name ? 'selected' : ''}>${escHtml(c.name)}</option>`
      ).join('');
    }
  } catch {}
}

async function saveEvent(id) {
  const title = document.getElementById('ef-title').value.trim();
  const date = document.getElementById('ef-date').value;
  const time = document.getElementById('ef-time').value;
  const location = document.getElementById('ef-location').value.trim();
  const capacity = parseInt(document.getElementById('ef-capacity').value);
  const price = parseFloat(document.getElementById('ef-price').value);

  if (!title || !date || !time || !location || !capacity || isNaN(price)) {
    toast('Please fill in all required fields', 'error');
    return;
  }

  const payload = {
    title,
    description: document.getElementById('ef-description').value.trim(),
    category: document.getElementById('ef-category').value,
    date, time,
    duration_minutes: parseInt(document.getElementById('ef-duration').value) || 120,
    location, capacity,
    price_pence: Math.round(price * 100),
    image_url: document.getElementById('ef-image').value.trim() || null,
  };

  if (id) payload.is_active = document.getElementById('ef-active').checked ? 1 : 0;

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/events/${id}` : '/api/events';
    await apiFetch(url, { method, body: JSON.stringify(payload), headers: authHeaders() });
    closeAdminModal('event-form-modal');
    toast(id ? 'Event updated!' : 'Event created!', 'success');
    loadAdminEvents();
  } catch (err) {
    toast(err.message || 'Failed to save event', 'error');
  }
}

// ---- FACEBOOK EVENT HELPER ----
function openFacebookEventHelper() {
  const title       = document.getElementById('ef-title')?.value.trim() || '';
  const description = document.getElementById('ef-description')?.value.trim() || '';
  const date        = document.getElementById('ef-date')?.value || '';
  const time        = document.getElementById('ef-time')?.value || '';
  const duration    = parseInt(document.getElementById('ef-duration')?.value || '120');
  const location    = document.getElementById('ef-location')?.value.trim() || '';
  const priceRaw    = parseFloat(document.getElementById('ef-price')?.value || '0');

  if (!title || !date || !time) {
    toast('Please fill in the Title, Date and Time first', 'error');
    return;
  }

  const startDt  = new Date(`${date}T${time}`);
  const endDt    = new Date(startDt.getTime() + duration * 60000);
  const dateStr  = startDt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr  = startDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endStr   = endDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const priceStr = priceRaw === 0 ? 'Free' : `£${priceRaw.toFixed(2)} per person`;

  // Build best-effort Facebook pre-fill URL
  const fbUrl = new URL('https://www.facebook.com/events/create');
  fbUrl.searchParams.set('name', title);
  fbUrl.searchParams.set('start_time', Math.floor(startDt.getTime() / 1000).toString());
  fbUrl.searchParams.set('end_time', Math.floor(endDt.getTime() / 1000).toString());
  if (location)    fbUrl.searchParams.set('location', location);
  if (description) fbUrl.searchParams.set('description', description);
  const fbHref = fbUrl.toString();

  const modalBody = document.getElementById('generic-modal-body');
  if (!modalBody) return;

  const field = (label, id, value, multiline) => !value ? '' : `
    <div class="fb-field-row">
      <div class="fb-field-label">${label}</div>
      <div class="fb-copy-row">
        <span class="fb-copy-value${multiline ? ' fb-copy-multi' : ''}" id="${id}">${escHtml(value)}</span>
        <button class="fb-copy-btn" onclick="copyFbField('${id}')">Copy</button>
      </div>
    </div>`;

  modalBody.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
      <div style="width:42px;height:42px;background:#1877F2;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </div>
      <div>
        <h3 style="margin:0;font-size:1.05rem;font-weight:700">Create on Facebook</h3>
        <p style="margin:3px 0 0;font-size:0.82rem;color:var(--text-light)">Click each Copy button, then paste into the Facebook form</p>
      </div>
    </div>

    ${field('Event Name', 'fbf-title', title)}
    ${field('Date & Time', 'fbf-datetime', `${dateStr} · ${timeStr} – ${endStr}`)}
    ${field('Location', 'fbf-location', location)}
    ${field('Description', 'fbf-desc', description, true)}
    ${field('Ticket Price', 'fbf-price', priceStr)}

    <div style="margin-top:22px;display:flex;gap:10px">
      <a href="${escHtml(fbHref)}" target="_blank" rel="noopener" class="btn btn-primary" style="flex:1;background:#1877F2;border-color:#1877F2;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Open Facebook Events
      </a>
      <button class="btn btn-ghost" onclick="closeAdminModal('generic-modal')" style="flex:0 0 auto">Close</button>
    </div>`;

  openAdminModal('generic-modal');
}

function copyFbField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim())
    .then(() => toast('Copied!', 'success'))
    .catch(() => toast('Could not copy — please copy manually', 'error'));
}

// ---- SOCIAL POST HELPER ----
function openSocialPostHelper(eventId) {
  const title       = document.getElementById('ef-title')?.value.trim() || '';
  const description = document.getElementById('ef-description')?.value.trim() || '';
  const date        = document.getElementById('ef-date')?.value || '';
  const time        = document.getElementById('ef-time')?.value || '';
  const duration    = parseInt(document.getElementById('ef-duration')?.value || '120');
  const location    = document.getElementById('ef-location')?.value.trim() || '';
  const priceRaw    = parseFloat(document.getElementById('ef-price')?.value || '0');

  if (!title || !date || !time) {
    toast('Please fill in the Title, Date and Time first', 'error');
    return;
  }

  const startDt  = new Date(`${date}T${time}`);
  const endDt    = new Date(startDt.getTime() + duration * 60000);
  const dateStr  = startDt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr  = startDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endStr   = endDt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const priceStr = priceRaw === 0 ? 'Free' : `£${priceRaw.toFixed(2)} per person`;

  const siteUrl  = window.location.origin;
  const eventUrl = eventId ? `${siteUrl}/events/${eventId}` : `${siteUrl}/events`;

  // --- Facebook post ---
  const fbPost = `🎨 ${title}

📅 ${dateStr}
🕐 ${timeStr} – ${endStr}${location ? `\n📍 ${location}` : ''}
🎟 ${priceStr}
${description ? `\n${description}\n` : ''}
All materials provided · All skill levels welcome 🥂

Book your spot: ${eventUrl}`;

  // --- Instagram caption ---
  const igCaption = `🎨 ${title}

${dateStr} · ${timeStr}${location ? `\n📍 ${location}` : ''}
🎟 ${priceStr}
${description ? `\n${description}\n` : ''}
✨ All materials included
🥂 Drinks provided
🌟 All skill levels welcome

👉 Link in bio to book your spot!

#paintandbubbles #sipandpaint #artclass #painting #crafts #artnight #creativefun #girlsnight #datenight #henparty #teambuilding #artlovers #paintnight #brighton #creative`;

  // Facebook Share URL
  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`;

  const modalBody = document.getElementById('generic-modal-body');
  if (!modalBody) return;

  modalBody.innerHTML = `
    <h3 style="margin:0 0 4px;font-size:1.05rem;font-weight:700">Share as Post</h3>
    <p style="margin:0 0 20px;font-size:0.82rem;color:var(--text-light)">Ready-to-post captions for each platform</p>

    <div class="social-post-tabs">
      <button class="social-post-tab active" onclick="switchSocialTab('fb',this)">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </button>
      <button class="social-post-tab" onclick="switchSocialTab('ig',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
        Instagram
      </button>
    </div>

    <div id="social-tab-fb" class="social-tab-panel">
      <div class="fb-copy-row" style="align-items:flex-start">
        <pre class="fb-copy-value fb-copy-multi" id="sp-fb-text" style="max-height:200px;font-family:inherit;margin:0">${escHtml(fbPost)}</pre>
        <button class="fb-copy-btn" onclick="copyFbField('sp-fb-text')">Copy</button>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <a href="${escHtml(fbShareUrl)}" target="_blank" rel="noopener"
           class="btn btn-primary" style="flex:1;background:#1877F2;border-color:#1877F2;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:7px">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          Share on Facebook
        </a>
        <button class="btn btn-ghost" onclick="closeAdminModal('generic-modal')">Close</button>
      </div>
    </div>

    <div id="social-tab-ig" class="social-tab-panel" style="display:none">
      <div class="fb-copy-row" style="align-items:flex-start">
        <pre class="fb-copy-value fb-copy-multi" id="sp-ig-text" style="max-height:200px;font-family:inherit;margin:0">${escHtml(igCaption)}</pre>
        <button class="fb-copy-btn" onclick="copyFbField('sp-ig-text')">Copy</button>
      </div>
      <p style="font-size:0.78rem;color:var(--text-light);margin:10px 0 0">Copy the caption above, then paste it into a new Instagram post. Remember to add your event image!</p>
      <div style="margin-top:14px;display:flex;gap:10px">
        <a href="https://www.instagram.com" target="_blank" rel="noopener"
           class="btn btn-primary" style="flex:1;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);border:none;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:7px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>
          Open Instagram
        </a>
        <button class="btn btn-ghost" onclick="closeAdminModal('generic-modal')">Close</button>
      </div>
    </div>`;

  openAdminModal('generic-modal');
}

function switchSocialTab(tab, btn) {
  document.querySelectorAll('.social-post-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('social-tab-fb').style.display = tab === 'fb' ? '' : 'none';
  document.getElementById('social-tab-ig').style.display = tab === 'ig' ? '' : 'none';
}

// ---- EVENT IMAGE UPLOAD ----
async function handleEventImageFile(file) {
  if (!file) return;
  const zone = document.getElementById('ef-image-zone');
  if (zone) { zone.style.opacity = '0.5'; zone.style.pointerEvents = 'none'; }
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/design/upload', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: fd });
    const data = await res.json();
    if (!data.url) throw new Error('Upload failed');
    document.getElementById('ef-image').value = data.url;
    if (zone) {
      zone.innerHTML = `<img src="${escHtml(data.url)}" id="ef-image-preview" style="max-height:140px;max-width:100%;border-radius:8px;display:block;margin:0 auto"><p style="margin-top:8px;font-size:12px;color:var(--text-light)">Click or drag to replace</p>`;
      zone.style.opacity = '';
      zone.style.pointerEvents = '';
    }
  } catch (err) {
    toast('Image upload failed', 'error');
    if (zone) { zone.style.opacity = ''; zone.style.pointerEvents = ''; }
  }
}

function handleEventImageDrop(file) {
  if (file && file.type.startsWith('image/')) handleEventImageFile(file);
}

// ---- REVIEW IMAGE UPLOAD ----
async function handleReviewImageFile(file) {
  if (!file) return;
  const zone = document.getElementById('review-image-zone');
  if (zone) { zone.style.opacity = '0.5'; zone.style.pointerEvents = 'none'; }
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/design/upload', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: fd });
    const data = await res.json();
    if (!data.url) throw new Error('Upload failed');
    document.getElementById('review-form-image').value = data.url;
    if (zone) {
      zone.innerHTML = `<img src="${escHtml(data.url)}" style="max-height:120px;max-width:100%;border-radius:8px;display:block;margin:0 auto"><p style="margin-top:6px;font-size:12px;color:var(--text-light)">Click or drag to replace · <a href="#" onclick="clearReviewImage();return false" style="color:var(--rose)">Remove</a></p>`;
      zone.style.opacity = '';
      zone.style.pointerEvents = '';
    }
  } catch {
    toast('Image upload failed', 'error');
    if (zone) { zone.style.opacity = ''; zone.style.pointerEvents = ''; }
  }
}

function handleReviewImageDrop(file) {
  if (file && file.type.startsWith('image/')) handleReviewImageFile(file);
}

function clearReviewImage() {
  document.getElementById('review-form-image').value = '';
  const zone = document.getElementById('review-image-zone');
  if (zone) zone.innerHTML = `<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg><p>Drop photo here or click to upload</p>`;
}

function clearEventImage() {
  document.getElementById('ef-image').value = '';
  const zone = document.getElementById('ef-image-zone');
  if (zone) zone.innerHTML = `<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg><p>Drop image here or click to upload</p>`;
  const removeBtn = document.querySelector('[onclick="clearEventImage()"]');
  if (removeBtn) removeBtn.remove();
}

async function cloneEvent(id) {
  try {
    const event = await apiFetch(`/api/events/${id}`);
    const payload = {
      title: `${event.title} (Copy)`,
      description: event.description,
      category: event.category,
      date: event.date,
      time: event.time,
      duration_minutes: event.duration_minutes,
      location: event.location,
      capacity: event.capacity,
      price_pence: event.price_pence,
      image_url: event.image_url || null,
      is_active: 0,
    };
    await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(payload), headers: authHeaders() });
    toast('Event cloned — it\'s hidden by default', 'success');
    loadAdminEvents();
  } catch (err) {
    toast(err.message || 'Failed to clone event', 'error');
  }
}

async function viewEventBookings(eventId, eventTitle) {
  const modal = document.getElementById('generic-modal');
  const body  = document.getElementById('generic-modal-body');
  body.innerHTML = `
    <div class="modal-header">
      <div>
        <h2>Bookings</h2>
        <div style="font-size:13px;color:var(--text-mid);margin-top:2px">${escHtml(eventTitle)}</div>
      </div>
      <button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button>
    </div>
    <div class="modal-body" style="padding:24px">
      <div class="loading-state"><div class="spinner"></div></div>
    </div>`;
  modal.classList.remove('hidden');

  try {
    const bookings = await apiFetch(`/api/bookings?event_id=${eventId}`);
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const pending   = bookings.filter(b => b.status === 'pending');
    const all = [...confirmed, ...pending];

    if (!all.length) {
      body.querySelector('.modal-body').innerHTML = '<p style="color:var(--text-mid);text-align:center;padding:32px 0">No bookings yet for this event.</p>';
      return;
    }

    body.querySelector('.modal-body').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:13px;color:var(--text-mid)">
          <strong style="color:var(--text)">${confirmed.length}</strong> confirmed &nbsp;·&nbsp;
          <strong style="color:var(--text)">${pending.length}</strong> pending
        </div>
        <button class="btn btn-sm btn-ghost" onclick="downloadBookingsCSV(${eventId}, '${escHtml(eventTitle)}')">
          ↓ Download CSV
        </button>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Ref</th>
          <th>Name</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Qty</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${all.map(b => `
          <tr>
            <td style="font-family:monospace;font-size:12px;color:var(--purple)">#PB${String(b.id).padStart(5,'0')}</td>
            <td style="font-weight:600">${escHtml(b.customer_name)}</td>
            <td>${escHtml(b.customer_phone || '—')}</td>
            <td style="font-size:12px;color:var(--text-mid)">${escHtml(b.customer_email)}</td>
            <td>${b.quantity}</td>
            <td>${statusBadge(b.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    // Store for CSV download
    window._eventBookingsCache = { bookings: all, title: eventTitle };
  } catch (err) {
    body.querySelector('.modal-body').innerHTML = `<p style="color:var(--coral)">${escHtml(err.message || 'Failed to load bookings')}</p>`;
  }
}

function downloadBookingsCSV(eventId, eventTitle) {
  const data = window._eventBookingsCache;
  if (!data) return;
  const rows = [
    ['Ref', 'Name', 'Email', 'Phone', 'Qty', 'Status'],
    ...data.bookings.map(b => [
      `#PB${String(b.id).padStart(5,'0')}`,
      b.customer_name,
      b.customer_email,
      b.customer_phone || '',
      b.quantity,
      b.status
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookings-${eventTitle.replace(/[^a-z0-9]/gi,'-').toLowerCase()}.csv`;
  a.click();
}

function confirmDelete(id) {
  document.getElementById('confirm-delete-btn').onclick = () => deleteEvent(id);
  openAdminModal('delete-modal');
}

async function deleteEvent(id) {
  try {
    await apiFetch(`/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
    closeAdminModal('delete-modal');
    toast('Event deleted', 'success');
    loadAdminEvents();
  } catch (err) {
    toast(err.message || 'Failed to delete', 'error');
  }
}

// ---- BOOKINGS ----
async function loadAdminBookings() {
  const el = document.getElementById('bookings-table');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  const status = document.getElementById('bookings-status-filter').value;
  try {
    const params = status ? `?status=${status}` : '';
    const bookings = await apiFetch(`/api/bookings${params}`, { headers: authHeaders() });
    renderBookingsTable(bookings);
  } catch { el.innerHTML = '<div class="empty-state"><p>Failed to load bookings</p></div>'; }
}

function renderBookingsTable(bookings) {
  const el = document.getElementById('bookings-table');
  if (!bookings.length) {
    el.innerHTML = '<div class="empty-state"><p>No bookings found</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Ref</th>
        <th>Customer</th>
        <th>Event</th>
        <th class="hide-mobile">Date</th>
        <th>Qty</th>
        <th>Total</th>
        <th>Status</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>${bookings.map(b => `
        <tr class="clickable-row" onclick="viewBookingDetail(${b.id})" style="cursor:pointer">
          <td style="font-family:monospace;font-weight:700;color:var(--purple)">#PB${String(b.id).padStart(5,'0')}</td>
          <td>
            <div style="font-weight:600">${escHtml(b.customer_name)}</div>
            <div style="color:var(--text-light);font-size:11px">${escHtml(b.customer_email)}</div>
          </td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(b.event_title)}</td>
          <td class="hide-mobile">${formatDate(b.event_date)}</td>
          <td>${b.quantity}</td>
          <td><strong>${formatPrice(b.total_pence)}</strong></td>
          <td>${statusBadge(b.status)}</td>
          <td onclick="event.stopPropagation()">
            <div class="actions">
              <select class="btn btn-xs btn-ghost" onchange="updateBookingStatus(${b.id}, this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer">
                ${['pending','confirmed','cancelled','refunded'].map(s =>
                  `<option value="${s}" ${b.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
                ).join('')}
              </select>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteBooking(${b.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function updateBookingStatus(id, status) {
  try {
    await apiFetch(`/api/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }), headers: authHeaders() });
    toast('Booking updated', 'success');
    loadAdminBookings();
  } catch (err) {
    toast(err.message || 'Failed to update', 'error');
  }
}

async function deleteBooking(id) {
  if (!confirm('Permanently delete this booking? This cannot be undone.')) return;
  try {
    await apiFetch(`/api/bookings/${id}`, { method: 'DELETE' });
    toast('Booking deleted.');
    closeAdminModal('generic-modal');
    loadAdminBookings();
  } catch (err) {
    toast(err.message || 'Failed to delete booking.', 'error');
  }
}

// ---- CUSTOMERS ----
async function loadAdminCustomers() {
  const el = document.getElementById('customers-table');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  const search = document.getElementById('customers-search').value;
  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const customers = await apiFetch(`/api/customers${params}`, { headers: authHeaders() });
    renderCustomersTable(customers);
  } catch { el.innerHTML = '<div class="empty-state"><p>Failed to load customers</p></div>'; }
}

function renderCustomersTable(customers) {
  const el = document.getElementById('customers-table');
  if (!customers.length) {
    el.innerHTML = '<div class="empty-state"><p>No customers yet</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Name</th>
        <th>Email</th>
        <th class="hide-mobile">Phone</th>
        <th>Bookings</th>
        <th>Total Spent</th>
        <th class="hide-mobile">Joined</th>
      </tr></thead>
      <tbody>${customers.map(c => `
        <tr class="hoverable-row" onclick="openCustomerDetail(${c.id})" style="cursor:pointer">
          <td style="font-weight:600">${escHtml(c.name)}</td>
          <td style="color:var(--blue)">${escHtml(c.email)}</td>
          <td class="hide-mobile">${escHtml(c.phone || '—')}</td>
          <td>${c.total_bookings}</td>
          <td><strong>${formatPrice(c.total_spent)}</strong></td>
          <td class="hide-mobile" style="color:var(--text-light)">${formatDate(c.created_at?.slice(0,10))}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function openCustomerDetail(id) {
  // Ensure modal container exists
  let overlay = document.getElementById('customer-detail-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'customer-detail-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.onclick = (e) => { if (e.target === overlay) closeCustomerDetail(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal" style="max-width:720px;width:100%"><div class="modal-body" style="display:flex;align-items:center;justify-content:center;min-height:200px"><div class="spinner"></div></div></div>`;
  overlay.classList.remove('hidden');

  try {
    const c = await apiFetch(`/api/customers/${id}`);
    const totalUpcoming = c.upcomingBookings?.length || 0;
    const totalPast = c.pastBookings?.length || 0;

    overlay.innerHTML = `
      <div class="modal" style="max-width:720px;width:100%">
        <div class="modal-header">
          <div>
            <h2 style="margin:0">${escHtml(c.name)}</h2>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">Customer since ${formatDate(c.created_at?.slice(0,10))}</div>
          </div>
          <button class="modal-close" onclick="closeCustomerDetail()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>
        <div class="modal-body" style="max-height:80vh">

          <!-- Stats row -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
            <div class="crm-stat"><div class="crm-stat-label">Total Bookings</div><div class="crm-stat-value">${c.total_bookings}</div></div>
            <div class="crm-stat"><div class="crm-stat-label">Total Spent</div><div class="crm-stat-value">${formatPrice(c.total_spent)}</div></div>
            <div class="crm-stat"><div class="crm-stat-label">Upcoming</div><div class="crm-stat-value" style="color:${totalUpcoming > 0 ? 'var(--rose)' : 'inherit'}">${totalUpcoming}</div></div>
          </div>

          <!-- Edit details -->
          <div style="border:1.5px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:16px">Contact Details</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">Full Name</label>
                <input type="text" id="crd-name" value="${escHtml(c.name)}">
              </div>
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">Email</label>
                <input type="email" id="crd-email" value="${escHtml(c.email)}">
              </div>
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">Phone Number</label>
                <input type="text" id="crd-phone" value="${escHtml(c.phone || '')}" placeholder="e.g. 07700 900000">
              </div>
              <div class="form-group" style="margin:0">
                <label style="font-size:12px">Date Joined</label>
                <input type="text" value="${formatDate(c.created_at?.slice(0,10))}" disabled style="background:var(--bg);color:var(--text-light)">
              </div>
            </div>
            <div class="form-group" style="margin:12px 0 0">
              <label style="font-size:12px">Notes</label>
              <textarea id="crd-notes" rows="3" placeholder="Internal notes about this customer…">${escHtml(c.notes || '')}</textarea>
            </div>
            <div style="margin-top:12px;display:flex;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" onclick="saveCustomerDetail(${c.id})">Save Changes</button>
            </div>
          </div>

          <!-- Upcoming bookings -->
          <div style="margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:10px">
              Upcoming Bookings <span style="font-weight:400;color:var(--text-light)">(${totalUpcoming})</span>
            </div>
            ${totalUpcoming === 0
              ? `<div style="color:var(--text-light);font-size:13px;padding:12px;background:var(--bg);border-radius:8px">No upcoming bookings</div>`
              : c.upcomingBookings.map(b => renderCustomerBookingRow(b, true)).join('')
            }
          </div>

          <!-- Past bookings -->
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:10px">
              Past Bookings <span style="font-weight:400;color:var(--text-light)">(${totalPast})</span>
            </div>
            ${totalPast === 0
              ? `<div style="color:var(--text-light);font-size:13px;padding:12px;background:var(--bg);border-radius:8px">No past bookings</div>`
              : c.pastBookings.map(b => renderCustomerBookingRow(b, false)).join('')
            }
          </div>

        </div>
      </div>`;
  } catch (err) {
    overlay.innerHTML = `<div class="modal" style="max-width:480px"><div class="modal-body"><p>Failed to load customer details.</p></div></div>`;
  }
}

function renderCustomerBookingRow(b, upcoming) {
  const statusColour = { confirmed:'#065f46', pending:'#92400e', cancelled:'#991b1b' };
  const statusBg     = { confirmed:'#d1fae5', pending:'#fef3c7', cancelled:'#fee2e2' };
  const st = b.status || 'confirmed';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--bg);border-radius:10px;margin-bottom:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(b.event_title)}</div>
        <div style="font-size:12px;color:var(--text-light);margin-top:2px">${formatDate(b.event_date)} ${b.event_time ? '· ' + b.event_time : ''} ${b.event_location ? '· ' + escHtml(b.event_location) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:20px;background:${statusBg[st]||'#f3f4f6'};color:${statusColour[st]||'#374151'}">${st.charAt(0).toUpperCase()+st.slice(1)}</span>
        <span style="font-size:13px;font-weight:700">${formatPrice(b.total_pence)}</span>
        <span style="font-size:12px;color:var(--text-light)">${b.quantity} ticket${b.quantity !== 1 ? 's' : ''}</span>
      </div>
    </div>`;
}

function closeCustomerDetail() {
  const el = document.getElementById('customer-detail-overlay');
  if (el) el.classList.add('hidden');
}

async function saveCustomerDetail(id) {
  const name  = document.getElementById('crd-name').value.trim();
  const email = document.getElementById('crd-email').value.trim();
  const phone = document.getElementById('crd-phone').value.trim();
  const notes = document.getElementById('crd-notes').value;
  if (!name || !email) { toast('Name and email are required', 'error'); return; }
  try {
    await apiFetch(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify({ name, email, phone, notes }) });
    toast('Customer updated');
    loadAdminCustomers();
  } catch (err) { toast(err.message || 'Failed to save', 'error'); }
}

function debouncedCustomerSearch() {
  clearTimeout(customerSearchTimeout);
  customerSearchTimeout = setTimeout(loadAdminCustomers, 350);
}

// ---- PAYMENTS TAB SWITCHING ----
function switchPaymentsTab(tab) {
  const nav = document.getElementById('payments-sub-nav');
  if (nav) {
    nav.querySelectorAll('.design-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }
  document.getElementById('payments-subtab-transactions').style.display = tab === 'transactions' ? '' : 'none';
  document.getElementById('payments-subtab-settings').style.display    = tab === 'settings'     ? '' : 'none';
  if (tab === 'settings') loadPaymentsSettings();
}

async function loadPaymentsSettings() {
  const el = document.getElementById('payments-subtab-settings');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const s = await apiFetch('/api/payments/provider-settings');
    el.innerHTML = `
      <div class="pay-settings-wrap">
        <p class="pay-settings-desc">Enable one or both providers. Customers will see a choice if both are active.</p>

        <div class="pay-provider-card">
          <div class="pay-provider-header">
            <div class="pay-provider-logo stripe-logo">
              <svg viewBox="0 0 60 26" fill="none" height="20"><path d="M26.4 11.1c0-1.5 1.2-2.1 3.2-2.1 2.9 0 6.5.9 9.4 2.5V4.3C36.2 2.9 33.1 2 30 2c-7.6 0-12.7 4-12.7 10.7 0 10.4 14.3 8.7 14.3 13.2 0 1.8-1.5 2.3-3.6 2.3-3.1 0-7.2-1.3-10.4-3v7.2c3.5 1.5 7 2.1 10.4 2.1 7.8 0 13.2-3.9 13.2-10.7C41.2 13 26.4 15 26.4 11.1z" fill="#635BFF"/></svg>
              <span>Stripe</span>
            </div>
            <label class="pay-toggle">
              <input type="checkbox" id="ps-stripe-enabled" ${s.stripe_enabled === 'true' ? 'checked' : ''}>
              <span class="pay-toggle-track"><span class="pay-toggle-thumb"></span></span>
            </label>
          </div>
          <div class="pay-provider-body">
            <div class="form-group">
              <label>Publishable Key</label>
              <input type="text" id="ps-stripe-pk" placeholder="pk_live_…" value="${escHtml(s.stripe_publishable_key || '')}">
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input type="password" id="ps-stripe-sk" placeholder="sk_live_…" value="${escHtml(s.stripe_secret_key || '')}">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>Webhook Secret</label>
              <input type="password" id="ps-stripe-ws" placeholder="whsec_…" value="${escHtml(s.stripe_webhook_secret || '')}">
              <p class="pay-hint">Webhook endpoint: <code>${location.origin}/api/payments/webhook</code></p>
            </div>
          </div>
        </div>

        <div class="pay-provider-card">
          <div class="pay-provider-header">
            <div class="pay-provider-logo sumup-logo">
              <svg viewBox="0 0 24 24" height="20" fill="#00D66B"><circle cx="12" cy="12" r="12"/><path d="M7 12h10M12 7v10" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
              <span>SumUp</span>
            </div>
            <label class="pay-toggle">
              <input type="checkbox" id="ps-sumup-enabled" ${s.sumup_enabled === 'true' ? 'checked' : ''}>
              <span class="pay-toggle-track"><span class="pay-toggle-thumb"></span></span>
            </label>
          </div>
          <div class="pay-provider-body">
            <div class="form-group">
              <label>API Key</label>
              <input type="password" id="ps-sumup-key" placeholder="sup_sk_…" value="${escHtml(s.sumup_api_key || '')}">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>Merchant Code</label>
              <input type="text" id="ps-sumup-merchant" placeholder="MXXXXX" value="${escHtml(s.sumup_merchant_code || '')}">
            </div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="savePaymentSettings()">Save Payment Settings</button>
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Failed to load payment settings</p></div>';
  }
}

async function savePaymentSettings() {
  const body = {
    stripe_enabled:       document.getElementById('ps-stripe-enabled').checked ? 'true' : 'false',
    stripe_publishable_key: document.getElementById('ps-stripe-pk').value.trim(),
    stripe_secret_key:    document.getElementById('ps-stripe-sk').value.trim(),
    stripe_webhook_secret: document.getElementById('ps-stripe-ws').value.trim(),
    sumup_enabled:        document.getElementById('ps-sumup-enabled').checked ? 'true' : 'false',
    sumup_api_key:        document.getElementById('ps-sumup-key').value.trim(),
    sumup_merchant_code:  document.getElementById('ps-sumup-merchant').value.trim()
  };
  try {
    await apiFetch('/api/payments/provider-settings', { method: 'POST', body: JSON.stringify(body) });
    toast('Payment settings saved', 'success');
  } catch (err) {
    toast('Failed to save settings', 'error');
  }
}

// ---- PAYMENTS ----
async function loadAdminPayments() {
  document.getElementById('payment-stats-grid').innerHTML = '<div class="stat-card loading"><div class="spinner"></div></div>'.repeat(3);
  document.getElementById('payments-table').innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  document.getElementById('revenue-by-event').innerHTML = '';

  try {
    const [summary, payments] = await Promise.all([
      apiFetch('/api/payments/summary', { headers: authHeaders() }),
      apiFetch('/api/payments', { headers: authHeaders() })
    ]);

    renderPaymentStats(summary);
    renderRevenueByEvent(summary.byEvent);
    renderPaymentsTable(payments);
  } catch (err) {
    toast('Failed to load payments', 'error');
  }
}

function renderPaymentStats(summary) {
  const thisMonth = summary.byMonth?.[0]?.total || 0;
  const lastMonth = summary.byMonth?.[1]?.total || 0;
  const txCount = summary.byMonth?.reduce((acc, m) => acc + m.count, 0) || 0;

  document.getElementById('payment-stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value">${formatPrice(summary.total)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">This Month</div>
      <div class="stat-value">${formatPrice(thisMonth)}</div>
      <div class="stat-sub">${lastMonth > 0 ? `vs ${formatPrice(lastMonth)} last month` : 'No prior month data'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Transactions</div>
      <div class="stat-value">${txCount}</div>
    </div>`;
}

function renderRevenueByEvent(events) {
  const el = document.getElementById('revenue-by-event');
  if (!events || !events.length) {
    el.innerHTML = '<div class="empty-state"><p>No data yet</p></div>';
    return;
  }
  const max = Math.max(...events.map(e => e.revenue));
  el.innerHTML = `<div class="chart-container"><div class="bar-chart">${events.map(e => `
    <div class="bar-row">
      <div class="bar-label" style="width:80px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.title)}">${escHtml(e.title)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${max > 0 ? (e.revenue/max*100) : 0}%"></div></div>
      <div class="bar-value">${formatPrice(e.revenue)}</div>
    </div>`).join('')}</div></div>`;
}

function renderPaymentsTable(payments) {
  const el = document.getElementById('payments-table');
  if (!payments.length) {
    el.innerHTML = '<div class="empty-state"><p>No transactions yet</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Date</th>
        <th>Customer</th>
        <th>Event</th>
        <th>Amount</th>
        <th>Status</th>
      </tr></thead>
      <tbody>${payments.map(p => `
        <tr>
          <td style="color:var(--text-light);white-space:nowrap">${p.created_at?.slice(0,10)}</td>
          <td>
            <div style="font-weight:600">${escHtml(p.customer_name)}</div>
            <div style="color:var(--text-light);font-size:11px">${escHtml(p.customer_email)}</div>
          </td>
          <td class="hide-mobile">${escHtml(p.event_title)}</td>
          <td><strong style="color:var(--green)">${formatPrice(p.amount_pence)}</strong></td>
          <td>${statusBadge(p.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ---- MODALS ----
function openAdminModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeAdminModal(id) { document.getElementById(id).classList.add('hidden'); document.body.style.overflow = ''; }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  }
});

// ---- HELPERS ----
async function apiFetch(url, opts = {}) {
  const autoAuth = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  // Destructure headers out of opts so the ...restOpts spread below
  // doesn't override the merged headers object with opts.headers again
  const { headers: extraHeaders, ...restOpts } = opts;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...autoAuth, ...extraHeaders },
    ...restOpts
  });
  if (res.status === 401) { handleUnauth(); throw Object.assign(new Error('Unauthorised'), { status: 401 }); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function authHeaders() {
  return { Authorization: `Bearer ${authToken}` };
}

function handleUnauth() {
  authToken = null;
  localStorage.removeItem('pb_admin_token');
  location.reload();
}

function formatPrice(pence) {
  if (!pence && pence !== 0) return '—';
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + (str.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(status) {
  const map = {
    confirmed: 'badge-green',
    pending: 'badge-amber',
    cancelled: 'badge-red',
    refunded: 'badge-blue',
    succeeded: 'badge-green',
    failed: 'badge-red'
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// =============================================
// FAQ TAB
// =============================================

async function loadAdminFAQs() {
  const el = document.getElementById('content-faq');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const faqs = await apiFetch('/api/faqs/all');
    renderFAQTab(faqs);
  } catch {
    toast('Failed to load FAQs', 'error');
  }
}

function renderFAQTab(faqs) {
  const el = document.getElementById('content-faq');
  el.innerHTML = `
    <div class="toolbar">
      <p style="font-size:13px;color:var(--text-light);font-weight:600;">${faqs.length} question${faqs.length !== 1 ? 's' : ''}</p>
      <button class="btn btn-primary btn-sm" onclick="openFAQForm()">+ Add Question</button>
    </div>
    <div class="card">
      ${faqs.length === 0
        ? '<div class="empty-state"><p>No FAQs yet. Add your first question!</p></div>'
        : `<table class="data-table">
            <thead><tr>
              <th>Question</th>
              <th>Status</th>
              <th>Order</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>${faqs.map(f => `
              <tr id="faq-row-${f.id}">
                <td>
                  <div style="font-weight:700;margin-bottom:3px;">${escHtml(f.question)}</div>
                  <div style="font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">${escHtml(f.answer)}</div>
                </td>
                <td>
                  <button class="badge ${f.is_active ? 'badge-green' : 'badge-gray'}"
                          onclick="toggleFAQActive(${f.id}, ${f.is_active})"
                          style="cursor:pointer;border:none;">
                    ${f.is_active ? 'Visible' : 'Hidden'}
                  </button>
                </td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn btn-xs btn-ghost" onclick="reorderFAQ(${f.id},'up')" title="Move up">↑</button>
                    <button class="btn btn-xs btn-ghost" onclick="reorderFAQ(${f.id},'down')" title="Move down">↓</button>
                  </div>
                </td>
                <td>
                  <div class="actions">
                    <button class="btn btn-ghost btn-xs" onclick="openFAQForm(${f.id})">Edit</button>
                    <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteFAQ(${f.id})">Delete</button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>`}
    </div>`;
}

function openFAQForm(id = null) {
  document.getElementById('faq-form-title').textContent = id ? 'Edit Question' : 'Add Question';
  if (id) {
    apiFetch(`/api/faqs/all`).then(faqs => {
      const faq = faqs.find(f => f.id === id);
      renderFAQForm(faq);
    });
  } else {
    renderFAQForm(null);
  }
  openAdminModal('faq-form-modal');
}

function renderFAQForm(faq = null) {
  document.getElementById('faq-form-body').innerHTML = `
    <div class="form-group">
      <label>Question *</label>
      <input type="text" id="ff-question" value="${escHtml(faq?.question || '')}" placeholder="e.g. Do I need any experience?">
    </div>
    <div class="form-group">
      <label>Answer *</label>
      <textarea id="ff-answer" rows="5" placeholder="Type your answer here…">${escHtml(faq?.answer || '')}</textarea>
    </div>
    <div style="display:flex;gap:12px;margin-top:4px;">
      <button class="btn btn-ghost btn-full" onclick="closeAdminModal('faq-form-modal')">Cancel</button>
      <button class="btn btn-primary btn-full" onclick="saveFAQ(${faq?.id || 'null'})">${faq ? 'Save Changes' : 'Add Question'}</button>
    </div>`;
}

async function saveFAQ(id) {
  const question = document.getElementById('ff-question').value.trim();
  const answer   = document.getElementById('ff-answer').value.trim();
  if (!question || !answer) { toast('Please fill in both fields', 'error'); return; }

  try {
    if (id) {
      await apiFetch(`/api/faqs/${id}`, { method: 'PUT', body: JSON.stringify({ question, answer }) });
      toast('FAQ updated!', 'success');
    } else {
      await apiFetch('/api/faqs', { method: 'POST', body: JSON.stringify({ question, answer }) });
      toast('FAQ added!', 'success');
    }
    closeAdminModal('faq-form-modal');
    loadAdminFAQs();
  } catch (err) {
    toast(err.message || 'Failed to save FAQ', 'error');
  }
}

async function toggleFAQActive(id, current) {
  try {
    await apiFetch(`/api/faqs/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: current ? 0 : 1 }) });
    loadAdminFAQs();
  } catch {
    toast('Failed to update FAQ', 'error');
  }
}

async function reorderFAQ(id, direction) {
  try {
    await apiFetch('/api/faqs/reorder', { method: 'PATCH', body: JSON.stringify({ id, direction }) });
    loadAdminFAQs();
  } catch {
    toast('Failed to reorder', 'error');
  }
}

async function deleteFAQ(id) {
  if (!confirm('Delete this FAQ?')) return;
  try {
    await apiFetch(`/api/faqs/${id}`, { method: 'DELETE' });
    toast('FAQ deleted', 'success');
    loadAdminFAQs();
  } catch {
    toast('Failed to delete FAQ', 'error');
  }
}

// =============================================
// DESIGN TAB
// =============================================
let designSettings = {};

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

async function loadDesign() {
  const el = document.getElementById('content-design');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    designSettings = await apiFetch('/api/design/settings');
    renderDesignPanel();
  } catch {
    toast('Failed to load design settings', 'error');
  }
}

function renderDesignPanel() {
  const s = designSettings;

  document.getElementById('content-design').innerHTML = `

    <!-- Tab Nav -->
    <div class="design-tabs-nav">
      <button class="design-tab-btn active" onclick="switchDesignTab('images')" data-tab="images">
        <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 13l4-4 3 3 3-3 6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Images
      </button>
      <button class="design-tab-btn" onclick="switchDesignTab('colours')" data-tab="colours">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 3c1.5 2 3 3.5 3 5.5a3 3 0 01-6 0C7 6.5 8.5 5 10 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        Colours
      </button>
      <button class="design-tab-btn" onclick="switchDesignTab('trust')" data-tab="trust">
        <svg viewBox="0 0 20 20" fill="none"><path d="M10 2l1.8 4.8H17l-4.2 3.1 1.6 4.8L10 12l-4.4 2.7 1.6-4.8L3 6.8h5.2L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        Trust Cards
      </button>
      <button class="design-tab-btn" onclick="switchDesignTab('social')" data-tab="social">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="15" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="10" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="16" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 9l6-4M7 11l6 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Social Media
      </button>
      <button class="design-tab-btn" onclick="switchDesignTab('fonts')" data-tab="fonts">
        <svg viewBox="0 0 20 20" fill="none"><path d="M4 15l4-10 4 10M5.5 11.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6c.5-1 1.5-1.5 2.5-1.5S18 5 18 6.5c0 2-2 3-4 5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Fonts
      </button>
    </div>

    <!-- IMAGES TAB -->
    <div class="design-tab-panel" id="dtab-images">
      <div class="design-images-grid">
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Header Logo</h3></div>
          <div class="design-card-body">${renderDropZone('logo_url', s.logo_url)}</div>
        </div>
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Footer Logo</h3></div>
          <div class="design-card-body">${renderDropZone('footer_logo_url', s.footer_logo_url)}</div>
        </div>
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Hero Background</h3></div>
          <div class="design-card-body">${renderDropZone('hero_image_url', s.hero_image_url)}</div>
        </div>
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">About Section Image</h3></div>
          <div class="design-card-body">${renderDropZone('about_image_url', s.about_image_url)}</div>
        </div>
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">About Page Image</h3></div>
          <div class="design-card-body">${renderDropZone('aboutpage_image_url', s.aboutpage_image_url)}</div>
        </div>
      </div>
      <div class="design-card" style="margin-top:24px">
        <div class="design-card-header">
          <h3 class="design-card-title">About Banner Images</h3>
          <p class="design-card-desc">Images that slide automatically on the About section. Upload multiple for a moving banner.</p>
        </div>
        <div id="about-banner-admin-grid" class="gallery-admin-grid"></div>
        <div id="about-banner-drop-zone" class="gallery-drop-zone" onclick="triggerAboutBannerUpload()">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          <p>Drop images here or click to upload</p>
        </div>
        <input type="file" id="about-banner-file-input" accept="image/*" multiple style="display:none" onchange="handleAboutBannerFileInput(this)">
      </div>
      <div class="design-card" style="margin-top:24px">
        <div class="design-card-header">
          <h3 class="design-card-title">Gallery Images</h3>
          <p class="design-card-desc">Images displayed on the public gallery page. Drag &amp; drop or click to upload. Supports multiple images.</p>
        </div>
        <div id="gallery-admin-grid" class="gallery-admin-grid"></div>
        <div id="gallery-drop-zone" class="gallery-drop-zone" onclick="triggerGalleryUpload()">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
          <p>Drop images here or click to upload</p>
        </div>
        <input type="file" id="gallery-file-input" accept="image/*" multiple style="display:none" onchange="handleGalleryFileInput(this)">
      </div>
    </div>

    <!-- COLOURS TAB -->
    <div class="design-tab-panel hidden" id="dtab-colours">
      <div class="design-centred-wrap">
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Brand Colours</h3></div>
          <div class="design-card-body">
            ${renderColorField('color_rose',      'Primary Colour',  s.color_rose      || '#C4748A')}
            ${renderColorField('color_rose_deep', 'Hover / Buttons', s.color_rose_deep || '#A85D72')}
            ${renderColorField('color_rose_dark', 'Dark Accent',     s.color_rose_dark || '#8A4560')}
            ${renderColorField('color_bg',        'Page Background', s.color_bg        || '#FDF8F9')}
            ${renderColorField('color_text_dark', 'Heading Text',    s.color_text_dark || '#2C2028')}
          </div>
        </div>
        <div class="design-card">
          <div class="design-card-header">
            <h3 class="design-card-title">Section Backgrounds</h3>
            <span class="design-hint">Background colour for each section on the public site</span>
          </div>
          <div class="design-card-body">
            ${renderColorField('color_bg_about',  'About Section',   s.color_bg_about  || '#ffffff')}
            ${renderColorField('color_bg_trust',  'Features / Trust Strip', s.color_bg_trust  || '#F5F0EB')}
            ${renderColorField('color_bg_events', 'Events Section',  s.color_bg_events || '#FDF8F9')}
            ${renderColorField('color_bg_social', 'Social Media Section', s.color_bg_social || '#F5F0EB')}
            ${renderColorField('color_bg_footer', 'Footer',          s.color_bg_footer || '#2C0F18')}
          </div>
        </div>
        <div class="design-card">
          <div class="design-card-header">
            <h3 class="design-card-title">Banner Gradients</h3>
            <span class="design-hint">Gradient colours used on all page header banners</span>
          </div>
          <div class="design-card-body">
            ${renderColorField('color_banner_start', 'Start (dark end)',  s.color_banner_start || '#2C0F18')}
            ${renderColorField('color_banner_mid',   'Middle',            s.color_banner_mid   || '#6B2D42')}
            ${renderColorField('color_banner_end',   'End (light end)',   s.color_banner_end   || '#C4748A')}
          </div>
        </div>
      </div>
    </div>

    <!-- TRUST CARDS TAB -->
    <div class="design-tab-panel hidden" id="dtab-trust">
      <div class="trust-cards-grid">
        ${[1,2,3,4].map(i => `
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Card ${i}</h3>
            </div>
            <div class="design-card-body">
              ${renderIconPicker(i, s[`trust_${i}_icon`] || '')}
              <div class="form-group" style="margin-top:14px;">
                <label>Title</label>
                <input type="text" id="ds-trust_${i}_title" value="${escHtml(s[`trust_${i}_title`] || '')}">
              </div>
              <div class="form-group">
                <label>Subtitle</label>
                <input type="text" id="ds-trust_${i}_sub" value="${escHtml(s[`trust_${i}_sub`] || '')}">
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- SOCIAL MEDIA TAB -->
    <div class="design-tab-panel hidden" id="dtab-social">
      <div class="design-centred-wrap">
        <div class="design-card">
          <div class="design-card-header">
            <h3 class="design-card-title">Social Media Section</h3>
            <span class="design-hint">Displayed above the footer on every page</span>
          </div>
          <div class="design-card-body">
            <div class="form-group">
              <label>Section Title</label>
              <input type="text" id="ds-social_title" value="${escHtml(s.social_title || 'Social Media')}">
            </div>
            <div class="form-group">
              <label>Social Links <span class="design-hint">Hidden automatically if no links are added</span></label>
              <div id="social-links-list" class="social-links-editor">
                ${renderSocialLinksList(s.social_links)}
              </div>
              <button type="button" class="btn-add-item" onclick="addSocialLink()">
                <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                Add social link
              </button>
            </div>
            <input type="hidden" id="ds-social_links" value="${escHtml(s.social_links || '[]')}">
          </div>
        </div>
      </div>
    </div>

    <!-- FONTS TAB -->
    <div class="design-tab-panel hidden" id="dtab-fonts">
      <div class="design-centred-wrap">
        <div class="design-card">
          <div class="design-card-header">
            <h3 class="design-card-title">Typography</h3>
            <span class="design-hint">Choose Google Fonts for each element. Changes apply site-wide.</span>
          </div>
          <div class="design-card-body" id="font-pickers-wrap">
            <div class="loading-state" style="padding:40px 0"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- SAVE BAR -->
    <div class="design-save-bar">
      <button class="btn btn-primary" onclick="saveDesign()" id="design-save-btn">Save All Changes</button>
    </div>`;

  initDropZones();
  renderAboutBannerGrid();
  initAboutBannerDropZone();
  renderGalleryGrid();
  initGalleryDropZone();
}

function switchDesignTab(tab) {
  const container = document.getElementById('content-design');
  container.querySelectorAll('.design-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  container.querySelectorAll('.design-tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `dtab-${tab}`);
  });
  if (tab === 'fonts') initFontTab();
}

// ---- FONT PICKER ----
const ADMIN_FONTS = [
  { name: 'Nunito',              cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Inter',               cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Roboto',              cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Open Sans',           cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Poppins',             cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Montserrat',          cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Lato',                cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Raleway',             cat: 'sans',    group: 'Sans Serif'   },
  { name: 'DM Sans',             cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Plus Jakarta Sans',   cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Outfit',              cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Figtree',             cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Work Sans',           cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Quicksand',           cat: 'sans',    group: 'Sans Serif'   },
  { name: 'Playfair Display',    cat: 'serif',   group: 'Serif'        },
  { name: 'Merriweather',        cat: 'serif',   group: 'Serif'        },
  { name: 'Lora',                cat: 'serif',   group: 'Serif'        },
  { name: 'Cormorant Garamond',  cat: 'serif',   group: 'Serif'        },
  { name: 'DM Serif Display',    cat: 'serif',   group: 'Serif'        },
  { name: 'EB Garamond',         cat: 'serif',   group: 'Serif'        },
  { name: 'Oswald',              cat: 'display', group: 'Display'      },
  { name: 'Bebas Neue',          cat: 'display', group: 'Display'      },
  { name: 'Anton',               cat: 'display', group: 'Display'      },
  { name: 'Righteous',           cat: 'display', group: 'Display'      },
  { name: 'Dancing Script',      cat: 'script',  group: 'Script'       },
  { name: 'Pacifico',            cat: 'script',  group: 'Script'       },
  { name: 'Caveat',              cat: 'script',  group: 'Script'       },
  { name: 'Satisfy',             cat: 'script',  group: 'Script'       },
  { name: 'Great Vibes',         cat: 'script',  group: 'Script'       },
  { name: 'Lobster',             cat: 'script',  group: 'Script'       },
];

function adminFontStack(name) {
  const f = ADMIN_FONTS.find(f => f.name === name);
  if (!f) return `'${name}', sans-serif`;
  if (f.cat === 'script')  return `'${name}', cursive`;
  if (f.cat === 'serif')   return `'${name}', serif`;
  return `'${name}', sans-serif`;
}

let fontsLoaded = false;
function initFontTab() {
  const wrap = document.getElementById('font-pickers-wrap');
  if (!wrap || wrap.dataset.ready) return;
  wrap.dataset.ready = '1';

  // Load all fonts in one batch
  if (!fontsLoaded) {
    fontsLoaded = true;
    const families = ADMIN_FONTS.map(f => f.name.replace(/ /g, '+') + ':wght@400;700').join('&family=');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);
  }

  const s = designSettings;
  const roles = [
    { key: 'font_body',           label: 'Body / Paragraph',          preview: 'The quick brown fox jumps over the lazy dog. 0123456789' },
    { key: 'font_h1',             label: 'H1 — Page Title',            preview: 'Creative Events Studio' },
    { key: 'font_hero_highlight', label: 'Hero Highlight (& Celebrate)', preview: '& Celebrate' },
    { key: 'font_h2',             label: 'H2 — Section Heading',       preview: 'About This Event' },
    { key: 'font_h3',             label: 'H3 — Card Title',            preview: 'Sunset Watercolours' },
    { key: 'font_h4',             label: 'H4 — Sub-heading',           preview: 'What\'s Included' },
  ];

  wrap.innerHTML = roles.map(r => {
    const current = s[r.key] || 'Nunito';
    return `
      <div class="fp-field" id="fpf-${r.key}">
        <div class="fp-field-label">${r.label}</div>
        <div class="fp-picker" id="fpp-${r.key}">
          <button type="button" class="fp-trigger" onclick="toggleFontPicker('${r.key}')"
                  id="fptrig-${r.key}" style="font-family:${adminFontStack(current)}">
            <span id="fptrig-name-${r.key}">${escHtml(current)}</span>
            <svg viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="fp-dropdown hidden" id="fpdd-${r.key}">
            <div class="fp-search-wrap">
              <svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M15 15l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              <input type="text" class="fp-search" placeholder="Search fonts…" oninput="filterFontOptions('${r.key}', this.value)">
            </div>
            <div class="fp-list" id="fplist-${r.key}">
              ${renderFontOptions(r.key, current)}
            </div>
          </div>
        </div>
        <div class="fp-preview" id="fpprev-${r.key}" style="font-family:${adminFontStack(current)}">${r.preview}</div>
        <input type="hidden" id="ds-${r.key}" value="${escHtml(current)}">
      </div>`;
  }).join('<div class="fp-divider"></div>');

  // Close dropdowns when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.fp-picker')) closeFontDropdowns();
  });
}

function renderFontOptions(role, selected) {
  const groups = [...new Set(ADMIN_FONTS.map(f => f.group))];
  return groups.map(group => {
    const fonts = ADMIN_FONTS.filter(f => f.group === group);
    return `
      <div class="fp-group-label">${group}</div>
      ${fonts.map(f => `
        <div class="fp-option${f.name === selected ? ' selected' : ''}"
             style="font-family:${adminFontStack(f.name)}"
             onclick="pickFont('${role}', '${f.name}')">
          ${escHtml(f.name)}
        </div>`).join('')}`;
  }).join('');
}

function toggleFontPicker(role) {
  const dd = document.getElementById(`fpdd-${role}`);
  if (!dd) return;
  const isOpen = !dd.classList.contains('hidden');
  closeFontDropdowns();
  if (!isOpen) {
    dd.classList.remove('hidden');
    dd.querySelector('.fp-search')?.focus();
  }
}

function closeFontDropdowns() {
  document.querySelectorAll('.fp-dropdown').forEach(d => d.classList.add('hidden'));
}

function filterFontOptions(role, query) {
  const list = document.getElementById(`fplist-${role}`);
  if (!list) return;
  const q = query.toLowerCase();
  list.querySelectorAll('.fp-option').forEach(opt => {
    opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  list.querySelectorAll('.fp-group-label').forEach(label => {
    const next = label.nextElementSibling;
    const hasVisible = [...label.parentElement.querySelectorAll('.fp-option')].some(
      o => o.style.display !== 'none' && label.compareDocumentPosition(o) & 4
    );
    label.style.display = hasVisible ? '' : 'none';
  });
}

function pickFont(role, fontName) {
  // Update hidden input
  const input = document.getElementById(`ds-${role}`);
  if (input) input.value = fontName;
  // Update trigger button
  const trig = document.getElementById(`fptrig-${role}`);
  const trigName = document.getElementById(`fptrig-name-${role}`);
  if (trig) trig.style.fontFamily = adminFontStack(fontName);
  if (trigName) trigName.textContent = fontName;
  // Update preview
  const preview = document.getElementById(`fpprev-${role}`);
  if (preview) preview.style.fontFamily = adminFontStack(fontName);
  // Update selected state
  const list = document.getElementById(`fplist-${role}`);
  if (list) {
    list.querySelectorAll('.fp-option').forEach(opt => {
      opt.classList.toggle('selected', opt.textContent.trim() === fontName);
    });
  }
  closeFontDropdowns();
}

// ---- WHAT'S INCLUDED LIST ----
function renderIncludedItemsList(jsonStr) {
  let items = [];
  try { items = JSON.parse(jsonStr || '[]'); } catch {}
  if (!items.length) {
    items = [
      'All materials and tools provided',
      'Step-by-step instructor guidance',
      'Drinks included throughout the session',
      'Small group setting — max {capacity} people',
      'Take your finished creation home',
    ];
  }
  return items.map(text => renderIncludedItemRow(text)).join('');
}

function renderIncludedItemRow(text = '') {
  return `
    <div class="included-item-row">
      <svg class="included-drag-handle" viewBox="0 0 20 20" fill="none">
        <path d="M7 7h6M7 10h6M7 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input type="text" class="included-item-input" value="${escHtml(text)}"
             placeholder="e.g. All materials provided" oninput="syncIncludedItems()">
      <button type="button" class="included-item-remove" onclick="removeIncludedItem(this)" title="Remove item">
        <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`;
}

function addIncludedItem() {
  const list = document.getElementById('included-items-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderIncludedItemRow(''));
  syncIncludedItems();
  list.lastElementChild.querySelector('input').focus();
}

function removeIncludedItem(btn) {
  btn.closest('.included-item-row').remove();
  syncIncludedItems();
}

function syncIncludedItems() {
  const inputs = document.querySelectorAll('.included-item-input');
  const items  = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  const hidden = document.getElementById('ds-included_items');
  if (hidden) hidden.value = JSON.stringify(items);
}

// ---- SOCIAL LINKS EDITOR ----
const SOCIAL_PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  twitter:   'X (Twitter)',
  pinterest: 'Pinterest',
  linkedin:  'LinkedIn',
  spotify:   'Spotify',
};

function renderSocialLinksList(jsonStr) {
  let links = [];
  try { links = JSON.parse(jsonStr || '[]'); } catch {}
  return links.map(({ platform, url }) => renderSocialLinkRow(platform, url)).join('');
}

function renderSocialLinkRow(platform = 'instagram', url = '') {
  const options = Object.entries(SOCIAL_PLATFORM_LABELS).map(([val, label]) =>
    `<option value="${val}"${val === platform ? ' selected' : ''}>${label}</option>`
  ).join('');
  return `
    <div class="social-link-row">
      <select class="social-link-platform" onchange="syncSocialLinks()">${options}</select>
      <input type="text" class="social-link-url" value="${escHtml(url)}"
             placeholder="https://..." oninput="syncSocialLinks()">
      <button type="button" class="included-item-remove" onclick="removeSocialLink(this)" title="Remove">
        <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`;
}

function addSocialLink() {
  const list = document.getElementById('social-links-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderSocialLinkRow('instagram', ''));
  syncSocialLinks();
  list.lastElementChild.querySelector('input').focus();
}

function removeSocialLink(btn) {
  btn.closest('.social-link-row').remove();
  syncSocialLinks();
}

function syncSocialLinks() {
  const rows  = document.querySelectorAll('.social-link-row');
  const links = Array.from(rows).map(row => ({
    platform: row.querySelector('.social-link-platform').value,
    url:      row.querySelector('.social-link-url').value.trim(),
  })).filter(l => l.url);
  const hidden = document.getElementById('ds-social_links');
  if (hidden) hidden.value = JSON.stringify(links);
}

// ---- ICON PICKER ----
function renderIconPicker(cardNum, selectedIcon) {
  return `
    <div class="icon-picker-label">Icon</div>
    <div class="icon-picker" id="icon-picker-${cardNum}">
      ${Object.keys(TRUST_ICONS).map(key => `
        <button type="button" class="icon-picker-btn${key === selectedIcon ? ' selected' : ''}"
                onclick="selectTrustIcon(${cardNum}, '${key}')" title="${key}">
          ${TRUST_ICONS[key]}
        </button>`).join('')}
    </div>
    <input type="hidden" id="ds-trust_${cardNum}_icon" value="${escHtml(selectedIcon)}">`;
}

function selectTrustIcon(cardNum, key) {
  const input = document.getElementById(`ds-trust_${cardNum}_icon`);
  if (input) input.value = key;
  document.querySelectorAll(`#icon-picker-${cardNum} .icon-picker-btn`).forEach(btn => {
    btn.classList.toggle('selected', btn.title === key);
  });
}

// ---- COLOUR FIELDS ----
function renderColorField(key, label, value) {
  return `
    <div class="color-field">
      <label class="color-swatch-wrap" title="Click to change colour">
        <div class="color-swatch" id="swatch-${key}" style="background:${escHtml(value)}"></div>
        <input type="color" id="ds-${key}" value="${escHtml(value)}" class="color-picker-input"
               oninput="onColorInput('${key}', this.value)">
      </label>
      <div class="color-field-info">
        <div class="color-field-label">${label}</div>
        <input type="text" class="color-hex-input" id="hex-${key}" value="${escHtml(value)}"
               maxlength="7" spellcheck="false" placeholder="#000000"
               oninput="onHexInput('${key}', this.value)">
      </div>
    </div>`;
}

function onColorInput(key, value) {
  document.getElementById(`swatch-${key}`).style.background = value;
  document.getElementById(`hex-${key}`).value = value;
}

function onHexInput(key, raw) {
  // Auto-prepend # if missing
  let hex = raw.startsWith('#') ? raw : '#' + raw;
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById(`swatch-${key}`).style.background = hex;
    document.getElementById(`ds-${key}`).value = hex;
  }
}

// ---- DROP ZONES ----
function renderDropZone(key, currentUrl) {
  const hasImage = !!currentUrl;
  const preview  = hasImage
    ? `<img src="${escHtml(currentUrl)}" alt="Preview">`
    : `<div class="dz-empty-label">No image</div>`;

  return `
    <div class="drop-zone" id="dz-${key}" data-key="${key}">
      <div class="dz-inner">
        <div class="dz-preview" id="dzp-${key}">${preview}</div>
        <div class="dz-info">
          <div class="dz-info-main">
            Drop an image here or
            <button class="dz-browse" onclick="triggerFileInput('${key}')">browse</button>
          </div>
          <div class="dz-info-sub">PNG, JPG, SVG — max 5 MB</div>
          ${hasImage ? `<button class="dz-remove" onclick="removeDesignImage('${key}')">Remove image</button>` : ''}
        </div>
      </div>
      <input type="file" id="fi-${key}" accept="image/*" style="display:none"
             onchange="handleFileInput(event,'${key}')">
    </div>`;
}

function initDropZones() {
  document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) uploadDesignImage(file, zone.dataset.key);
    });
  });
}

function triggerFileInput(key) {
  document.getElementById(`fi-${key}`).click();
}

// ---- ABOUT BANNER IMAGES ----
async function renderAboutBannerGrid() {
  const grid = document.getElementById('about-banner-admin-grid');
  if (!grid) return;
  const settings = await fetch('/api/design/settings', {
    headers: { Authorization: `Bearer ${authToken}` }
  }).then(r => r.json());
  let images = [];
  try { images = JSON.parse(settings.about_banner_images || '[]'); } catch {}
  if (!images.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = images.map((url, i) => `
    <div class="gallery-admin-item">
      <img src="${escHtml(url)}" alt="Banner image ${i + 1}">
      <button class="gallery-admin-remove" onclick="removeAboutBannerImage(${i})" title="Remove">✕</button>
    </div>`).join('');
}

async function uploadAboutBannerImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/design/upload', { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: fd });
  const data = await res.json();
  if (!data.url) throw new Error('Upload failed');
  const settings = await fetch('/api/design/settings', { headers: { Authorization: `Bearer ${authToken}` } }).then(r => r.json());
  let images = [];
  try { images = JSON.parse(settings.about_banner_images || '[]'); } catch {}
  images.push(data.url);
  await fetch('/api/design/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ about_banner_images: JSON.stringify(images) })
  });
  return data.url;
}

async function removeAboutBannerImage(index) {
  const settings = await fetch('/api/design/settings', { headers: { Authorization: `Bearer ${authToken}` } }).then(r => r.json());
  let images = [];
  try { images = JSON.parse(settings.about_banner_images || '[]'); } catch {}
  images.splice(index, 1);
  await fetch('/api/design/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ about_banner_images: JSON.stringify(images) })
  });
  renderAboutBannerGrid();
  toast('Image removed', 'success');
}

function triggerAboutBannerUpload() {
  document.getElementById('about-banner-file-input').click();
}

async function handleAboutBannerFileInput(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const zone = document.getElementById('about-banner-drop-zone');
  if (zone) zone.style.opacity = '0.5';
  try {
    for (const file of files) await uploadAboutBannerImage(file);
    await renderAboutBannerGrid();
    toast('About banner updated', 'success');
  } catch (err) {
    toast('Upload failed — please try again', 'error');
  } finally {
    if (zone) zone.style.opacity = '';
    input.value = '';
  }
}

function initAboutBannerDropZone() {
  const zone = document.getElementById('about-banner-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    zone.style.opacity = '0.5';
    try {
      for (const file of files) await uploadAboutBannerImage(file);
      await renderAboutBannerGrid();
      toast('About banner updated', 'success');
    } catch (err) {
      toast('Upload failed — please try again', 'error');
    } finally {
      zone.style.opacity = '';
    }
  });
}

// ---- GALLERY IMAGES ----
let _galleryImages = [];

async function renderGalleryGrid() {
  const res = await fetch('/api/design/settings', { cache: 'no-store' });
  const settings = await res.json();
  _galleryImages = [];
  try { _galleryImages = JSON.parse(settings.gallery_images || '[]'); } catch {}
  _paintGalleryGrid();
}

function _paintGalleryGrid() {
  const grid = document.getElementById('gallery-admin-grid');
  if (!grid) return;
  if (!_galleryImages.length) {
    grid.innerHTML = '<p style="color:#aaa;font-size:0.9rem;margin:0">No gallery images yet.</p>';
    return;
  }
  grid.innerHTML = _galleryImages.map((url, i) => `
    <div class="gallery-admin-item">
      <img src="${escHtml(url)}" alt="Gallery image ${i+1}">
      <button class="gallery-admin-remove" onclick="removeGalleryImage(${i})" title="Remove">&times;</button>
    </div>
  `).join('');
}

async function uploadGalleryImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/design/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: fd
  });
  const data = await res.json();
  if (!data.url) throw new Error('Upload failed');
  // Use the in-memory list — no need to re-fetch
  const images = [..._galleryImages, data.url];
  await apiFetch('/api/design/settings', {
    method: 'POST',
    body: JSON.stringify({ gallery_images: JSON.stringify(images) })
  });
  _galleryImages = images;
  _paintGalleryGrid();
  return data.url;
}

async function removeGalleryImage(index) {
  const images = _galleryImages.filter((_, i) => i !== index);
  try {
    await apiFetch('/api/design/settings', {
      method: 'POST',
      body: JSON.stringify({ gallery_images: JSON.stringify(images) })
    });
    _galleryImages = images;
    _paintGalleryGrid();
    toast('Image removed', 'success');
  } catch (err) {
    toast(err.message || 'Failed to remove image', 'error');
  }
}

function triggerGalleryUpload() {
  document.getElementById('gallery-file-input').click();
}

async function handleGalleryFileInput(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const zone = document.getElementById('gallery-drop-zone');
  if (zone) zone.style.opacity = '0.5';
  try {
    for (const file of files) {
      await uploadGalleryImage(file);
    }
    await renderGalleryGrid();
    toast('Gallery updated', 'success');
  } catch (err) {
    toast('Upload failed — please try again', 'error');
    console.error('Gallery upload error:', err);
  } finally {
    if (zone) zone.style.opacity = '';
    input.value = '';
  }
}

function initGalleryDropZone() {
  const zone = document.getElementById('gallery-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    zone.style.opacity = '0.5';
    try {
      for (const file of files) {
        await uploadGalleryImage(file);
      }
      await renderGalleryGrid();
      toast('Gallery updated', 'success');
    } catch (err) {
      toast('Upload failed — please try again', 'error');
      console.error('Gallery upload error:', err);
    } finally {
      zone.style.opacity = '';
    }
  });
}

function handleFileInput(e, key) {
  const file = e.target.files[0];
  if (file) uploadDesignImage(file, key);
}

async function uploadDesignImage(file, key) {
  const zone = document.getElementById(`dz-${key}`);
  zone.classList.add('dz-uploading');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res  = await fetch('/api/design/upload', {
      method:  'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body:    formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    // Update preview
    const preview = document.getElementById(`dzp-${key}`);
    if (preview) preview.innerHTML = `<img src="${escHtml(data.url)}" alt="Preview">`;

    // Add remove button if not present
    const dzInfo = zone.querySelector('.dz-info');
    if (dzInfo && !dzInfo.querySelector('.dz-remove')) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'dz-remove';
      removeBtn.textContent = 'Remove image';
      removeBtn.setAttribute('onclick', `removeDesignImage('${key}')`);
      dzInfo.appendChild(removeBtn);
    }

    // Auto-save image URL immediately
    designSettings[key] = data.url;
    await apiFetch('/api/design/settings', {
      method: 'POST',
      body:   JSON.stringify({ [key]: data.url })
    });

    toast('Image uploaded!', 'success');
  } catch (err) {
    toast(err.message || 'Upload failed', 'error');
  } finally {
    zone.classList.remove('dz-uploading');
  }
}

function removeDesignImage(key) {
  designSettings[key] = '';
  const preview = document.getElementById(`dzp-${key}`);
  if (preview) preview.innerHTML = '<div class="dz-empty-label">No image</div>';
  const zone = document.getElementById(`dz-${key}`);
  if (zone) {
    const removeBtn = zone.querySelector('.dz-remove');
    if (removeBtn) removeBtn.remove();
  }
  // Save the removal
  apiFetch('/api/design/settings', {
    method: 'POST',
    body:   JSON.stringify({ [key]: '' })
  }).catch(() => {});
}

// ---- SAVE ALL ----
async function saveDesign() {
  const btn = document.getElementById('design-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Sync dynamic lists into their hidden inputs before collecting
  syncIncludedItems();
  syncSocialLinks();

  // Collect all ds- prefixed inputs
  const settings = { ...designSettings };
  document.querySelectorAll('[id^="ds-"]').forEach(el => {
    const key = el.id.replace('ds-', '');
    settings[key] = el.value;
  });

  try {
    await apiFetch('/api/design/settings', {
      method: 'POST',
      body:   JSON.stringify(settings)
    });
    designSettings = settings;
    toast('Design settings saved!', 'success');
  } catch (err) {
    toast(err.message || 'Failed to save', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save All Changes';
  }
}


// ---- REVIEWS TAB ----
async function loadAdminReviews() {
  const el = document.getElementById('content-reviews');
  try {
    const reviews = await apiFetch('/api/reviews/all');
    renderReviewsTab(reviews);
  } catch { toast('Failed to load reviews', 'error'); }
}

function renderReviewsTab(reviews) {
  const el = document.getElementById('content-reviews');
  el.innerHTML = `
    <div class="tab-header">
      <p style="font-size:13px;color:var(--text-light);font-weight:600;">${reviews.length} review${reviews.length !== 1 ? 's' : ''}</p>
      <button class="btn btn-primary btn-sm" onclick="openReviewForm()">+ Add Review</button>
    </div>
    ${reviews.length === 0
      ? '<div class="empty-state"><p>No reviews yet. Add your first!</p></div>'
      : `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Author</th><th>Rating</th><th>Review</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${reviews.map(r => `
            <tr id="review-row-${r.id}">
              <td>
                <div style="font-weight:600">${escHtml(r.author_name)}</div>
                ${r.class_attended ? `<div style="font-size:12px;color:var(--text-light)">${escHtml(r.class_attended)}</div>` : ''}
                ${r.author_location ? `<div style="font-size:12px;color:var(--text-light)">${escHtml(r.author_location)}</div>` : ''}
              </td>
              <td><span style="color:#f59e0b;font-size:16px">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></td>
              <td style="max-width:280px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${escHtml(r.body)}</div></td>
              <td style="color:var(--text-light);font-size:13px;white-space:nowrap">${r.review_date ? new Date(r.review_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
              <td>
                <button class="btn btn-xs ${r.is_published ? 'btn-primary' : 'btn-ghost'}"
                        onclick="toggleReviewPublished(${r.id}, ${r.is_published})">
                  ${r.is_published ? 'Published' : 'Draft'}
                </button>
              </td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-xs btn-ghost" onclick="reorderReview(${r.id},'up')" title="Move up">↑</button>
                  <button class="btn btn-xs btn-ghost" onclick="reorderReview(${r.id},'down')" title="Move down">↓</button>
                  <button class="btn btn-ghost btn-xs" onclick="openReviewForm(${r.id})">Edit</button>
                  <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteReview(${r.id})">Delete</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`
    }
  `;

  // Inject modal into body so it overlays the whole page properly
  let modal = document.getElementById('review-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'review-modal';
    document.body.appendChild(modal);
  }
  modal.className = 'modal-overlay hidden';
  modal.onclick = (e) => { if (e.target === modal) closeReviewForm(); };
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2 class="" id="review-form-title">Add Review</h2>
        <button class="modal-close" onclick="closeReviewForm()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="review-form-id">
        <div class="form-group">
          <label>Author Name <span style="color:#e53e3e">*</span></label>
          <input type="text" id="review-form-name" placeholder="e.g. Sarah M.">
        </div>
        <div class="form-group">
          <label>Class Attended <span style="color:var(--text-light);font-weight:400">(optional)</span></label>
          <input type="text" id="review-form-class" placeholder="e.g. Sip &amp; Paint — Sunset Edition">
        </div>
        <div class="form-group">
          <label>Location <span style="color:var(--text-light);font-weight:400">(optional)</span></label>
          <input type="text" id="review-form-location" placeholder="e.g. Brighton">
        </div>
        <div class="form-group">
          <label>Date of Review <span style="color:var(--text-light);font-weight:400">(optional)</span></label>
          <input type="date" id="review-form-date">
        </div>
        <div class="form-group">
          <label>Star Rating <span style="color:#e53e3e">*</span></label>
          <div id="star-picker" style="display:flex;gap:4px;margin-top:4px">
            <button type="button" class="star-btn" data-val="1" onclick="pickStar(1)" style="font-size:24px;background:none;border:none;cursor:pointer;color:#d1d5db;padding:0;line-height:1">★</button>
            <button type="button" class="star-btn" data-val="2" onclick="pickStar(2)" style="font-size:24px;background:none;border:none;cursor:pointer;color:#d1d5db;padding:0;line-height:1">★</button>
            <button type="button" class="star-btn" data-val="3" onclick="pickStar(3)" style="font-size:24px;background:none;border:none;cursor:pointer;color:#d1d5db;padding:0;line-height:1">★</button>
            <button type="button" class="star-btn" data-val="4" onclick="pickStar(4)" style="font-size:24px;background:none;border:none;cursor:pointer;color:#d1d5db;padding:0;line-height:1">★</button>
            <button type="button" class="star-btn" data-val="5" onclick="pickStar(5)" style="font-size:24px;background:none;border:none;cursor:pointer;color:#d1d5db;padding:0;line-height:1">★</button>
          </div>
          <input type="hidden" id="review-form-rating" value="5">
        </div>
        <div class="form-group">
          <label>Review Text <span style="color:#e53e3e">*</span></label>
          <textarea id="review-form-body" rows="4" placeholder="What did they say?"></textarea>
        </div>
        <div class="form-group">
          <label>Photo <span style="color:var(--text-light);font-weight:400">(optional)</span></label>
          <input type="hidden" id="review-form-image">
          <div class="ef-image-zone" id="review-image-zone"
               onclick="document.getElementById('review-image-file').click()"
               ondragover="event.preventDefault();this.classList.add('drag-over')"
               ondragleave="this.classList.remove('drag-over')"
               ondrop="event.preventDefault();this.classList.remove('drag-over');handleReviewImageDrop(event.dataTransfer.files[0])">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
            <p>Drop photo here or click to upload</p>
          </div>
          <input type="file" id="review-image-file" accept="image/*" style="display:none" onchange="handleReviewImageFile(this.files[0])">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="review-form-published" style="width:16px;height:16px">
            Publish immediately
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeReviewForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveReview()">Save Review</button>
      </div>
    </div>
  `;
  pickStar(5);
}

function pickStar(n) {
  document.getElementById('review-form-rating').value = n;
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.style.color = parseInt(btn.dataset.val) <= n ? '#f59e0b' : '#d1d5db';
  });
}

function openReviewForm(id = null) {
  document.getElementById('review-form-title').textContent = id ? 'Edit Review' : 'Add Review';
  document.getElementById('review-form-id').value = id || '';
  document.getElementById('review-form-name').value = '';
  document.getElementById('review-form-class').value = '';
  document.getElementById('review-form-location').value = '';
  document.getElementById('review-form-date').value = '';
  document.getElementById('review-form-body').value = '';
  document.getElementById('review-form-published').checked = false;
  document.getElementById('review-form-image').value = '';
  pickStar(5);

  if (id) {
    apiFetch(`/api/reviews/all`).then(reviews => {
      const r = reviews.find(x => x.id === id);
      if (!r) return;
      document.getElementById('review-form-name').value = r.author_name;
      document.getElementById('review-form-class').value = r.class_attended || '';
      document.getElementById('review-form-location').value = r.author_location || '';
      document.getElementById('review-form-date').value = r.review_date || '';
      document.getElementById('review-form-body').value = r.body;
      document.getElementById('review-form-published').checked = !!r.is_published;
      pickStar(r.rating);
      // Populate image zone
      document.getElementById('review-form-image').value = r.image_url || '';
      const zone = document.getElementById('review-image-zone');
      if (zone && r.image_url) {
        zone.innerHTML = `<img src="${escHtml(r.image_url)}" style="max-height:120px;max-width:100%;border-radius:8px;display:block;margin:0 auto"><p style="margin-top:6px;font-size:12px;color:var(--text-light)">Click or drag to replace · <a href="#" onclick="clearReviewImage();return false" style="color:var(--rose)">Remove</a></p>`;
      }
    });
  }
  document.getElementById('review-modal').classList.remove('hidden');
}

function closeReviewForm() {
  document.getElementById('review-modal').classList.add('hidden');
}

async function saveReview() {
  const id = document.getElementById('review-form-id').value;
  const author_name = document.getElementById('review-form-name').value.trim();
  const class_attended = document.getElementById('review-form-class').value.trim();
  const author_location = document.getElementById('review-form-location').value.trim();
  const review_date = document.getElementById('review-form-date').value;
  const rating = parseInt(document.getElementById('review-form-rating').value);
  const body = document.getElementById('review-form-body').value.trim();
  const is_published = document.getElementById('review-form-published').checked ? 1 : 0;
  const image_url = document.getElementById('review-form-image').value.trim();

  if (!author_name || !body) { toast('Author name and review text are required', 'error'); return; }

  try {
    if (id) {
      await apiFetch(`/api/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ author_name, class_attended, author_location, review_date, rating, body, is_published, image_url }) });
      toast('Review updated');
    } else {
      await apiFetch('/api/reviews', { method: 'POST', body: JSON.stringify({ author_name, class_attended, author_location, review_date, rating, body, is_published, image_url }) });
      toast('Review added');
    }
    closeReviewForm();
    loadAdminReviews();
  } catch { toast('Failed to save review', 'error'); }
}

async function toggleReviewPublished(id, current) {
  try {
    await apiFetch(`/api/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ is_published: current ? 0 : 1 }) });
    toast(current ? 'Review unpublished' : 'Review published');
    loadAdminReviews();
  } catch { toast('Failed to update review', 'error'); }
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await apiFetch(`/api/reviews/${id}`, { method: 'DELETE' });
    toast('Review deleted');
    loadAdminReviews();
  } catch { toast('Failed to delete review', 'error'); }
}

async function reorderReview(id, direction) {
  try {
    await apiFetch('/api/reviews/reorder', { method: 'PATCH', body: JSON.stringify({ id, direction }) });
    loadAdminReviews();
  } catch { toast('Failed to reorder', 'error'); }
}

// ---- MY ACCOUNT ----
function openMyAccount() {
  ensureUserModal();
  let payload = {};
  try { payload = JSON.parse(atob(authToken.split('.')[1])); } catch {}
  const modal = document.getElementById('user-modal');
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h2>My Account</h2>
        <button class="modal-close" onclick="closeUserForm()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          <div style="background:var(--bg);border-radius:10px;padding:14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Username</div>
            <div style="font-weight:600;font-size:14px">${escHtml(payload.username || '')}</div>
          </div>
          <div style="background:var(--bg);border-radius:10px;padding:14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Role</div>
            <div style="font-weight:600;font-size:14px">${payload.role === 'super_admin' ? '⭐ Super Admin' : 'Admin'}</div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:20px">
          <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text-dark)">Change Password</div>
          <div class="form-group">
            <label>Current Password <span style="color:#e53e3e">*</span></label>
            <input type="password" id="ma-current-pw" placeholder="Enter your current password" autocomplete="current-password">
          </div>
          <div class="form-group">
            <label>New Password <span style="color:#e53e3e">*</span></label>
            <input type="password" id="ma-new-pw" placeholder="Min. 12 characters" autocomplete="new-password" oninput="updatePwStrength(this.value)">
            <div id="ma-pw-strength" style="margin-top:6px;font-size:12px;font-weight:600;height:16px"></div>
          </div>
          <div class="form-group">
            <label>Confirm New Password <span style="color:#e53e3e">*</span></label>
            <input type="password" id="ma-confirm-pw" placeholder="Repeat new password" autocomplete="new-password">
          </div>
          <button class="btn btn-primary" onclick="saveMyPassword()">Update Password</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function updatePwStrength(pw) {
  const el = document.getElementById('ma-pw-strength');
  if (!el) return;
  if (!pw) { el.textContent = ''; return; }
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: 'Too short', color: '#dc2626' },
    { label: 'Weak', color: '#dc2626' },
    { label: 'Fair', color: '#f59e0b' },
    { label: 'Good', color: '#10b981' },
    { label: 'Strong', color: '#10b981' },
    { label: 'Very strong', color: '#059669' },
  ];
  const l = levels[Math.min(score, levels.length - 1)];
  el.textContent = l.label;
  el.style.color = l.color;
}

async function saveMyPassword() {
  const current = document.getElementById('ma-current-pw').value;
  const newPw   = document.getElementById('ma-new-pw').value;
  const confirm = document.getElementById('ma-confirm-pw').value;
  if (!current) { toast('Enter your current password', 'error'); return; }
  if (!newPw || newPw.length < 12) { toast('New password must be at least 12 characters', 'error'); return; }
  if (newPw !== confirm) { toast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch('/api/admin/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: newPw })
    });
    toast('Password updated — please sign in again');
    closeUserForm();
    setTimeout(signOut, 1800);
  } catch (err) { toast(err.message || 'Failed to update password', 'error'); }
}

// ---- USERS TAB ----
async function loadAdminUsers() {
  const el = document.getElementById('content-users');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>';
  try {
    const users = await apiFetch('/api/admin/users');
    renderUsersTab(users);
  } catch { toast('Failed to load users', 'error'); }
}

function renderUsersTab(users) {
  const el = document.getElementById('content-users');
  const currentId = getCurrentUserId();
  el.innerHTML = `
    <div class="tab-header">
      <p style="font-size:13px;color:var(--text-light);font-weight:600;">${users.length} user${users.length !== 1 ? 's' : ''}</p>
      <button class="btn btn-primary btn-sm" onclick="openUserForm()">+ Add User</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr id="user-row-${u.id}" onclick="openUserDetail(${u.id})" style="cursor:pointer" class="hoverable-row">
              <td style="font-weight:600">${escHtml(u.username)}${u.id === currentId ? ' <span style="font-size:11px;color:var(--text-light)">(you)</span>' : ''}</td>
              <td>
                <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;${u.role === 'super_admin' ? 'background:#fef3c7;color:#92400e' : 'background:#f3f4f6;color:#374151'}">
                  ${u.role === 'super_admin' ? '⭐ Super Admin' : 'Admin'}
                </span>
              </td>
              <td>
                <span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;${u.is_active ? 'background:#d1fae5;color:#065f46' : 'background:#fee2e2;color:#991b1b'}">
                  ${u.is_active ? 'Active' : 'Disabled'}
                </span>
              </td>
              <td style="color:var(--text-light);font-size:13px">${u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-GB', {dateStyle:'medium',timeStyle:'short'}) : 'Never'}</td>
              <td style="color:var(--text-light);font-size:13px">${new Date(u.created_at).toLocaleDateString('en-GB')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  ensureUserModal();
}

// Store users list for detail modal lookup
let _cachedUsers = [];
const _origLoadAdminUsers = loadAdminUsers;

function openUserDetail(id) {
  ensureUserModal();
  apiFetch('/api/admin/users').then(users => {
    const u = users.find(x => x.id === id);
    if (!u) return;
    const currentId = getCurrentUserId();
    const isSelf = u.id === currentId;
    const modal = document.getElementById('user-modal');
    modal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>${escHtml(u.username)}</h2>
          <button class="modal-close" onclick="closeUserForm()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>
        <div class="modal-body">
          <!-- User info -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
            <div style="background:var(--bg);border-radius:10px;padding:14px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Role</div>
              <div style="font-weight:600;font-size:14px">${u.role === 'super_admin' ? '⭐ Super Admin' : 'Admin'}</div>
            </div>
            <div style="background:var(--bg);border-radius:10px;padding:14px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Status</div>
              <div style="font-weight:600;font-size:14px;color:${u.is_active ? '#065f46' : '#991b1b'}">${u.is_active ? 'Active' : 'Disabled'}</div>
            </div>
            <div style="background:var(--bg);border-radius:10px;padding:14px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Last Login</div>
              <div style="font-weight:600;font-size:14px">${u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-GB', {dateStyle:'medium',timeStyle:'short'}) : 'Never'}</div>
            </div>
            <div style="background:var(--bg);border-radius:10px;padding:14px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:4px">Member Since</div>
              <div style="font-weight:600;font-size:14px">${new Date(u.created_at).toLocaleDateString('en-GB',{dateStyle:'medium'})}</div>
            </div>
          </div>

          ${!isSelf ? `
          <!-- Role & Status -->
          <div style="border-top:1px solid var(--border);padding-top:20px;margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-dark)">Settings</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
              <select id="ud-role" style="flex:1;padding:9px 12px;border:1.5px solid #e0d0d4;border-radius:8px;font-size:14px;background:#fff">
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
              </select>
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap">
                <input type="checkbox" id="ud-active" ${u.is_active ? 'checked' : ''} style="width:16px;height:16px">
                Account active
              </label>
              <button class="btn btn-primary btn-sm" onclick="saveUserDetail(${u.id})">Save</button>
            </div>
          </div>

          <!-- Change Password -->
          <div style="border-top:1px solid var(--border);padding-top:20px;margin-bottom:20px">
            <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-dark)">Change Password</div>
            <div class="form-group">
              <label>New Password</label>
              <input type="password" id="ud-pw-new" placeholder="Min. 8 characters">
            </div>
            <div class="form-group">
              <label>Confirm Password</label>
              <input type="password" id="ud-pw-confirm" placeholder="Repeat new password">
            </div>
            <button class="btn btn-ghost btn-sm" onclick="saveUserPassword(${u.id})">Update Password</button>
          </div>

          <!-- Danger Zone -->
          <div style="border-top:1px solid #fee2e2;padding-top:20px;background:#fff9f9;border-radius:0 0 10px 10px;margin:-1px -24px -1px;padding:16px 24px">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#991b1b">Danger Zone</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <p style="font-size:13px;color:#6b7280;margin:0">Permanently delete this user account.</p>
              <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;flex-shrink:0" onclick="deleteUser(${u.id})">Delete User</button>
            </div>
          </div>
          ` : `
          <!-- Change own password -->
          <div style="border-top:1px solid var(--border);padding-top:20px">
            <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text-dark)">Change Your Password</div>
            <div class="form-group">
              <label>Current Password <span style="color:#e53e3e">*</span></label>
              <input type="password" id="ud-pw-current" placeholder="Enter current password" autocomplete="current-password">
            </div>
            <div class="form-group">
              <label>New Password <span style="color:#e53e3e">*</span></label>
              <input type="password" id="ud-pw-new" placeholder="Min. 12 characters" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label>Confirm New Password <span style="color:#e53e3e">*</span></label>
              <input type="password" id="ud-pw-confirm" placeholder="Repeat new password" autocomplete="new-password">
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveSelfPassword()">Update Password</button>
          </div>
          `}
        </div>
      </div>
    `;
    modal.classList.remove('hidden');
  });
}

async function saveUserDetail(id) {
  const role = document.getElementById('ud-role').value;
  const is_active = document.getElementById('ud-active').checked;
  try {
    await apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role, is_active }) });
    toast('User updated');
    closeUserForm();
    loadAdminUsers();
  } catch (err) { toast(err.message || 'Failed to update user', 'error'); }
}

async function saveUserPassword(id) {
  const pw = document.getElementById('ud-pw-new').value;
  const confirm = document.getElementById('ud-pw-confirm').value;
  if (!pw || pw.length < 12) { toast('Password must be at least 12 characters', 'error'); return; }
  if (pw !== confirm) { toast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
    toast('Password updated successfully');
    document.getElementById('ud-pw-new').value = '';
    document.getElementById('ud-pw-confirm').value = '';
  } catch (err) { toast(err.message || 'Failed to update password', 'error'); }
}

async function saveSelfPassword() {
  const current = document.getElementById('ud-pw-current').value;
  const newPw   = document.getElementById('ud-pw-new').value;
  const confirm = document.getElementById('ud-pw-confirm').value;
  if (!current) { toast('Enter your current password', 'error'); return; }
  if (!newPw || newPw.length < 12) { toast('New password must be at least 12 characters', 'error'); return; }
  if (newPw !== confirm) { toast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch('/api/admin/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: newPw })
    });
    toast('Password updated — signing you out…');
    closeUserForm();
    setTimeout(signOut, 1800);
  } catch (err) { toast(err.message || 'Failed to update password', 'error'); }
}

function getCurrentUserId() {
  try {
    const token = authToken;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch { return null; }
}

function ensureUserModal() {
  if (!document.getElementById('user-modal')) {
    const m = document.createElement('div');
    m.id = 'user-modal';
    m.className = 'modal-overlay hidden';
    m.onclick = (e) => { if (e.target === m) closeUserForm(); };
    document.body.appendChild(m);
  }
  if (!document.getElementById('pw-modal')) {
    const m = document.createElement('div');
    m.id = 'pw-modal';
    m.className = 'modal-overlay hidden';
    m.onclick = (e) => { if (e.target === m) closePwModal(); };
    document.body.appendChild(m);
  }
}

function openUserForm(id = null) {
  ensureUserModal();
  const modal = document.getElementById('user-modal');
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h2 class="">${id ? 'Edit User' : 'Add User'}</h2>
        <button class="modal-close" onclick="closeUserForm()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="user-form-id" value="${id || ''}">
        ${!id ? `
          <div class="form-group">
            <label>Username <span style="color:#e53e3e">*</span></label>
            <input type="text" id="user-form-username" placeholder="e.g. jane">
          </div>
          <div class="form-group">
            <label>Password <span style="color:#e53e3e">*</span></label>
            <input type="password" id="user-form-password" placeholder="Min. 12 characters">
          </div>
        ` : ''}
        <div class="form-group">
          <label>Role <span style="color:#e53e3e">*</span></label>
          <select id="user-form-role" style="width:100%;padding:10px 12px;border:1.5px solid #e0d0d4;border-radius:8px;font-size:14px;background:#fff">
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        ${id ? `
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="user-form-active" style="width:16px;height:16px" checked>
              Account active
            </label>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeUserForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">${id ? 'Save Changes' : 'Create User'}</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');

  if (id) {
    apiFetch('/api/admin/users').then(users => {
      const u = users.find(x => x.id === id);
      if (!u) return;
      document.getElementById('user-form-role').value = u.role;
      const activeEl = document.getElementById('user-form-active');
      if (activeEl) activeEl.checked = !!u.is_active;
    });
  }
}

function closeUserForm() {
  const m = document.getElementById('user-modal');
  if (m) m.classList.add('hidden');
}

async function saveUser() {
  const id = document.getElementById('user-form-id').value;
  const role = document.getElementById('user-form-role').value;

  try {
    if (id) {
      const activeEl = document.getElementById('user-form-active');
      const is_active = activeEl ? activeEl.checked : true;
      await apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role, is_active }) });
      toast('User updated');
    } else {
      const username = document.getElementById('user-form-username').value.trim();
      const password = document.getElementById('user-form-password').value;
      if (!username || !password) { toast('Username and password required', 'error'); return; }
      if (password.length < 12) { toast('Password must be at least 12 characters', 'error'); return; }
      await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      toast('User created');
    }
    closeUserForm();
    loadAdminUsers();
  } catch (err) { toast(err.message || 'Failed to save user', 'error'); }
}

function openResetPassword(id, username) {
  ensureUserModal();
  const modal = document.getElementById('pw-modal');
  modal.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h2 class="">Reset Password</h2>
        <button class="modal-close" onclick="closePwModal()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;color:var(--text-light);margin-bottom:16px">Set a new password for <strong>${escHtml(username)}</strong></p>
        <input type="hidden" id="pw-form-id" value="${id}">
        <div class="form-group">
          <label>New Password <span style="color:#e53e3e">*</span></label>
          <input type="password" id="pw-form-new" placeholder="Min. 8 characters">
        </div>
        <div class="form-group">
          <label>Confirm Password <span style="color:#e53e3e">*</span></label>
          <input type="password" id="pw-form-confirm" placeholder="Repeat new password">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closePwModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveResetPassword()">Reset Password</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function closePwModal() {
  const m = document.getElementById('pw-modal');
  if (m) m.classList.add('hidden');
}

async function saveResetPassword() {
  const id = document.getElementById('pw-form-id').value;
  const pw = document.getElementById('pw-form-new').value;
  const confirm = document.getElementById('pw-form-confirm').value;
  if (!pw || pw.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
  if (pw !== confirm) { toast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
    toast('Password reset successfully');
    closePwModal();
  } catch (err) { toast(err.message || 'Failed to reset password', 'error'); }
}

async function deleteUser(id) {
  if (!confirm('Delete this user? This cannot be undone.')) return;
  try {
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    toast('User deleted');
    loadAdminUsers();
  } catch (err) { toast(err.message || 'Failed to delete user', 'error'); }
}

// ---- CONTENT TAB ----
let peQuill = null;

async function loadContentTab() {
  const el = document.getElementById('content-content');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  peQuill = null;
  window._peQuillInitContent = '';
  try {
    const s = await apiFetch('/api/design/settings');
    window._peQuillInitContent = s.private_events_content || '';

    el.innerHTML = `
      <div class="design-tabs-nav content-page-tabs">
        <button class="design-tab-btn active" onclick="switchContentTab('home')" data-tab="home">Home</button>
        <button class="design-tab-btn" onclick="switchContentTab('about')" data-tab="about">About</button>
        <button class="design-tab-btn" onclick="switchContentTab('events')" data-tab="events">Events</button>
        <button class="design-tab-btn" onclick="switchContentTab('contact')" data-tab="contact">Contact</button>
        <button class="design-tab-btn" onclick="switchContentTab('private-events')" data-tab="private-events">Private Events</button>
        <button class="design-tab-btn" onclick="switchContentTab('gallery')" data-tab="gallery">Gallery</button>
        <button class="design-tab-btn" onclick="switchContentTab('seo')" data-tab="seo">🔍 SEO</button>
      </div>

      <!-- HOME PAGE -->
      <div class="design-tab-panel" id="ctab-home">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Hero Banner</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Title</label>
                  <input type="text" id="ds-hero_title" value="${escHtml(s.hero_title || 'Paint, Create')}">
                </div>
                <div class="form-group">
                  <label>Title Highlight <span class="design-hint">(the coloured part)</span></label>
                  <input type="text" id="ds-hero_title_highlight" value="${escHtml(s.hero_title_highlight || '& Celebrate')}">
                </div>
              </div>
              <div class="form-group">
                <label>Subtitle</label>
                <textarea id="ds-hero_subtitle" rows="2">${escHtml(s.hero_subtitle || '')}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Primary Button Text</label>
                  <input type="text" id="ds-hero_cta_primary_text" value="${escHtml(s.hero_cta_primary_text || 'Browse All Events')}">
                </div>
                <div class="form-group">
                  <label>Primary Button URL</label>
                  <input type="text" id="ds-hero_cta_primary_url" value="${escHtml(s.hero_cta_primary_url || '/events')}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Secondary Button Text</label>
                  <input type="text" id="ds-hero_cta_secondary_text" value="${escHtml(s.hero_cta_secondary_text || 'About Us')}">
                </div>
                <div class="form-group">
                  <label>Secondary Button URL</label>
                  <input type="text" id="ds-hero_cta_secondary_url" value="${escHtml(s.hero_cta_secondary_url || '#about')}">
                </div>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">About Snippet</h3>
              <span class="design-hint">The short about section on the homepage</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Section Title</label>
                <input type="text" id="ds-about_title" value="${escHtml(s.about_title || '')}">
              </div>
              <div class="form-group">
                <label>Paragraph 1</label>
                <textarea id="ds-about_body_1" rows="3">${escHtml(s.about_body_1 || '')}</textarea>
              </div>
              <div class="form-group">
                <label>Paragraph 2</label>
                <textarea id="ds-about_body_2" rows="3">${escHtml(s.about_body_2 || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Key Points</h3>
              <span class="design-hint">The three bullet points shown below the about text</span>
            </div>
            <div class="design-card-body">
              ${[1,2,3].map(n => `
              <div class="form-row" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                <div class="form-group">
                  <label>Point ${n} — Title</label>
                  <input type="text" id="ds-about_pillar_${n}_title" value="${escHtml(s[`about_pillar_${n}_title`] || '')}">
                </div>
                <div class="form-group">
                  <label>Point ${n} — Description</label>
                  <input type="text" id="ds-about_pillar_${n}_text" value="${escHtml(s[`about_pillar_${n}_text`] || '')}">
                </div>
              </div>`).join('')}
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Footer</h3></div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Tagline</label>
                <input type="text" id="ds-footer_tagline" value="${escHtml(s.footer_tagline || 'Creative events for everyone')}">
              </div>
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('home')">Save Home Page</button>
          </div>
        </div>
      </div>

      <!-- ABOUT PAGE -->
      <div class="design-tab-panel hidden" id="ctab-about">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Hero</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Hero Title</label>
                  <input type="text" id="ds-aboutpage_hero_title" value="${escHtml(s.aboutpage_hero_title || 'About Us')}">
                </div>
                <div class="form-group">
                  <label>Hero Subtitle</label>
                  <input type="text" id="ds-aboutpage_hero_sub" value="${escHtml(s.aboutpage_hero_sub || '')}">
                </div>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Main Content</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Label <span class="design-hint">(small text above title)</span></label>
                  <input type="text" id="ds-aboutpage_label" value="${escHtml(s.aboutpage_label || 'Our Story')}">
                </div>
                <div class="form-group">
                  <label>Section Title</label>
                  <input type="text" id="ds-aboutpage_title" value="${escHtml(s.aboutpage_title || '')}">
                </div>
              </div>
              <div class="form-group">
                <label>Paragraph 1</label>
                <textarea id="ds-aboutpage_body_1" rows="3">${escHtml(s.aboutpage_body_1 || '')}</textarea>
              </div>
              <div class="form-group">
                <label>Paragraph 2</label>
                <textarea id="ds-aboutpage_body_2" rows="3">${escHtml(s.aboutpage_body_2 || '')}</textarea>
              </div>
              <div class="form-group">
                <label>Paragraph 3 <span class="design-hint">(optional)</span></label>
                <textarea id="ds-aboutpage_body_3" rows="3">${escHtml(s.aboutpage_body_3 || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Highlights</h3>
              <span class="design-hint">Three feature points shown below the text</span>
            </div>
            <div class="design-card-body">
              ${[1,2,3].map(n => `
              <div class="form-row" style="margin-bottom:12px">
                <div class="form-group">
                  <label>Highlight ${n} — Title</label>
                  <input type="text" id="ds-aboutpage_pillar_${n}_title" value="${escHtml(s[`aboutpage_pillar_${n}_title`] || '')}">
                </div>
                <div class="form-group">
                  <label>Highlight ${n} — Description</label>
                  <input type="text" id="ds-aboutpage_pillar_${n}_text" value="${escHtml(s[`aboutpage_pillar_${n}_text`] || '')}">
                </div>
              </div>`).join('')}
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('about')">Save About Page</button>
          </div>
        </div>
      </div>

      <!-- EVENTS PAGE -->
      <div class="design-tab-panel hidden" id="ctab-events">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">What's Included</h3>
              <span class="design-hint">Shown on every event detail page</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Section Title</label>
                <input type="text" id="ds-included_title" value="${escHtml(s.included_title || "What's included")}">
              </div>
              <div class="form-group">
                <label>Bullet Points <span class="design-hint">Use <code>{capacity}</code> to show group size</span></label>
                <div id="included-items-list" class="included-items-list">
                  ${renderIncludedItemsList(s.included_items)}
                </div>
                <button type="button" class="btn-add-item" onclick="addIncludedItem()">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  Add item
                </button>
              </div>
              <input type="hidden" id="ds-included_items" value="${escHtml(s.included_items || '[]')}">
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Please Note</h3>
              <span class="design-hint">Shown alongside What's Included</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Section Title</label>
                <input type="text" id="ds-please_note_title" value="${escHtml(s.please_note_title || 'Please Note')}">
              </div>
              <div class="form-group">
                <label>Text</label>
                <textarea id="ds-please_note_text" rows="5">${escHtml(s.please_note_text || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('events')">Save Events Content</button>
          </div>
        </div>
      </div>

      <!-- CONTACT PAGE -->
      <div class="design-tab-panel hidden" id="ctab-contact">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Hero</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Hero Title</label>
                  <input type="text" id="ds-contact_hero_title" value="${escHtml(s.contact_hero_title || 'Get In Touch')}">
                </div>
                <div class="form-group">
                  <label>Hero Subtitle</label>
                  <input type="text" id="ds-contact_hero_sub" value="${escHtml(s.contact_hero_sub || '')}">
                </div>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Intro Text</h3>
              <span class="design-hint">Shown to the left of the contact form</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <textarea id="ds-contact_page_text" rows="6">${escHtml(s.contact_page_text || '')}</textarea>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Notification Email</h3>
              <span class="design-hint">Where to send alerts for bookings, vouchers and contact form submissions</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Send notifications to</label>
                <input type="email" id="ds-notification_email" placeholder="you@example.com" value="${escHtml(s.notification_email || '')}">
              </div>
              <div style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" onclick="sendTestEmail()">📧 Send Test Email</button>
                <span id="test-email-result" style="font-size:13px;font-weight:600"></span>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Form Fields</h3>
              <span class="design-hint">Extra fields shown on the contact form below the main message</span>
            </div>
            <div class="design-card-body">
              <div id="contact-fields-list" class="form-field-list"></div>
              <button class="btn btn-outline-sm" style="margin-top:14px" onclick="openAddContactFieldForm()">+ Add Field</button>
              <div id="add-contact-field-form" class="add-field-form" style="display:none;margin-top:14px">
                <div class="form-row" style="margin-bottom:12px">
                  <div class="form-group">
                    <label>Field Type</label>
                    <select id="acf-type" onchange="onAcfTypeChange()">
                      <option value="checkbox">Tick Box (Checkbox)</option>
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text</option>
                      <option value="select">Dropdown</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Required?</label>
                    <select id="acf-required">
                      <option value="false">Optional</option>
                      <option value="true">Required</option>
                    </select>
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                  <label>Label / Question</label>
                  <input type="text" id="acf-label" placeholder="e.g. How did you hear about us?">
                </div>
                <div class="form-group" id="acf-options-wrap" style="display:none;margin-bottom:12px">
                  <label>Dropdown Options <span style="font-weight:400;color:var(--text-light)">(one per line)</span></label>
                  <textarea id="acf-options" rows="4" placeholder="e.g.&#10;Google&#10;Instagram&#10;Word of mouth&#10;Other"></textarea>
                </div>
                <div style="display:flex;gap:10px">
                  <button class="btn btn-primary btn-sm" onclick="saveContactFormField()">Add Field</button>
                  <button class="btn btn-outline-sm" onclick="closeAddContactFieldForm()">Cancel</button>
                </div>
              </div>
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('contact')">Save Contact Page</button>
          </div>
        </div>
      </div>

      <!-- PRIVATE EVENTS PAGE -->
      <div class="design-tab-panel hidden" id="ctab-private-events">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Hero</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Hero Title</label>
                  <input type="text" id="ds-private_events_hero_title" value="${escHtml(s.private_events_hero_title || 'Private Events')}">
                </div>
                <div class="form-group">
                  <label>Hero Subtitle</label>
                  <input type="text" id="ds-private_events_hero_sub" value="${escHtml(s.private_events_hero_sub || '')}">
                </div>
              </div>
            </div>
          </div>
          <div class="design-card">
            <div class="design-card-header">
              <h3 class="design-card-title">Page Content</h3>
              <span class="design-hint">Use the toolbar to format headings, lists and links</span>
            </div>
            <div class="design-card-body">
              <div id="pe-quill-editor" style="min-height:300px;background:#fff;border-radius:6px"></div>
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('private-events')">Save Private Events Page</button>
          </div>
        </div>
      </div>

      <!-- GALLERY PAGE -->
      <div class="design-tab-panel hidden" id="ctab-gallery">
        <div class="design-centred-wrap">
          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Hero</h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Hero Title</label>
                  <input type="text" id="ds-gallery_hero_title" value="${escHtml(s.gallery_hero_title || 'Our Gallery')}">
                </div>
                <div class="form-group">
                  <label>Hero Subtitle</label>
                  <input type="text" id="ds-gallery_hero_sub" value="${escHtml(s.gallery_hero_sub || '')}">
                </div>
              </div>
            </div>
          </div>
          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('gallery')">Save Gallery Page</button>
          </div>
        </div>
      </div>

      <!-- SEO -->
      <div class="design-tab-panel hidden" id="ctab-seo">
        <div class="design-centred-wrap">

          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Business Info <span style="font-size:12px;font-weight:400;color:var(--text-light)">Used in Google search results and maps</span></h3></div>
            <div class="design-card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Business Name</label>
                  <input type="text" id="ds-seo_business_name" value="${escHtml(s.seo_business_name || 'Paint & Bubbles')}">
                </div>
                <div class="form-group">
                  <label>Phone Number</label>
                  <input type="text" id="ds-seo_business_phone" value="${escHtml(s.seo_business_phone || '')}" placeholder="e.g. 01234 567890">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Street Address</label>
                  <input type="text" id="ds-seo_business_address" value="${escHtml(s.seo_business_address || '')}" placeholder="e.g. 12 Studio Lane">
                </div>
                <div class="form-group">
                  <label>City</label>
                  <input type="text" id="ds-seo_business_city" value="${escHtml(s.seo_business_city || '')}" placeholder="e.g. Brighton">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Postcode</label>
                  <input type="text" id="ds-seo_business_postcode" value="${escHtml(s.seo_business_postcode || '')}" placeholder="e.g. BN1 1AB">
                </div>
                <div class="form-group">
                  <label>Default OG Image <span style="font-size:11px;color:var(--text-light)">(shown when sharing pages on social media)</span></label>
                  <input type="text" id="ds-seo_og_image" value="${escHtml(s.seo_og_image || '')}" placeholder="/uploads/your-image.jpg">
                </div>
              </div>
            </div>
          </div>

          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Google Search Console <span style="font-size:12px;font-weight:400;color:var(--text-light)">Optional — for verifying ownership</span></h3></div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Google Verification Code</label>
                <input type="text" id="ds-seo_google_verification" value="${escHtml(s.seo_google_verification || '')}" placeholder="Paste the content value from the meta tag Google gives you">
                <p style="font-size:12px;color:var(--text-light);margin-top:4px">In Google Search Console, choose "HTML tag" verification method and paste the <code>content="..."</code> value here.</p>
              </div>
            </div>
          </div>

          <div class="design-card">
            <div class="design-card-header"><h3 class="design-card-title">Page Meta Descriptions <span style="font-size:12px;font-weight:400;color:var(--text-light)">Shown in Google search results — aim for 120–160 characters</span></h3></div>
            <div class="design-card-body">
              ${[
                ['seo_desc_home',           'Home Page'],
                ['seo_desc_events',         'Events Page'],
                ['seo_desc_about',          'About Page'],
                ['seo_desc_reviews',        'Reviews Page'],
                ['seo_desc_gallery',        'Gallery Page'],
                ['seo_desc_faq',            'FAQ Page'],
                ['seo_desc_contact',        'Contact Page'],
                ['seo_desc_gift_vouchers',  'Gift Vouchers Page'],
                ['seo_desc_private_events', 'Private Events Page'],
              ].map(([key, label]) => `
                <div class="form-group">
                  <label style="display:flex;justify-content:space-between"><span>${label}</span><span id="${key}-count" style="font-size:11px;color:var(--text-light)"></span></label>
                  <input type="text" id="ds-${key}" value="${escHtml(s[key] || '')}" placeholder="Leave blank to use the default" oninput="updateSeoCharCount('${key}',this.value)">
                </div>`).join('')}
            </div>
          </div>

          <div class="design-save-bar">
            <button class="btn btn-primary" onclick="saveContentPage('seo')">Save SEO Settings</button>
          </div>
        </div>
      </div>
    `;

    // Quill init is deferred until the Private Events tab is clicked
  } catch {
    el.innerHTML = '<p style="padding:24px;color:red">Failed to load content settings.</p>';
  }
}

function switchContentTab(tab) {
  const container = document.getElementById('content-content');
  container.querySelectorAll('.design-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  container.querySelectorAll('.design-tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `ctab-${tab}`);
  });
  if (tab === 'private-events') initContentPEQuill();
  if (tab === 'contact') loadContactFormFields();
}

function initContentPEQuill() {
  if (peQuill) return;
  const editorEl = document.getElementById('pe-quill-editor');
  if (!editorEl) return;
  peQuill = new Quill('#pe-quill-editor', {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean']
      ]
    }
  });
  peQuill.root.innerHTML = window._peQuillInitContent || '';
}

const CONTENT_PAGE_KEYS = {
  home:             ['hero_title','hero_title_highlight','hero_subtitle','hero_cta_primary_text','hero_cta_primary_url','hero_cta_secondary_text','hero_cta_secondary_url','about_title','about_body_1','about_body_2','about_pillar_1_title','about_pillar_1_text','about_pillar_2_title','about_pillar_2_text','about_pillar_3_title','about_pillar_3_text','footer_tagline'],
  about:            ['aboutpage_hero_title','aboutpage_hero_sub','aboutpage_label','aboutpage_title','aboutpage_body_1','aboutpage_body_2','aboutpage_body_3','aboutpage_pillar_1_title','aboutpage_pillar_1_text','aboutpage_pillar_2_title','aboutpage_pillar_2_text','aboutpage_pillar_3_title','aboutpage_pillar_3_text'],
  events:           ['included_title','included_items','please_note_title','please_note_text'],
  contact:          ['contact_hero_title','contact_hero_sub','contact_page_text','notification_email'],
  'private-events': ['private_events_hero_title','private_events_hero_sub','private_events_content'],
  gallery:          ['gallery_hero_title','gallery_hero_sub'],
  seo:              ['seo_business_name','seo_business_phone','seo_business_address','seo_business_city','seo_business_postcode','seo_og_image','seo_google_verification','seo_desc_home','seo_desc_events','seo_desc_about','seo_desc_reviews','seo_desc_gallery','seo_desc_faq','seo_desc_contact','seo_desc_gift_vouchers','seo_desc_private_events'],
};

function updateSeoCharCount(key, val) {
  const el = document.getElementById(`${key}-count`);
  if (!el) return;
  const n = val.length;
  el.textContent = `${n} chars`;
  el.style.color = n === 0 ? 'var(--text-light)' : n <= 160 ? '#059669' : '#dc2626';
}

// ---- CONTACT FORM FIELDS ----
let _contactFormFields = [];

async function loadContactFormFields() {
  try {
    const settings = await apiFetch('/api/design/settings');
    try { _contactFormFields = JSON.parse(settings.contact_form_fields || '[]'); } catch { _contactFormFields = []; }
  } catch { _contactFormFields = []; }
  renderContactFormFieldsAdmin();
}

function renderContactFormFieldsAdmin() {
  const list = document.getElementById('contact-fields-list');
  if (!list) return;
  const TYPE_LABELS = { checkbox: '☑ Tick Box', text: '✏ Short Text', textarea: '📝 Long Text', select: '▾ Dropdown' };
  if (!_contactFormFields.length) {
    list.innerHTML = '<p style="color:var(--text-light);font-size:0.88rem;margin:0">No extra fields yet. Click "+ Add Field" to add one.</p>';
    return;
  }
  list.innerHTML = _contactFormFields.map((f, i) => `
    <div class="form-field-item">
      <div class="form-field-item-info">
        <div class="form-field-item-label">${escHtml(f.label)}</div>
        <div class="form-field-item-meta">${escHtml(TYPE_LABELS[f.type] || f.type)}${f.type === 'select' && f.options ? ` (${f.options.length} options)` : ''} &bull; ${f.required ? '<span style="color:var(--coral)">Required</span>' : 'Optional'}</div>
      </div>
      <button class="form-field-item-del" onclick="deleteContactFormField(${i})">Delete</button>
    </div>
  `).join('');
}

function onAcfTypeChange() {
  const type = document.getElementById('acf-type').value;
  document.getElementById('acf-options-wrap').style.display = type === 'select' ? '' : 'none';
}

function openAddContactFieldForm() {
  document.getElementById('add-contact-field-form').style.display = '';
  document.getElementById('acf-label').value = '';
  document.getElementById('acf-type').value = 'checkbox';
  document.getElementById('acf-required').value = 'false';
  document.getElementById('acf-options').value = '';
  document.getElementById('acf-options-wrap').style.display = 'none';
  document.getElementById('acf-label').focus();
}

function closeAddContactFieldForm() {
  document.getElementById('add-contact-field-form').style.display = 'none';
}

async function saveContactFormField() {
  const label = document.getElementById('acf-label').value.trim();
  const type  = document.getElementById('acf-type').value;
  const required = document.getElementById('acf-required').value === 'true';
  if (!label) { toast('Please enter a label for the field', 'error'); return; }
  if (type === 'select') {
    const opts = document.getElementById('acf-options').value.split('\n').map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) { toast('Please enter at least 2 options (one per line)', 'error'); return; }
  }
  const id = 'field_' + Date.now();
  const field = { id, type, label, required };
  if (type === 'select') {
    field.options = document.getElementById('acf-options').value.split('\n').map(o => o.trim()).filter(Boolean);
  }
  _contactFormFields.push(field);
  await persistContactFormFields();
  renderContactFormFieldsAdmin();
  closeAddContactFieldForm();
}

async function deleteContactFormField(index) {
  if (!confirm('Delete this field?')) return;
  _contactFormFields.splice(index, 1);
  await persistContactFormFields();
  renderContactFormFieldsAdmin();
}

async function persistContactFormFields() {
  try {
    await apiFetch('/api/design/settings', {
      method: 'POST',
      body: JSON.stringify({ contact_form_fields: JSON.stringify(_contactFormFields) })
    });
    toast('Form fields saved', 'success');
  } catch (err) {
    toast(err.message || 'Failed to save', 'error');
  }
}

async function sendTestEmail() {
  const emailEl = document.getElementById('ds-notification_email');
  const to = emailEl ? emailEl.value.trim() : '';
  if (!to) { toast('Enter a notification email address first', 'error'); return; }
  const resultEl = document.getElementById('test-email-result');
  if (resultEl) { resultEl.textContent = 'Sending…'; resultEl.style.color = 'var(--text-light)'; }
  try {
    await apiFetch('/api/admin/test-email', { method: 'POST', body: JSON.stringify({ to }) });
    if (resultEl) { resultEl.textContent = `✅ Sent to ${to}`; resultEl.style.color = '#059669'; }
    toast(`Test email sent to ${to}`);
  } catch (err) {
    const msg = err.message || 'Failed to send';
    if (resultEl) { resultEl.textContent = `❌ ${msg}`; resultEl.style.color = '#dc2626'; }
    toast(msg, 'error');
  }
}

async function saveContentPage(page) {
  if (page === 'events') syncIncludedItems();
  const data = {};
  for (const key of (CONTENT_PAGE_KEYS[page] || [])) {
    if (key === 'private_events_content') {
      data[key] = peQuill ? peQuill.root.innerHTML : '';
    } else {
      const el = document.getElementById(`ds-${key}`);
      if (el) data[key] = el.value;
    }
  }
  try {
    await apiFetch('/api/design/settings', { method: 'POST', body: JSON.stringify(data) });
    toast('Saved!', 'success');
  } catch (err) {
    toast(err.message || 'Failed to save', 'error');
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatEnquiryCustomFields(json) {
  if (!json) return '—';
  let fields;
  try { fields = JSON.parse(json); } catch { return '—'; }
  const entries = Object.entries(fields);
  if (!entries.length) return '—';
  return entries.map(([key, val]) => {
    const label = key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    const display = val === true ? '✅ Yes' : val === false ? '—' : escHtml(String(val));
    return `<div><strong>${escHtml(label)}:</strong> ${display}</div>`;
  }).join('');
}

// ---- ENQUIRIES TAB ----
// ---- MESSAGES (ENQUIRIES) ----

async function refreshMessagesBadge() {
  try {
    const { count } = await apiFetch('/api/contact/unread-count');
    const badge = document.getElementById('messages-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

async function loadEnquiries() {
  const el = document.getElementById('content-enquiries');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const submissions = await apiFetch('/api/contact');
    refreshMessagesBadge();
    if (!submissions.length) {
      el.innerHTML = `
        <div style="text-align:center;padding:64px 24px;color:var(--text-light)">
          <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;margin:0 auto 16px;display:block;opacity:.3"><path d="M6 8h36a2 2 0 012 2v20a2 2 0 01-2 2H10l-6 6V10a2 2 0 012-2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          <p style="font-weight:700;font-size:15px;margin:0 0 4px">No messages yet</p>
          <p style="font-size:13px;margin:0">Contact form submissions will appear here</p>
        </div>`;
      return;
    }
    const unread = submissions.filter(s => !s.is_read).length;
    el.innerHTML = `
      <div class="inbox-wrap">
        <div class="inbox-toolbar">
          <span class="inbox-count">${submissions.length} message${submissions.length !== 1 ? 's' : ''}${unread > 0 ? ` &nbsp;·&nbsp; <span style="color:var(--rose)">${unread} unread</span>` : ''}</span>
        </div>
        <div class="inbox-list">
          ${submissions.map(s => renderInboxRow(s)).join('')}
        </div>
      </div>`;
  } catch {
    el.innerHTML = '<p style="padding:24px;color:red">Failed to load messages.</p>';
  }
}

function renderInboxRow(s) {
  const isUnread  = !s.is_read;
  const isReplied = !!s.replied_at;
  const now   = new Date();
  const sent  = new Date(s.created_at);
  const sameDay = sent.toDateString() === now.toDateString();
  const sameYear = sent.getFullYear() === now.getFullYear();
  const dateStr = sameDay
    ? sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : sameYear
      ? sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const preview = (s.message || '').replace(/\n/g, ' ').slice(0, 60);

  return `<div class="inbox-row ${isUnread ? 'inbox-row-unread' : ''}" id="msg-row-${s.id}" onclick="openMessage(${s.id})">
    <div class="inbox-row-avatar">${escHtml(s.name.charAt(0).toUpperCase())}</div>
    <div class="inbox-row-sender">${escHtml(s.name)}</div>
    <div class="inbox-row-preview">
      <span class="inbox-row-subject">${isReplied ? '✓ ' : ''}${escHtml(s.email)}</span>
      <span class="inbox-row-snippet"> — ${escHtml(preview)}</span>
    </div>
    <div class="inbox-row-date">${dateStr}</div>
  </div>`;
}

async function openMessage(id) {
  // Mark read first
  try { await apiFetch(`/api/contact/${id}/read`, { method: 'PATCH' }); } catch {}
  const row = document.getElementById(`msg-row-${id}`);
  if (row) row.classList.remove('inbox-row-unread');
  refreshMessagesBadge();

  // Fetch fresh data
  const submissions = await apiFetch('/api/contact');
  const s = submissions.find(x => x.id === id);
  if (!s) return;

  const date = new Date(s.created_at).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const customFields = formatEnquiryCustomFields(s.custom_fields);
  const isReplied = !!s.replied_at;

  // Build modal
  if (!document.getElementById('message-modal')) {
    const m = document.createElement('div');
    m.id = 'message-modal';
    m.className = 'modal-overlay hidden';
    m.onclick = e => { if (e.target === m) closeMessage(); };
    document.body.appendChild(m);
  }

  const modal = document.getElementById('message-modal');
  modal.innerHTML = `
    <div class="modal msg-modal">
      <!-- Email header -->
      <div class="msg-modal-header">
        <button class="msg-back-btn" onclick="closeMessage()">
          <svg viewBox="0 0 20 20" fill="none" style="width:16px;height:16px"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </button>
        <button class="modal-close" onclick="closeMessage()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <div class="msg-modal-body">
        <!-- From / meta -->
        <div class="msg-from-block">
          <div class="message-avatar">${escHtml(s.name.charAt(0).toUpperCase())}</div>
          <div class="msg-from-info">
            <div class="msg-from-name">${escHtml(s.name)}</div>
            <div class="msg-from-meta">
              <span>${escHtml(s.email)}</span>
              ${s.phone ? `<span class="msg-meta-sep">·</span><span>${escHtml(s.phone)}</span>` : ''}
            </div>
          </div>
          <div class="msg-from-date">${date}</div>
        </div>

        <!-- Message body -->
        <div class="msg-body-text">${escHtml(s.message)}</div>

        ${customFields ? `
        <div class="msg-custom-fields">
          <strong>Form responses:</strong> ${customFields}
        </div>` : ''}

        <!-- Previous reply (if any) -->
        ${isReplied ? `
        <div class="msg-prev-reply">
          <div class="msg-prev-reply-header">
            <svg viewBox="0 0 20 20" fill="none" style="width:14px;height:14px"><path d="M18 4L3 10l5.5 3L14 8l-4.5 5.5L12.5 17z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            You replied on ${new Date(s.replied_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}
          </div>
          <div class="msg-prev-reply-body">${escHtml(s.reply_body)}</div>
        </div>` : ''}

        <!-- Reply composer -->
        <div class="msg-compose">
          <div class="msg-compose-header">
            <svg viewBox="0 0 20 20" fill="none" style="width:14px;height:14px;color:var(--rose)"><path d="M18 4L3 10l5.5 3L14 8l-4.5 5.5L12.5 17z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            ${isReplied ? 'Send another reply' : `Reply to ${escHtml(s.name.split(' ')[0])}`}
            <span class="msg-compose-to">to ${escHtml(s.email)}</span>
          </div>
          <textarea id="reply-body-${s.id}" class="msg-compose-textarea" placeholder="Write your reply…"></textarea>
          <div class="msg-compose-footer">
            <button class="btn btn-primary btn-sm" onclick="sendReply(${s.id})">
              <svg viewBox="0 0 20 20" fill="none" style="width:13px;height:13px;margin-right:5px;vertical-align:middle"><path d="M18 4L3 10l5.5 3L14 8l-4.5 5.5L12.5 17z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
              Send
            </button>
            <span id="reply-status-${s.id}" style="font-size:13px;font-weight:600;margin-left:10px"></span>
            <button class="btn btn-sm" style="margin-left:auto;background:#fee2e2;color:#dc2626;border:none" onclick="deleteEnquiry(${s.id})">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  modal.classList.remove('hidden');
}

function closeMessage() {
  const m = document.getElementById('message-modal');
  if (m) m.classList.add('hidden');
}

async function sendReply(id) {
  const textarea = document.getElementById(`reply-body-${id}`);
  const statusEl = document.getElementById(`reply-status-${id}`);
  const body = textarea ? textarea.value.trim() : '';
  if (!body) { toast('Please type a reply first', 'error'); return; }

  if (statusEl) { statusEl.textContent = 'Sending…'; statusEl.style.color = 'var(--text-light)'; }
  const btn = document.querySelector(`#reply-status-${id}`)?.closest('.msg-compose-footer')?.querySelector('.btn-primary');
  if (btn) btn.disabled = true;

  try {
    await apiFetch(`/api/contact/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_body: body })
    });
    toast('Reply sent ✓');
    closeMessage();
    openMessage(id);
    const row = document.getElementById(`msg-row-${id}`);
    if (row) {
      const subject = row.querySelector('.inbox-row-subject');
      if (subject && !subject.textContent.startsWith('✓')) subject.textContent = '✓ ' + subject.textContent;
    }
  } catch (err) {
    const msg = err.message || 'Failed to send reply';
    if (statusEl) { statusEl.textContent = `❌ ${msg}`; statusEl.style.color = '#dc2626'; }
    if (btn) btn.disabled = false;
    toast(msg, 'error');
  }
}

async function markEnquiryRead(id) {
  try { await apiFetch(`/api/contact/${id}/read`, { method: 'PATCH' }); refreshMessagesBadge(); } catch {}
}

async function deleteEnquiry(id) {
  if (!confirm('Delete this message? This cannot be undone.')) return;
  try {
    await apiFetch(`/api/contact/${id}`, { method: 'DELETE' });
    closeMessage();
    document.getElementById(`msg-row-${id}`)?.remove();
    refreshMessagesBadge();
    toast('Message deleted');
  } catch { toast('Failed to delete', 'error'); }
}

// ---- PRIVATE EVENT QUOTES ----

async function refreshPQBadge() {
  try {
    const { count } = await apiFetch('/api/private-quotes/unread-count');
    const badge = document.getElementById('pq-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

let _pqSubTab = 'submissions'; // track which sub-tab is active

async function loadPrivateQuotes() {
  const el = document.getElementById('content-private-quotes');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  // Shell with two sub-tabs
  el.innerHTML = `
    <div class="design-tabs-nav content-page-tabs" style="border-bottom:1px solid #F5DDE3;padding:0 24px">
      <button class="design-tab-btn ${_pqSubTab === 'submissions' ? 'active' : ''}" onclick="switchPQTab('submissions')">Submissions</button>
      <button class="design-tab-btn ${_pqSubTab === 'config' ? 'active' : ''}" onclick="switchPQTab('config')">Configure Form</button>
    </div>
    <div id="pq-submissions-panel"></div>
    <div id="pq-config-panel" class="${_pqSubTab === 'config' ? '' : 'hidden'}"></div>`;

  if (_pqSubTab === 'submissions') {
    await renderPQSubmissions();
  } else {
    await renderPQConfig();
  }
}

async function switchPQTab(tab) {
  _pqSubTab = tab;
  // Update active button
  document.querySelectorAll('#content-private-quotes .design-tab-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().toLowerCase().startsWith(tab === 'submissions' ? 'sub' : 'con'));
  });
  document.getElementById('pq-submissions-panel').classList.toggle('hidden', tab !== 'submissions');
  document.getElementById('pq-config-panel').classList.toggle('hidden', tab !== 'config');

  if (tab === 'submissions') await renderPQSubmissions();
  else await renderPQConfig();
}

async function renderPQSubmissions() {
  const panel = document.getElementById('pq-submissions-panel');
  panel.innerHTML = '<div class="loading-state" style="padding:40px 0"><div class="spinner"></div></div>';
  try {
    const quotes = await apiFetch('/api/private-quotes', { headers: authHeaders() });
    refreshPQBadge();

    if (!quotes.length) {
      panel.innerHTML = `
        <div style="text-align:center;padding:64px 24px;color:var(--text-light)">
          <div style="font-size:48px;margin-bottom:16px;opacity:.4">🎨</div>
          <p style="font-weight:700;font-size:15px;margin:0 0 4px">No private event quotes yet</p>
          <p style="font-size:13px;margin:0">Submissions from the Private Events page will appear here</p>
        </div>`;
      return;
    }

    const unread = quotes.filter(q => !q.is_read).length;
    panel.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;padding:14px 24px;border-bottom:1px solid #F5DDE3;">
          <span style="font-size:14px;color:var(--text-mid)">
            <strong style="color:var(--text)">${quotes.length}</strong> quote${quotes.length !== 1 ? 's' : ''}
            ${unread > 0 ? `&nbsp;·&nbsp; <span style="color:var(--rose);font-weight:700">${unread} new</span>` : ''}
          </span>
        </div>
        <div class="inbox-list">
          ${quotes.map(q => renderPQRow(q)).join('')}
        </div>
      </div>`;
  } catch {
    panel.innerHTML = '<p style="padding:24px;color:red">Failed to load quotes.</p>';
  }
}

function renderPQRow(q) {
  const isUnread = !q.is_read;
  const now  = new Date();
  const sent = new Date(q.created_at);
  const sameDay  = sent.toDateString() === now.toDateString();
  const sameYear = sent.getFullYear() === now.getFullYear();
  const dateStr = sameDay
    ? sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : sameYear
      ? sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const ref = `#PQ${String(q.id).padStart(5, '0')}`;
  const fmt = p => p ? `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}` : '';
  const est = (q.estimate_low && q.estimate_high) ? ` · ${fmt(q.estimate_low)}–${fmt(q.estimate_high)}` : '';

  return `<div class="inbox-row ${isUnread ? 'inbox-row-unread' : ''}" id="pq-row-${q.id}" onclick="openPrivateQuote(${q.id})">
    <div class="inbox-row-avatar">${escHtml(q.name.charAt(0).toUpperCase())}</div>
    <div class="inbox-row-sender">${escHtml(q.name)}</div>
    <div class="inbox-row-preview">
      <span class="inbox-row-subject">${escHtml(ref)} — ${escHtml(q.activity_type)}, ${escHtml(q.group_size)} people${est}</span>
      <span class="inbox-row-snippet"> — ${escHtml(q.email)}</span>
    </div>
    <div class="inbox-row-date">${dateStr}</div>
  </div>`;
}

async function openPrivateQuote(id) {
  try {
    await apiFetch(`/api/private-quotes/${id}/read`, { method: 'PATCH', headers: authHeaders() });
    document.getElementById(`pq-row-${id}`)?.classList.remove('inbox-row-unread');
    refreshPQBadge();
  } catch {}

  const quotes = await apiFetch('/api/private-quotes', { headers: authHeaders() });
  const q = quotes.find(x => x.id === id);
  if (!q) return;

  const ref = `#PQ${String(q.id).padStart(5, '0')}`;
  const fmt = p => p ? `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}` : '—';
  const dateStr = new Date(q.created_at).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const preferredDate = q.preferred_date
    ? new Date(q.preferred_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      + (q.date_flexible ? ' (flexible)' : '')
    : 'Not specified';

  if (!document.getElementById('pq-modal')) {
    const m = document.createElement('div');
    m.id = 'pq-modal';
    m.className = 'modal-overlay hidden';
    m.onclick = e => { if (e.target === m) closePQModal(); };
    document.body.appendChild(m);
  }

  const modal = document.getElementById('pq-modal');
  modal.innerHTML = `
    <div class="modal msg-modal">
      <div class="msg-modal-header">
        <button class="msg-back-btn" onclick="closePQModal()">
          <svg viewBox="0 0 20 20" fill="none" style="width:16px;height:16px"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Back
        </button>
        <button class="modal-close" onclick="closePQModal()"><svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="msg-modal-body">
        <div style="background:linear-gradient(135deg,#2C0F18,#6B2D42);border-radius:14px;padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.65);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">${escHtml(ref)}</div>
            <div style="font-size:20px;font-weight:800;color:#fff;">${escHtml(q.activity_type)}</div>
            <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:2px;">${escHtml(q.group_size)} people</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:rgba(255,255,255,.65);margin-bottom:4px;">Estimated</div>
            <div style="font-size:22px;font-weight:900;color:#fff;">${fmt(q.estimate_low)} – ${fmt(q.estimate_high)}</div>
          </div>
        </div>

        <div class="msg-from-block" style="margin-bottom:20px;">
          <div class="message-avatar">${escHtml(q.name.charAt(0).toUpperCase())}</div>
          <div class="msg-from-info">
            <div class="msg-from-name">${escHtml(q.name)}</div>
            <div class="msg-from-meta">
              <span>${escHtml(q.email)}</span>
              ${q.phone ? `<span class="msg-meta-sep">·</span><span>${escHtml(q.phone)}</span>` : ''}
            </div>
          </div>
          <div class="msg-from-date">${dateStr}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
          ${[
            ['Activity',      q.activity_type],
            ['Group Size',    q.group_size + ' people'],
            ['Preferred Date', preferredDate],
            ['Venue',         q.venue_preference || 'Not specified'],
            ['How Heard',     q.how_heard        || 'Not specified'],
          ].map(([label, val]) => `
          <div style="background:#FFF6F8;border-radius:10px;padding:12px 14px;">
            <div style="font-size:11px;font-weight:700;color:#C4748A;margin-bottom:4px;">${escHtml(label)}</div>
            <div style="font-size:13px;font-weight:600;color:#2C2028;">${escHtml(val)}</div>
          </div>`).join('')}
        </div>

        ${q.notes ? `
        <div style="background:#FFF6F8;border-left:3px solid #C4748A;padding:14px 18px;border-radius:0 10px 10px 0;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;color:#C4748A;margin-bottom:6px;">NOTES / SPECIAL REQUESTS</div>
          <div style="font-size:14px;color:#2C2028;line-height:1.6;">${escHtml(q.notes)}</div>
        </div>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:16px;border-top:1px solid #F5DDE3;">
          <a href="mailto:${escHtml(q.email)}?subject=Re: Your Private Event Quote (${escHtml(ref)})" class="btn btn-primary btn-sm">
            ✉️ Reply to ${escHtml(q.name.split(' ')[0])}
          </a>
          ${q.phone ? `<a href="tel:${escHtml(q.phone)}" class="btn btn-ghost btn-sm">📞 Call</a>` : ''}
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;margin-left:auto"
            onclick="deletePQ(${q.id})">Delete</button>
        </div>
      </div>
    </div>`;

  modal.classList.remove('hidden');
}

function closePQModal() {
  const m = document.getElementById('pq-modal');
  if (m) m.classList.add('hidden');
}

async function deletePQ(id) {
  if (!confirm('Delete this quote request? This cannot be undone.')) return;
  try {
    await apiFetch(`/api/private-quotes/${id}`, { method: 'DELETE', headers: authHeaders() });
    closePQModal();
    document.getElementById(`pq-row-${id}`)?.remove();
    refreshPQBadge();
    toast('Quote deleted');
  } catch { toast('Failed to delete', 'error'); }
}

// ---- PRIVATE QUOTES — CONFIGURE FORM ----

async function renderPQConfig() {
  const panel = document.getElementById('pq-config-panel');
  panel.innerHTML = '<div class="loading-state" style="padding:40px 0"><div class="spinner"></div></div>';
  try {
    const config = await fetch('/api/private-quotes/config').then(r => r.json());
    renderPQConfigForm(config);
  } catch {
    panel.innerHTML = '<p style="padding:24px;color:red">Failed to load config.</p>';
  }
}

function renderPQConfigForm(config) {
  const panel = document.getElementById('pq-config-panel');

  const activityRows = config.activities.map((a, i) => `
    <div class="pq-config-row" id="pq-act-${i}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <input class="form-input" style="flex:2;min-width:0" placeholder="Activity name"
        value="${escHtml(a.name)}" oninput="updatePQActivity(${i},'name',this.value)">
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
        <span style="font-size:13px;color:var(--text-light);white-space:nowrap">£ per person</span>
        <input class="form-input" type="number" min="0" step="1" style="width:80px"
          value="${Math.round(a.price_pence / 100)}"
          oninput="updatePQActivity(${i},'price_pence',Math.round(parseFloat(this.value||0)*100))">
      </div>
      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none;flex-shrink:0"
        onclick="removePQActivity(${i})">✕</button>
    </div>`).join('');

  const sizeRows = config.group_sizes.map((s, i) => `
    <div class="pq-config-row" id="pq-size-${i}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <input class="form-input" style="flex:2;min-width:0" placeholder='e.g. 6–10'
        value="${escHtml(s.label)}" oninput="updatePQSize(${i},'label',this.value)">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;color:var(--text-light)">Min</span>
        <input class="form-input" type="number" min="1" style="width:68px"
          value="${s.min}" oninput="updatePQSize(${i},'min',parseInt(this.value)||1)">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;color:var(--text-light)">Max</span>
        <input class="form-input" type="number" min="1" style="width:68px"
          value="${s.max}" oninput="updatePQSize(${i},'max',parseInt(this.value)||1)">
      </div>
      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none;flex-shrink:0"
        onclick="removePQSize(${i})">✕</button>
    </div>`).join('');

  const venueRows = config.venues.map((v, i) => `
    <div class="pq-config-row" id="pq-venue-${i}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <input class="form-input" style="flex:1;min-width:0" placeholder="Venue option"
        value="${escHtml(v)}" oninput="updatePQVenue(${i},this.value)">
      <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none;flex-shrink:0"
        onclick="removePQVenue(${i})">✕</button>
    </div>`).join('');

  panel.innerHTML = `
    <div style="max-width:780px;padding:28px 24px;">

      <!-- Activities -->
      <div class="design-card" style="margin-bottom:20px;">
        <div class="design-card-header">
          <h3 class="design-card-title">Activities</h3>
          <span class="design-hint">Name and per-person price used to auto-calculate estimates</span>
        </div>
        <div class="design-card-body">
          <div id="pq-activities-list">${activityRows}</div>
          <button class="btn btn-ghost btn-sm" onclick="addPQActivity()">+ Add Activity</button>
        </div>
      </div>

      <!-- Group Sizes -->
      <div class="design-card" style="margin-bottom:20px;">
        <div class="design-card-header">
          <h3 class="design-card-title">Group Sizes</h3>
          <span class="design-hint">Label shown to customers · Min/Max used for price estimates</span>
        </div>
        <div class="design-card-body">
          <div style="display:flex;gap:10px;margin-bottom:8px;padding:0 0 4px;">
            <span style="flex:2;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px">Label</span>
            <span style="flex:1;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px">Min people</span>
            <span style="flex:1;font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px">Max people</span>
            <span style="width:32px"></span>
          </div>
          <div id="pq-sizes-list">${sizeRows}</div>
          <button class="btn btn-ghost btn-sm" onclick="addPQSize()">+ Add Size</button>
        </div>
      </div>

      <!-- Venue Options -->
      <div class="design-card" style="margin-bottom:28px;">
        <div class="design-card-header">
          <h3 class="design-card-title">Venue Options</h3>
          <span class="design-hint">Shown as selectable choices on the quote form</span>
        </div>
        <div class="design-card-body">
          <div id="pq-venues-list">${venueRows}</div>
          <button class="btn btn-ghost btn-sm" onclick="addPQVenue()">+ Add Option</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:16px;">
        <button class="btn btn-primary" onclick="savePQConfig()">Save Changes</button>
        <span id="pq-config-status" style="font-size:13px;color:var(--text-light)"></span>
      </div>
    </div>`;

  // Store live config in JS for mutation
  window._pqConfig = JSON.parse(JSON.stringify(config));
}

// Mutation helpers
function updatePQActivity(i, field, val) {
  if (!window._pqConfig) return;
  window._pqConfig.activities[i][field] = val;
}
function removePQActivity(i) {
  if (!window._pqConfig) return;
  window._pqConfig.activities.splice(i, 1);
  renderPQConfigForm(window._pqConfig);
}
function addPQActivity() {
  if (!window._pqConfig) return;
  window._pqConfig.activities.push({ name: '', price_pence: 3500 });
  renderPQConfigForm(window._pqConfig);
  // Focus the new name input
  const rows = document.querySelectorAll('#pq-activities-list .pq-config-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('input')?.focus();
}

function updatePQSize(i, field, val) {
  if (!window._pqConfig) return;
  window._pqConfig.group_sizes[i][field] = val;
}
function removePQSize(i) {
  if (!window._pqConfig) return;
  window._pqConfig.group_sizes.splice(i, 1);
  renderPQConfigForm(window._pqConfig);
}
function addPQSize() {
  if (!window._pqConfig) return;
  window._pqConfig.group_sizes.push({ label: '', min: 1, max: 1 });
  renderPQConfigForm(window._pqConfig);
  const rows = document.querySelectorAll('#pq-sizes-list .pq-config-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('input')?.focus();
}

function updatePQVenue(i, val) {
  if (!window._pqConfig) return;
  window._pqConfig.venues[i] = val;
}
function removePQVenue(i) {
  if (!window._pqConfig) return;
  window._pqConfig.venues.splice(i, 1);
  renderPQConfigForm(window._pqConfig);
}
function addPQVenue() {
  if (!window._pqConfig) return;
  window._pqConfig.venues.push('');
  renderPQConfigForm(window._pqConfig);
  const rows = document.querySelectorAll('#pq-venues-list .pq-config-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('input')?.focus();
}

async function savePQConfig() {
  if (!window._pqConfig) return;
  const statusEl = document.getElementById('pq-config-status');
  statusEl.textContent = 'Saving…';
  statusEl.style.color = 'var(--text-light)';
  try {
    const result = await apiFetch('/api/private-quotes/config', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(window._pqConfig),
    });
    window._pqConfig = result.config;
    statusEl.textContent = 'Saved!';
    statusEl.style.color = 'var(--green)';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
    toast('Quote form config saved', 'success');
  } catch (err) {
    statusEl.textContent = err.message || 'Save failed';
    statusEl.style.color = '#dc2626';
    toast('Failed to save config', 'error');
  }
}

// ---- GIFT VOUCHERS ----
async function loadAdminVouchers() {
  const el = document.getElementById('vouchers-table');
  if (!el) return;
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const vouchers = await apiFetch('/api/vouchers');
    if (!vouchers || vouchers.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No gift vouchers yet</p></div>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Code</th>
          <th>Amount</th>
          <th>Purchaser</th>
          <th>Recipient</th>
          <th>Status</th>
          <th>Date</th>
          <th>Actions</th>
        </tr></thead>
        <tbody>${vouchers.map(v => `
          <tr id="voucher-row-${v.id}">
            <td><code style="font-family:monospace;font-weight:700;color:var(--rose)">${escHtml(v.code)}</code></td>
            <td><strong>${formatPrice(v.amount_pence)}</strong></td>
            <td>
              <div style="font-weight:600">${escHtml(v.purchaser_name)}</div>
              <div style="color:var(--text-light);font-size:11px">${escHtml(v.purchaser_email)}</div>
            </td>
            <td>
              ${v.recipient_name ? `<div style="font-weight:600">${escHtml(v.recipient_name)}</div>` : ''}
              ${v.recipient_email ? `<div style="color:var(--text-light);font-size:11px">${escHtml(v.recipient_email)}</div>` : '<span style="color:var(--text-light);">—</span>'}
            </td>
            <td>${voucherStatusBadge(v.status)}</td>
            <td class="hide-mobile">${formatDate(v.created_at ? v.created_at.split('T')[0] : '')}</td>
            <td>
              ${v.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="cancelVoucher(${v.id})">Cancel</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><p>Failed to load vouchers</p></div>';
  }
}

function voucherStatusBadge(status) {
  const map = {
    active:    { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
    used:      { bg: '#F3F4F6', color: '#6B7280', label: 'Used' },
    pending:   { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    cancelled: { bg: '#FEE2E2', color: '#991B1B', label: 'Cancelled' },
  };
  const s = map[status] || { bg: '#F3F4F6', color: '#6B7280', label: status };
  return `<span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;">${s.label}</span>`;
}

async function cancelVoucher(id) {
  if (!confirm('Cancel this gift voucher? The code will no longer be usable.')) return;
  try {
    await apiFetch(`/api/vouchers/${id}`, { method: 'DELETE' });
    toast('Voucher cancelled.');
    loadAdminVouchers();
  } catch (err) {
    toast(err.message || 'Failed to cancel voucher.', 'error');
  }
}

// ---- DISCOUNT CODES ----
async function loadAdminDiscounts() {
  const el = document.getElementById('discounts-table');
  if (!el) return;
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const codes = await apiFetch('/api/discounts');
    if (!codes.length) {
      el.innerHTML = '<div class="empty-state"><p>No discount codes yet. Click <strong>Create Code</strong> to add one.</p></div>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Code</th>
          <th>Name</th>
          <th>Discount</th>
          <th>Uses</th>
          <th>Expires</th>
          <th>Status</th>
          <th></th>
        </tr></thead>
        <tbody>${codes.map(dc => `
          <tr>
            <td><code style="font-size:13px;font-weight:700;letter-spacing:0.5px">${escHtml(dc.code)}</code></td>
            <td>${escHtml(dc.name || '—')}</td>
            <td>${dc.discount_type === 'percentage' ? `${dc.discount_value}%` : `£${(dc.discount_value / 100).toFixed(2)}`} off</td>
            <td>${dc.used_count}${dc.max_uses ? ` / ${dc.max_uses}` : ''}</td>
            <td class="hide-mobile">${dc.expires_at ? formatDate(dc.expires_at.split('T')[0]) : '—'}</td>
            <td>
              <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;${dc.is_active ? '' : 'opacity:0.6'}"
                onclick="toggleDiscount(${dc.id})">${dc.is_active ? discountBadge('active') : discountBadge('inactive')}</button>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="deleteDiscount(${dc.id})" title="Delete">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function discountBadge(status) {
  if (status === 'active') return '<span style="background:#D1FAE5;color:#065F46;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;">Active</span>';
  return '<span style="background:#F3F4F6;color:#6B7280;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;">Inactive</span>';
}

function generateDiscountCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n) => Array.from({length: n}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return seg(4) + seg(4);
}

function openCreateDiscountModal() {
  const body = document.getElementById('discount-form-body');
  const code = generateDiscountCode();
  body.innerHTML = `
    <div class="form-group">
      <label>Code <span style="color:var(--text-light);font-size:12px">Customers enter this at checkout</span></label>
      <div style="display:flex;gap:8px">
        <input type="text" id="dc-code" value="${code}" style="text-transform:uppercase;flex:1;font-weight:700;letter-spacing:1px">
        <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('dc-code').value=generateDiscountCode()">Regenerate</button>
      </div>
    </div>
    <div class="form-group">
      <label>Name / Description <span style="color:var(--text-light);font-size:12px">Optional — shown to customer on apply</span></label>
      <input type="text" id="dc-name" placeholder="e.g. Summer Sale 2026">
    </div>
    <div class="form-group">
      <label>Discount Type</label>
      <select id="dc-type" onchange="updateDiscountValueLabel()">
        <option value="percentage">Percentage (%)</option>
        <option value="fixed">Fixed Amount (£)</option>
      </select>
    </div>
    <div class="form-group">
      <label id="dc-value-label">Discount Value (%)</label>
      <input type="number" id="dc-value" min="1" placeholder="e.g. 20" style="max-width:140px">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-group">
        <label>Max Uses <span style="color:var(--text-light);font-size:12px">Leave blank for unlimited</span></label>
        <input type="number" id="dc-max-uses" min="1" placeholder="e.g. 50">
      </div>
      <div class="form-group">
        <label>Expiry Date <span style="color:var(--text-light);font-size:12px">Optional</span></label>
        <input type="date" id="dc-expires">
      </div>
    </div>
    <div class="form-group">
      <label>Minimum Order Value <span style="color:var(--text-light);font-size:12px">Optional — £0 means no minimum</span></label>
      <input type="number" id="dc-min-order" min="0" step="0.01" placeholder="e.g. 25.00" style="max-width:140px">
    </div>
    <div style="display:flex;gap:12px;margin-top:8px">
      <button class="btn btn-ghost btn-full" onclick="closeAdminModal('discount-form-modal')">Cancel</button>
      <button class="btn btn-primary btn-full" onclick="saveDiscount()">Create Code</button>
    </div>`;
  document.getElementById('discount-form-modal').classList.remove('hidden');
}

function updateDiscountValueLabel() {
  const type = document.getElementById('dc-type').value;
  document.getElementById('dc-value-label').textContent = type === 'percentage' ? 'Discount Value (%)' : 'Discount Value (£)';
}

async function saveDiscount() {
  const code = document.getElementById('dc-code').value.toUpperCase().trim();
  const name = document.getElementById('dc-name').value.trim();
  const type = document.getElementById('dc-type').value;
  const value = parseFloat(document.getElementById('dc-value').value);
  const maxUses = document.getElementById('dc-max-uses').value;
  const expires = document.getElementById('dc-expires').value;
  const minOrder = document.getElementById('dc-min-order').value;

  if (!code) { toast('Code is required.', 'error'); return; }
  if (!value || value <= 0) { toast('Enter a valid discount value.', 'error'); return; }
  if (type === 'percentage' && value > 100) { toast('Percentage cannot exceed 100.', 'error'); return; }

  try {
    await apiFetch('/api/discounts', {
      method: 'POST',
      body: JSON.stringify({
        code, name, discount_type: type, discount_value: value,
        max_uses: maxUses || null,
        expires_at: expires || null,
        min_order_pence: minOrder ? parseFloat(minOrder) : 0
      })
    });
    toast('Discount code created.');
    closeAdminModal('discount-form-modal');
    loadAdminDiscounts();
  } catch (err) {
    toast(err.message || 'Failed to create code.', 'error');
  }
}

async function toggleDiscount(id) {
  try {
    await apiFetch(`/api/discounts/${id}/toggle`, { method: 'PATCH' });
    loadAdminDiscounts();
  } catch (err) {
    toast(err.message || 'Failed to update code.', 'error');
  }
}

async function deleteDiscount(id) {
  if (!confirm('Delete this discount code permanently?')) return;
  try {
    await apiFetch(`/api/discounts/${id}`, { method: 'DELETE' });
    toast('Discount code deleted.');
    loadAdminDiscounts();
  } catch (err) {
    toast(err.message || 'Failed to delete code.', 'error');
  }
}

// ---- CATEGORIES ----
async function loadAdminCategories() {
  const el = document.getElementById('categories-table');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const cats = await apiFetch('/api/categories');
    if (!cats.length) {
      el.innerHTML = '<div class="empty-state"><p>No categories yet. Add your first one.</p></div>';
      return;
    }
    el.innerHTML = `<div class="category-grid">${cats.map(c => `
      <div class="category-card">
        <div class="category-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h4v4H3zM3 13h4v4H3zM9 7h12M9 10h8M9 13h12M9 16h8"/></svg>
        </div>
        <div class="category-card-info">
          <div class="category-card-name">${escHtml(c.name)}</div>
          <div class="category-card-count">${c.event_count} event${c.event_count !== 1 ? 's' : ''}</div>
        </div>
        <button class="category-delete-btn" onclick="deleteCategory(${c.id}, '${escHtml(c.name)}', ${c.event_count})" title="Delete category">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>
        </button>
      </div>`).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
  }
}

function openAddCategoryModal() {
  const modal = document.getElementById('generic-modal');
  const body  = document.getElementById('generic-modal-body');
  body.innerHTML = `
    <div class="modal-header">
      <h2>Add Category</h2>
      <button class="modal-close" onclick="closeAdminModal('generic-modal')">✕</button>
    </div>
    <div class="modal-body" style="padding:24px">
      <div class="form-group">
        <label>Category Name *</label>
        <input type="text" id="new-category-name" placeholder="e.g. Watercolour" style="text-transform:capitalize" autofocus>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn btn-primary" onclick="submitAddCategory()">Add Category</button>
        <button class="btn btn-ghost" onclick="closeAdminModal('generic-modal')">Cancel</button>
      </div>
    </div>`;
  document.getElementById('generic-modal').classList.remove('hidden');
}

async function submitAddCategory() {
  const name = document.getElementById('new-category-name')?.value.trim();
  if (!name) { toast('Please enter a category name.', 'error'); return; }
  try {
    await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    toast('Category added.');
    closeAdminModal('generic-modal');
    loadAdminCategories();
  } catch (err) {
    toast(err.message || 'Failed to add category.', 'error');
  }
}

async function deleteCategory(id, name, eventCount) {
  if (eventCount > 0) {
    toast(`Cannot delete "${name}" — ${eventCount} event(s) are assigned to it.`, 'error');
    return;
  }
  if (!confirm(`Delete category "${name}"?`)) return;
  try {
    await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
    toast('Category deleted.');
    loadAdminCategories();
  } catch (err) {
    toast(err.message || 'Failed to delete category.', 'error');
  }
}
