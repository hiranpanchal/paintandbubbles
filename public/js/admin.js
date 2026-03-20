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
  location.reload();
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  switchTab('overview');
}

// ---- TABS ----
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`content-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('active');

  const titles = { overview: 'Overview', events: 'Events', bookings: 'Bookings', customers: 'Customers', payments: 'Payments', design: 'Design', faq: 'FAQ' };
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
  else if (tab === 'faq')    loadAdminFAQs();
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
  const title = eventId ? 'Edit Event' : 'Add Event';
  document.getElementById('event-form-title').textContent = title;

  if (eventId) {
    apiFetch(`/api/events/${eventId}`).then(event => renderEventForm(event)).catch(() => toast('Failed to load event', 'error'));
  } else {
    renderEventForm(null);
  }
  openAdminModal('event-form-modal');
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
        <tr>
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

function debouncedCustomerSearch() {
  clearTimeout(customerSearchTimeout);
  customerSearchTimeout = setTimeout(loadAdminCustomers, 350);
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
  // Automatically inject the auth token whenever it is available
  const autoAuth = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...autoAuth, ...opts.headers },
    ...opts
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
    <div class="design-layout">

      <!-- LEFT COL: Images + Colours -->
      <div class="design-col">

        <!-- Images -->
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Images</h3></div>
          <div class="design-card-body">
            <div class="dz-label">Logo</div>
            ${renderDropZone('logo_url', s.logo_url)}
            <div class="dz-label" style="margin-top:20px">Hero Background Image</div>
            ${renderDropZone('hero_image_url', s.hero_image_url)}
            <div class="dz-label" style="margin-top:20px">About Section Image</div>
            ${renderDropZone('about_image_url', s.about_image_url)}
          </div>
        </div>

        <!-- Brand Colours -->
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

      </div>

      <!-- RIGHT COL: Content -->
      <div class="design-col">

        <!-- Hero -->
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Hero Section</h3></div>
          <div class="design-card-body">
            <div class="form-row">
              <div class="form-group">
                <label>Title Text</label>
                <input type="text" id="ds-hero_title" value="${escHtml(s.hero_title || 'Paint, Create')}" placeholder="Paint, Create">
              </div>
              <div class="form-group">
                <label>Title Highlight <span class="design-hint">(coloured part)</span></label>
                <input type="text" id="ds-hero_title_highlight" value="${escHtml(s.hero_title_highlight || '& Celebrate')}" placeholder="& Celebrate">
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

        <!-- About -->
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">About Section</h3></div>
          <div class="design-card-body">
            <div class="form-group">
              <label>Section Title</label>
              <input type="text" id="ds-about_title" value="${escHtml(s.about_title || 'Where creativity meets good company')}">
            </div>
            <div class="form-group">
              <label>Body — Paragraph 1</label>
              <textarea id="ds-about_body_1" rows="3">${escHtml(s.about_body_1 || '')}</textarea>
            </div>
            <div class="form-group">
              <label>Body — Paragraph 2</label>
              <textarea id="ds-about_body_2" rows="3">${escHtml(s.about_body_2 || '')}</textarea>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Footer</h3></div>
          <div class="design-card-body">
            <div class="form-group">
              <label>Tagline</label>
              <input type="text" id="ds-footer_tagline" value="${escHtml(s.footer_tagline || 'Creative events for everyone')}">
            </div>
          </div>
        </div>

        <!-- Trust Cards -->
        <div class="design-card">
          <div class="design-card-header"><h3 class="design-card-title">Trust Cards</h3></div>
          <div class="design-card-body">
            ${[1,2,3,4].map(i => `
              <div ${i < 4 ? 'style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border);"' : ''}>
                <div class="trust-card-edit-num">Card ${i}</div>
                ${renderIconPicker(i, s[`trust_${i}_icon`] || '')}
                <div class="form-row" style="margin-top:12px;">
                  <div class="form-group">
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

        <button class="btn btn-primary btn-full" onclick="saveDesign()" id="design-save-btn">Save All Changes</button>

      </div>
    </div>`;

  initDropZones();
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
        <div class="color-field-hex" id="hex-${key}">${value}</div>
      </div>
    </div>`;
}

function onColorInput(key, value) {
  document.getElementById(`swatch-${key}`).style.background = value;
  document.getElementById(`hex-${key}`).textContent = value;
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
