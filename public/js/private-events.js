/* =============================================
   PAINT & BUBBLES — PRIVATE EVENTS PAGE
   Quote form, design settings, social section
   ============================================= */

// ─── Quote form state ─────────────────────────────────────────────────────────

const ACTIVITIES = [
  { icon: '🖌️', name: 'Sip & Paint' },
  { icon: '🎨', name: 'Canvas Workshop' },
  { icon: '🌊', name: 'Watercolour Workshop' },
  { icon: '✏️', name: 'Life Drawing' },
  { icon: '🎭', name: 'Craft Night' },
  { icon: '🎈', name: "Kids' Art Party" },
  { icon: '✨', name: 'Custom / Other' },
];

const GROUP_SIZES = ['6–10', '11–15', '16–20', '21–30', '30+'];

const VENUES = ['Your venue', 'Our venue', 'Flexible'];

const BUDGETS = [
  { amount: 'Under £200', sub: 'Small group' },
  { amount: '£200–£400', sub: 'Mid-size'   },
  { amount: '£400–£700', sub: 'Larger group'},
  { amount: '£700–£1,000', sub: 'Big event' },
  { amount: '£1,000+', sub: 'Premium'       },
  { amount: 'Not sure', sub: 'Let\'s chat'  },
];

let currentStep = 1;
let quoteData = {
  activity_type:    null,
  group_size:       null,
  preferred_date:   '',
  date_flexible:    false,
  venue_preference: null,
  budget_range:     null,
  notes:            '',
  name:             '',
  email:            '',
  phone:            '',
  how_heard:        '',
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  buildStep1();
  buildStep2();
  await applyDesignSettings();
});

function buildStep1() {
  // Activity grid
  const grid = document.getElementById('pe-activity-grid');
  if (grid) {
    grid.innerHTML = ACTIVITIES.map(a => `
      <div class="pe-activity-card" data-activity="${escHtml(a.name)}" onclick="selectActivity('${escHtml(a.name)}', this)">
        <div class="pe-activity-icon">${a.icon}</div>
        <div class="pe-activity-name">${escHtml(a.name)}</div>
      </div>`).join('');
  }

  // Group size pills
  const pills = document.getElementById('pe-group-pills');
  if (pills) {
    pills.innerHTML = GROUP_SIZES.map(s => `
      <div class="pe-pill" data-size="${escHtml(s)}" onclick="selectGroupSize('${escHtml(s)}', this)">
        ${escHtml(s)} people
      </div>`).join('');
  }
}

function buildStep2() {
  // Venue pills
  const venuePills = document.getElementById('pe-venue-pills');
  if (venuePills) {
    venuePills.innerHTML = VENUES.map(v => `
      <div class="pe-pill" data-venue="${escHtml(v)}" onclick="selectVenue('${escHtml(v)}', this)">
        ${escHtml(v)}
      </div>`).join('');
  }

  // Budget grid
  const budgetGrid = document.getElementById('pe-budget-grid');
  if (budgetGrid) {
    budgetGrid.innerHTML = BUDGETS.map(b => `
      <div class="pe-budget-card" data-budget="${escHtml(b.amount)}" onclick="selectBudget('${escHtml(b.amount)}', this)">
        <div class="pe-budget-amount">${escHtml(b.amount)}</div>
        <div class="pe-budget-sub">${escHtml(b.sub)}</div>
      </div>`).join('');
  }
}

// ─── Selection handlers ───────────────────────────────────────────────────────

