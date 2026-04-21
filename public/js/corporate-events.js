/* ========================================================================
   CORPORATE / TEAM-BUILDING LANDING PAGE
   - Populates CMS-driven text (hero title/sub, intro, testimonials, trusted-by)
   - Handles enquiry form submission → /api/private-quotes with quote_type=corporate
   ======================================================================== */

(function () {
  const TYPE = 'corporate';

  // Load page content from site_settings via existing /api/design/settings
  async function hydratePage() {
    try {
      const s = await fetch('/api/design/settings', { cache: 'no-store' }).then(r => r.json());

      if (s.corporate_events_hero_title) {
        document.getElementById('ce-hero-title').textContent = s.corporate_events_hero_title;
      }
      if (s.corporate_events_hero_sub) {
        document.getElementById('ce-hero-sub').textContent = s.corporate_events_hero_sub;
      }
      if (s.corporate_events_intro) {
        document.getElementById('ce-intro').textContent = s.corporate_events_intro;
      }

      // Testimonials (JSON array)
      const grid = document.getElementById('ce-testimonials-grid');
      let testimonials = [];
      try { testimonials = JSON.parse(s.corporate_events_testimonials || '[]'); } catch {}
      if (testimonials.length && grid) {
        grid.innerHTML = testimonials.map(t => `
          <div class="ce-testimonial">
            <p class="ce-testimonial-q">${escHtml(t.quote || '')}</p>
            <p class="ce-testimonial-a">${escHtml(t.author || '')}</p>
            <p class="ce-testimonial-r">${escHtml(t.role || '')}</p>
          </div>
        `).join('');
      }

      // Trusted-by companies (comma-separated string)
      const trustedStr = (s.corporate_events_trusted_by || '').trim();
      if (trustedStr) {
        const wrap = document.getElementById('ce-trusted');
        const list = document.getElementById('ce-trusted-list');
        wrap.classList.remove('hidden');
        list.innerHTML = trustedStr
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
          .map(x => `<span class="ce-trusted-item">${escHtml(x)}</span>`)
          .join('');
      }
    } catch (err) {
      // Non-fatal — the page has sensible default content in the HTML.
      console.warn('Corporate page content hydration failed:', err);
    }
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showError(msg) {
    const el = document.getElementById('ce-error');
    el.textContent = msg;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Very light email validity — we don't try to block free-mail domains;
  // HR admins often use a personal account for initial enquiries.
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  window.submitCorporateQuote = async function submitCorporateQuote() {
    const btn = document.getElementById('ce-submit-btn');
    const err = document.getElementById('ce-error');
    err.textContent = '';

    const data = {
      quote_type: TYPE,
      activity_type: 'Corporate / Team Building',
      name:     document.getElementById('ce-name').value.trim(),
      job_title:document.getElementById('ce-job').value.trim(),
      email:    document.getElementById('ce-email').value.trim(),
      phone:    document.getElementById('ce-phone').value.trim(),
      company:  document.getElementById('ce-company').value.trim(),
      group_size: document.getElementById('ce-size').value,
      preferred_date: document.getElementById('ce-date').value,
      date_flexible:  document.getElementById('ce-date-flex').checked,
      venue_preference: document.getElementById('ce-format').value,
      budget_range:    document.getElementById('ce-budget').value,
      how_heard: document.getElementById('ce-heard').value,
      notes:     document.getElementById('ce-notes').value.trim(),
    };

    // Validation — inline, friendly
    if (!data.name)           return showError('Please tell us your name.');
    if (!data.email)          return showError('Please give us an email address.');
    if (!isValidEmail(data.email)) return showError('That email doesn\'t look quite right — please double-check.');
    if (!data.company)        return showError('Which company is this for?');
    if (!data.group_size)     return showError('Please pick a team size so we can pitch accurately.');

    btn.disabled = true;
    btn.textContent = 'Sending…';

    // Source attribution (survives navigation, set by /js/source-tracker.js)
    try {
      if (window.PBSource && typeof window.PBSource.get === 'function') {
        const src = window.PBSource.get();
        if (src) Object.assign(data, src);
      }
    } catch {}

    try {
      const res = await fetch('/api/private-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (!res.ok) {
        showError(out.error || 'Something went wrong — please try again, or drop us an email.');
        btn.disabled = false;
        btn.textContent = 'Send enquiry';
        return;
      }

      document.getElementById('ce-form-card').classList.add('hidden');
      const ok = document.getElementById('ce-success');
      ok.classList.remove('hidden');
      document.getElementById('ce-success-ref').textContent = out.quote_ref || '';
      ok.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      showError('Network hiccup — please check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Send enquiry';
    }
  };

  document.addEventListener('DOMContentLoaded', hydratePage);
})();
