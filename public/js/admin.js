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

  const titles = { overview: 'Overview', events: 'Events', bookings: 'Bookings', customers: 'Customers', payments: 'Payments', design: 'Design' };
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
// DESIGN TAB
// =============================================
let designSettings = {};

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

        <button class="btn btn-primary btn-full" onclick="saveDesign()" id="design-save-btn">Save All Changes</button>

      </div>
    </div>`;

  initDropZones();
}

// ---- COLOUR FIELDS ----
function renderColorField(key, label, value) {
  return `
    <div class="color-field">
      <label class="color-swatch-wrap" for="ds-${key}" title="Click to change colour">
        <div class="color-swatch" id="swatch-${key}" style="background:${escHtml(value)}"></div>
      </label>
      <input type="color" id="ds-${key}" value="${escHtml(value)}" class="color-picker-input"
             oninput="onColorInput('${key}', this.value)">
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