function selectActivity(name, el) {
  document.querySelectorAll('.pe-activity-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  quoteData.activity_type = name;
  clearError();
}

function selectGroupSize(size, el) {
  document.querySelectorAll('#pe-group-pills .pe-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  quoteData.group_size = size;
  clearError();
}

function selectVenue(venue, el) {
  document.querySelectorAll('#pe-venue-pills .pe-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  quoteData.venue_preference = venue;
}

function selectBudget(budget, el) {
  document.querySelectorAll('.pe-budget-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  quoteData.budget_range = budget;
}

// ─── Step navigation ──────────────────────────────────────────────────────────

function peStep(dir) {
  clearError();

  if (dir === 1) {
    // Validate current step before advancing
    if (currentStep === 1) {
      if (!quoteData.activity_type) return showError('Please choose an activity type');
      if (!quoteData.group_size)    return showError('Please select a group size');
    }
    if (currentStep === 2) {
      // Step 2 is all optional — just collect values
      quoteData.preferred_date  = document.getElementById('pe-date').value;
      quoteData.date_flexible   = document.getElementById('pe-date-flexible').checked;
      quoteData.notes           = document.getElementById('pe-notes').value.trim();
    }
    if (currentStep === 3) {
      quoteData.name     = document.getElementById('pe-name').value.trim();
      quoteData.email    = document.getElementById('pe-email').value.trim();
      quoteData.phone    = document.getElementById('pe-phone').value.trim();
      quoteData.how_heard = document.getElementById('pe-how-heard').value;

      if (!quoteData.name)  return showError('Please enter your name');
      if (!quoteData.email) return showError('Please enter your email address');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteData.email)) return showError('Please enter a valid email address');

      submitQuote();
      return;
    }
  }

  const next = currentStep + dir;
  if (next < 1 || next > 3) return;

  // Hide current panel
  document.getElementById(`pe-panel-${currentStep}`).classList.add('hidden');
  // Show next panel
  document.getElementById(`pe-panel-${next}`).classList.remove('hidden');

  // Update step dots
  const prevDot = document.getElementById(`step-dot-${currentStep}`);
  const nextDot = document.getElementById(`step-dot-${next}`);
  if (dir === 1) {
    prevDot.classList.remove('active');
    prevDot.classList.add('done');
  } else {
    prevDot.classList.remove('active', 'done');
    nextDot.classList.remove('done');
  }
  nextDot.classList.add('active');

  currentStep = next;

  // Show/hide back button
  document.getElementById('pe-back-btn').style.display = currentStep === 1 ? 'none' : '';
  // Update next button label
  const nextBtn = document.getElementById('pe-next-btn');
  nextBtn.textContent = currentStep === 3 ? '🎨 Get My Quote' : 'Next →';

  // Scroll form into view on mobile
  document.getElementById('pe-quote-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showError(msg) {
  document.getElementById('pe-error').textContent = msg;
}

function clearError() {
  const el = document.getElementById('pe-error');
  if (el) el.textContent = '';
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitQuote() {
  const nextBtn = document.getElementById('pe-next-btn');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/private-quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteData),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      nextBtn.disabled = false;
      nextBtn.textContent = '🎨 Get My Quote';
      return;
    }

    // Show success screen
    document.getElementById('pe-quote-card').classList.add('hidden');
    document.getElementById('pe-steps').classList.add('hidden');
    document.getElementById('pe-success').classList.remove('hidden');

    document.getElementById('pe-success-ref').textContent = data.quote_ref;

    const low  = data.estimate.low;
    const high = data.estimate.high;
    const fmt  = p => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`;
    document.getElementById('pe-estimate-range').textContent = `${fmt(low)} – ${fmt(high)}`;
    document.getElementById('pe-estimate-note').textContent =
      `Based on ${quoteData.group_size} people · ${quoteData.activity_type} · final quote may vary`;

    document.getElementById('pe-success').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    showError('Network error — please check your connection and try again.');
    nextBtn.disabled = false;
    nextBtn.textContent = '🎨 Get My Quote';
  }
}

// ─── Design settings ──────────────────────────────────────────────────────────

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
      document.querySelectorAll('.logo-img').forEach(img => { img.src = s.logo_url; img.style.display = ''; });
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

    // Private Events page content
    if (s.private_events_hero_title) {
      const el = document.getElementById('pe-hero-title');
      if (el) el.textContent = s.private_events_hero_title;
    }
    if (s.private_events_hero_sub) {
      const el = document.getElementById('pe-hero-sub');
      if (el) el.textContent = s.private_events_hero_sub;
    }
    if (s.private_events_content) {
      const el = document.getElementById('pe-content');
      if (el) el.innerHTML = s.private_events_content;
    } else {
      const el = document.getElementById('pe-content');
      if (el) el.innerHTML = '';
    }

    applyFontSettings(s);
    renderSocialSection(s);
  } catch {}
}

// ─── Font settings ────────────────────────────────────────────────────────────

function applyFontSettings(s) {
  const map = {
    font_body:           { cssVar: '--font-body',           selectors: 'body, p, span, li, label, input, textarea, button, a, select' },
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

// ─── Social section ───────────────────────────────────────────────────────────

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

// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
