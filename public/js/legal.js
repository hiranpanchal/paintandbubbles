/* =============================================
   PAINT & BUBBLES — LEGAL PAGES
   Shared template for Terms, Privacy, Refund Policy
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
});

// Which legal page we're on, set by the server via data-legal-page on <body>
function getLegalPage() {
  return (document.body && document.body.getAttribute('data-legal-page')) || '';
}

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

    // Logos
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

    // Populate hero + body from the active legal page's settings keys
    const page = getLegalPage(); // 'terms' | 'privacy' | 'refund'
    const titleKey   = `legal_${page}_hero_title`;
    const subKey     = `legal_${page}_hero_sub`;
    const contentKey = `legal_${page}_content`;

    const titleEl = document.getElementById('legal-hero-title');
    const subEl   = document.getElementById('legal-hero-sub');
    const bodyEl  = document.getElementById('legal-content');

    if (titleEl) titleEl.textContent = s[titleKey] || titleEl.textContent.trim() || '';
    if (subEl)   subEl.textContent   = s[subKey]   || subEl.textContent.trim()   || '';
    if (bodyEl)  bodyEl.innerHTML    = s[contentKey] || '<p>Content coming soon.</p>';

    // Fonts + social (footer Follow column)
    applyFontSettings(s);
    renderSocialSection(s);
  } catch {}
}

// ─── Font settings (same pattern as other pages) ───────────────────────────────

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

// ─── Social section (footer Follow column only) ────────────────────────────────

const SOCIAL_PLATFORMS = {
  instagram: { label: 'Instagram' },
  facebook:  { label: 'Facebook' },
  tiktok:    { label: 'TikTok' },
  youtube:   { label: 'YouTube' },
  twitter:   { label: 'X (Twitter)' },
  pinterest: { label: 'Pinterest' },
  linkedin:  { label: 'LinkedIn' },
  spotify:   { label: 'Spotify' },
};

function renderSocialSection(s) {
  let links = [];
  try { links = JSON.parse(s.social_links || '[]'); } catch {}
  links = links.filter(l => l.url);
  const footerSocial = document.getElementById('footer-social-links');
  if (footerSocial) {
    footerSocial.innerHTML = links.map(({ platform, url }) => {
      const p = SOCIAL_PLATFORMS[platform];
      if (!p) return '';
      return `<li><a href="${String(url).replace(/"/g,'&quot;')}" target="_blank" rel="noopener">${p.label}</a></li>`;
    }).join('');
  }
}
