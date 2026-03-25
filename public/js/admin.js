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
  switchTab('overview');
}

// ---- TABS ----
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`content-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('active');

  const titles = { overview: 'Overview', events: 'Events', bookings: 'Bookings', customers: 'Customers', payments: 'Payments', design: 'Design', faq: 'FAQ', reviews: 'Reviews', users: 'Users', content: 'Content', enquiries: 'Enquiries' };
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
  else if (tab === 'enquiries') loadEnquiries();
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
      </tr></thead>
      <tbody>${bookings.map(b => `
        <tr>
          <td><div style="font-weight:600">${escHtml(b.customer_name)}</div><div style="color:var(--text-light);font-size:11px">${escHtml(b.customer_email)}</div></td>
          <td>${escHtml(b.event_title)}</td>
          <td class="hide-mobile">${formatDate(b.event_date)}</td>
          <td>${statusBadge(b.status)}</td>
          <td><strong>${formatPrice(b.total_pence)}</strong></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
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
    const events = await apiFetch('/api/events?include_inactive=true', { headers: authHeaders() });
    renderEventsTable(events);
  } catch { el.innerHTML = '<div class="empty-state"><p>Failed to load events</p></div>'; }
}

function renderEventsTable(events) {
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
          </td>
          <td>${e.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Hidden</span>'}</td>
          <td>
            <div class="actions">
              <button class="btn btn-ghost btn-xs" onclick="openEventForm(${e.id})">Edit</button>
              <button class="btn btn-xs" style="background:#fee2e2;color:#dc2626;border:none" onclick="confirmDelete(${e.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
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

function renderEventForm(event = null) {
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
          ${['Painting','Craft','Pottery','Drawing','Sculpture','Other'].map(c =>
            `<option value="${c}" ${event?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
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
      <label>Image URL (optional)</label>
      <input type="url" id="ef-image" value="${escHtml(event?.image_url || '')}" placeholder="https://...">
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
    </div>`;
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
        <tr>
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
          <td>
            <select class="btn btn-xs btn-ghost" onchange="updateBookingStatus(${b.id}, this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer">
              ${['pending','confirmed','cancelled','refunded'].map(s =>
                `<option value="${s}" ${b.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
              ).join('')}
            </select>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function updateBookingStatus(id, status) {
  try {
    await apiFetch(`/api/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }), headers: authHeaders() });
    toast('Booking updated', 'success');
  } catch (err) {
    toast(err.message || 'Failed to update', 'error');
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
      <div class="design-section-title" style="margin-bottom:8px">Payment Providers</div>
      <p style="color:#888;font-size:14px;margin-bottom:28px">Enable one or both providers. Customers will see a choice if both are active. Leave credentials blank to use environment variables if set.</p>

      <div class="design-card">
        <div class="design-card-title" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:17px;font-weight:700">Stripe</span>
          <label class="pay-toggle">
            <input type="checkbox" id="ps-stripe-enabled" ${s.stripe_enabled === 'true' ? 'checked' : ''}>
            <span class="pay-toggle-track"><span class="pay-toggle-thumb"></span></span>
          </label>
        </div>
        <div class="design-card-body" style="display:flex;flex-direction:column;gap:14px;margin-top:16px">
          <div>
            <label class="design-label">Publishable Key</label>
            <input class="design-input" id="ps-stripe-pk" type="text" placeholder="pk_live_…" value="${escAdminHtml(s.stripe_publishable_key || '')}">
          </div>
          <div>
            <label class="design-label">Secret Key</label>
            <input class="design-input" id="ps-stripe-sk" type="password" placeholder="sk_live_…" value="${escAdminHtml(s.stripe_secret_key || '')}">
          </div>
          <div>
            <label class="design-label">Webhook Secret</label>
            <input class="design-input" id="ps-stripe-ws" type="password" placeholder="whsec_…" value="${escAdminHtml(s.stripe_webhook_secret || '')}">
            <p style="font-size:12px;color:#aaa;margin-top:4px">Webhook endpoint: <code>${location.origin}/api/payments/webhook</code></p>
          </div>
        </div>
      </div>

      <div class="design-card" style="margin-top:20px">
        <div class="design-card-title" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:17px;font-weight:700">SumUp</span>
          <label class="pay-toggle">
            <input type="checkbox" id="ps-sumup-enabled" ${s.sumup_enabled === 'true' ? 'checked' : ''}>
            <span class="pay-toggle-track"><span class="pay-toggle-thumb"></span></span>
          </label>
        </div>
        <div class="design-card-body" style="display:flex;flex-direction:column;gap:14px;margin-top:16px">
          <div>
            <label class="design-label">API Key</label>
            <input class="design-input" id="ps-sumup-key" type="password" placeholder="sup_sk_…" value="${escAdminHtml(s.sumup_api_key || '')}">
          </div>
          <div>
            <label class="design-label">Merchant Code</label>
            <input class="design-input" id="ps-sumup-merchant" type="text" placeholder="MXXXXX" value="${escAdminHtml(s.sumup_merchant_code || '')}">
          </div>
        </div>
      </div>

      <button class="btn btn-primary" style="margin-top:24px" onclick="savePaymentSettings()">Save Payment Settings</button>
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
          <div class="design-card-header"><h3 class="design-card-title">Logo</h3></div>
          <div class="design-card-body">${renderDropZone('logo_url', s.logo_url)}</div>
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

// ---- GALLERY IMAGES ----
async function renderGalleryGrid() {
  const settings = await fetch('/api/design/settings', {
    headers: { Authorization: `Bearer ${authToken}` }
  }).then(r=>r.json());
  let images = [];
  try { images = JSON.parse(settings.gallery_images || '[]'); } catch {}
  const grid = document.getElementById('gallery-admin-grid');
  if (!grid) return;
  if (images.length === 0) {
    grid.innerHTML = '<p style="color:#aaa;font-size:0.9rem;margin:0">No gallery images yet.</p>';
    return;
  }
  grid.innerHTML = images.map((url, i) => `
    <div class="gallery-admin-item">
      <img src="${escAdminHtml(url)}" alt="Gallery image ${i+1}">
      <button class="gallery-admin-remove" onclick="removeGalleryImage(${i})" title="Remove">\u00d7</button>
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
  // Fetch current gallery_images, append, save
  const settings = await fetch('/api/design/settings', {
    headers: { Authorization: `Bearer ${authToken}` }
  }).then(r=>r.json());
  let images = [];
  try { images = JSON.parse(settings.gallery_images || '[]'); } catch {}
  images.push(data.url);
  await fetch('/api/design/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ gallery_images: JSON.stringify(images) })
  });
  return data.url;
}

async function removeGalleryImage(index) {
  const settings = await fetch('/api/design/settings', {
    headers: { Authorization: `Bearer ${authToken}` }
  }).then(r=>r.json());
  let images = [];
  try { images = JSON.parse(settings.gallery_images || '[]'); } catch {}
  images.splice(index, 1);
  await fetch('/api/design/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ gallery_images: JSON.stringify(images) })
  });
  renderGalleryGrid();
  toast('Image removed', 'success');
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

  if (!author_name || !body) { toast('Author name and review text are required', 'error'); return; }

  try {
    if (id) {
      await apiFetch(`/api/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ author_name, class_attended, author_location, review_date, rating, body, is_published }) });
      toast('Review updated');
    } else {
      await apiFetch('/api/reviews', { method: 'POST', body: JSON.stringify({ author_name, class_attended, author_location, review_date, rating, body, is_published }) });
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
          ` : `<p style="font-size:14px;color:var(--text-light);text-align:center;padding:8px 0">This is your account. To change your password, sign out and use another super admin account.</p>`}
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
  if (!pw || pw.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
  if (pw !== confirm) { toast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
    toast('Password updated successfully');
    document.getElementById('ud-pw-new').value = '';
    document.getElementById('ud-pw-confirm').value = '';
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
            <input type="password" id="user-form-password" placeholder="Min. 8 characters">
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
              <span class="design-hint">Where to send an alert when someone submits the contact form</span>
            </div>
            <div class="design-card-body">
              <div class="form-group">
                <label>Send notifications to</label>
                <input type="email" id="ds-notification_email" placeholder="you@example.com" value="${escHtml(s.notification_email || '')}">
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
  home:             ['hero_title','hero_title_highlight','hero_subtitle','hero_cta_primary_text','hero_cta_primary_url','hero_cta_secondary_text','hero_cta_secondary_url','about_title','about_body_1','about_body_2','footer_tagline'],
  about:            ['aboutpage_hero_title','aboutpage_hero_sub','aboutpage_label','aboutpage_title','aboutpage_body_1','aboutpage_body_2','aboutpage_body_3','aboutpage_pillar_1_title','aboutpage_pillar_1_text','aboutpage_pillar_2_title','aboutpage_pillar_2_text','aboutpage_pillar_3_title','aboutpage_pillar_3_text'],
  events:           ['included_title','included_items','please_note_title','please_note_text'],
  contact:          ['contact_hero_title','contact_hero_sub','contact_page_text','notification_email'],
  'private-events': ['private_events_hero_title','private_events_hero_sub','private_events_content'],
  gallery:          ['gallery_hero_title','gallery_hero_sub'],
};

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

function escAdminHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- ENQUIRIES TAB ----
async function loadEnquiries() {
  const el = document.getElementById('content-enquiries');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const submissions = await apiFetch('/api/contact');
    if (!submissions.length) {
      el.innerHTML = '<div class="card"><div style="padding:40px;text-align:center;color:var(--text-light);font-weight:600">No enquiries yet</div></div>';
      return;
    }
    el.innerHTML = `<div class="card"><div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Phone</th><th>Message</th><th>Date</th><th></th>
      </tr></thead>
      <tbody>${submissions.map(s => `
        <tr class="${s.is_read ? '' : 'unread-row'}" id="enq-row-${s.id}">
          <td><strong>${escAdminHtml(s.name)}</strong></td>
          <td><a href="mailto:${escAdminHtml(s.email)}">${escAdminHtml(s.email)}</a></td>
          <td>${escAdminHtml(s.phone || '\u2014')}</td>
          <td style="max-width:320px;white-space:pre-wrap">${escAdminHtml(s.message)}</td>
          <td style="white-space:nowrap">${new Date(s.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
          <td style="display:flex;gap:8px">
            ${!s.is_read ? `<button class="btn btn-ghost btn-sm" onclick="markEnquiryRead(${s.id})">Mark Read</button>` : '<span style="color:var(--text-light);font-size:13px">Read</span>'}
            <button class="btn btn-danger btn-sm" onclick="deleteEnquiry(${s.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
  } catch {
    el.innerHTML = '<p style="padding:24px;color:red">Failed to load enquiries.</p>';
  }
}

async function markEnquiryRead(id) {
  try {
    await apiFetch(`/api/contact/${id}/read`, { method: 'PATCH' });
    const row = document.getElementById(`enq-row-${id}`);
    if (row) {
      row.classList.remove('unread-row');
      const btn = row.querySelector('button.btn-ghost');
      if (btn) btn.outerHTML = '<span style="color:var(--text-light);font-size:13px">Read</span>';
    }
  } catch { alert('Failed to mark as read.'); }
}

async function deleteEnquiry(id) {
  if (!confirm('Delete this enquiry?')) return;
  try {
    await apiFetch(`/api/contact/${id}`, { method: 'DELETE' });
    document.getElementById(`enq-row-${id}`)?.remove();
  } catch { alert('Failed to delete.'); }
}
