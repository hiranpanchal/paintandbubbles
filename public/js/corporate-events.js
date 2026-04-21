/* ========================================================================
   CORPORATE / TEAM-BUILDING LANDING PAGE
   - Applies global design settings (logo, footer, colours, fonts, socials)
   - Hydrates every text block on the page from site_settings so admins can
     edit anything from the Content tab
   - Handles enquiry form submission -> /api/private-quotes (quote_type=corporate)
   ======================================================================== */

(function () {
  const TYPE = 'corporate';

  // ─── Design / global chrome ─────────────────────────────────────────────────
  // Mirrors the pattern used by private-events.js: logo, footer logo, footer
  // tagline, colour/font overrides, socials. Without this the page falls back
  // to /logo.png and the hard-coded defaults rather than the CMS values the
  // other pages have already adopted.

  async function applyDesignAndHydrate() {
    let s = {};
    try {
      const res = await fetch('/api/design/settings', { cache: 'no-store' });
      if (res.ok) s = await res.json();
    } catch {}

    applyColourVars(s);
    applyLogos(s);
    applyFooter(s);
    applyFontSettings(s);
    renderSocialSection(s);
    hydrateCorporateContent(s);
  }

  function applyColourVars(s) {
    const vars = [];
    if (s.color_rose)        vars.push(`--rose: ${s.color_rose}`);
    if (s.color_rose_deep)   vars.push(`--rose-deep: ${s.color_rose_deep}`);
    if (s.color_rose_dark)   vars.push(`--rose-dark: ${s.color_rose_dark}`);
    if (s.color_bg)          vars.push(`--bg: ${s.color_bg}`);
    if (s.color_text_dark)   vars.push(`--text-dark: ${s.color_text_dark}`);
    if (s.color_bg_about)    vars.push(`--bg-about: ${s.color_bg_about}`);
    if (s.color_bg_trust)    vars.push(`--bg-trust: ${s.color_bg_trust}`);
    if (s.color_bg_events)   vars.push(`--bg-events: ${s.color_bg_events}`);
    if (s.color_bg_social)   vars.push(`--bg-social: ${s.color_bg_social}`);
    if (s.color_bg_footer)   vars.push(`--bg-footer: ${s.color_bg_footer}`);
    if (s.color_banner_start) vars.push(`--banner-start: ${s.color_banner_start}`);
    if (s.color_banner_mid)   vars.push(`--banner-mid: ${s.color_banner_mid}`);
    if (s.color_banner_end)   vars.push(`--banner-end: ${s.color_banner_end}`);
    if (!vars.length) return;
    const st = document.createElement('style');
    st.textContent = `:root { ${vars.join('; ')} }`;
    document.head.appendChild(st);
  }

  function applyLogos(s) {
    if (s.logo_url) {
      document.querySelectorAll('.logo-img').forEach(img => {
        img.src = s.logo_url;
        img.style.display = '';
      });
      const fb = document.getElementById('logo-fallback');
      if (fb) fb.style.display = 'none';
    }
    if (s.footer_logo_url) {
      const fImg = document.querySelector('.footer-logo-img');
      if (fImg) { fImg.src = s.footer_logo_url; fImg.style.display = ''; }
      const fFb = document.getElementById('footer-logo-fallback');
      if (fFb) fFb.style.display = 'none';
    }
  }

  function applyFooter(s) {
    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }
  }

  // Font application — matches private-events.js so typography is consistent.
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
      st.textContent = `:root { ${vars.join('; ')} }\n${rules.join('\n')}`;
      document.head.appendChild(st);
    }
  }

  function getFontStack(name) {
    if (['Dancing Script','Pacifico','Caveat','Satisfy','Great Vibes','Lobster'].includes(name)) return `'${name}', cursive`;
    if (['Playfair Display','Merriweather','Lora','Cormorant Garamond','DM Serif Display','EB Garamond'].includes(name)) return `'${name}', serif`;
    return `'${name}', sans-serif`;
  }

  // ─── Social section + footer socials ────────────────────────────────────────
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
    let links = [];
    try { links = JSON.parse(s.social_links || '[]'); } catch {}
    links = links.filter(l => l.url);

    const footerSocial = document.getElementById('footer-social-links');
    if (footerSocial) {
      footerSocial.innerHTML = links.map(({ platform, url }) => {
        const p = SOCIAL_PLATFORMS[platform];
        if (!p) return '';
        return `<li><a href="${url.replace(/"/g,'&quot;')}" target="_blank" rel="noopener">${p.label}</a></li>`;
      }).join('');
    }

    const section = document.getElementById('social-section');
    if (!section) return;
    const titleEl = document.getElementById('social-section-title');
    if (titleEl && s.social_title) titleEl.textContent = s.social_title;
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

  // ─── Corporate-specific content hydration ───────────────────────────────────
  // Every text block on the page has a stable ID and a default in the HTML.
  // Here we overwrite with site_settings values when present.

  function hydrateCorporateContent(s) {
    setText('ce-hero-eyebrow', s.corporate_events_hero_eyebrow);
    setText('ce-hero-title',   s.corporate_events_hero_title);
    setText('ce-hero-sub',     s.corporate_events_hero_sub);

    // Hero CTAs
    const ctaP = document.getElementById('ce-cta-primary');
    if (ctaP) {
      if (s.corporate_events_hero_cta_primary_label) ctaP.textContent = s.corporate_events_hero_cta_primary_label;
      if (s.corporate_events_hero_cta_primary_url)   ctaP.setAttribute('href', s.corporate_events_hero_cta_primary_url);
    }
    const ctaS = document.getElementById('ce-cta-secondary');
    if (ctaS) {
      if (s.corporate_events_hero_cta_secondary_label) ctaS.textContent = s.corporate_events_hero_cta_secondary_label;
      if (s.corporate_events_hero_cta_secondary_url)   ctaS.setAttribute('href', s.corporate_events_hero_cta_secondary_url);
    }

    // Trust strip (4 stat blocks). Only replace if at least one value is set,
    // so a fresh install still sees the HTML defaults.
    const trustPairs = [
      [s.corporate_events_trust_1_num, s.corporate_events_trust_1_label],
      [s.corporate_events_trust_2_num, s.corporate_events_trust_2_label],
      [s.corporate_events_trust_3_num, s.corporate_events_trust_3_label],
      [s.corporate_events_trust_4_num, s.corporate_events_trust_4_label],
    ];
    if (trustPairs.some(([n, l]) => n || l)) {
      const trust = document.getElementById('ce-trust-inner');
      if (trust) {
        trust.innerHTML = trustPairs.map(([num, label]) => `
          <div>
            <p class="ce-trust-num">${escHtml(num || '')}</p>
            <p class="ce-trust-label">${escHtml(label || '')}</p>
          </div>`).join('');
      }
    }

    // Why section
    setText('ce-why-eyebrow', s.corporate_events_why_eyebrow);
    setText('ce-why-title',   s.corporate_events_why_title);
    setText('ce-intro',       s.corporate_events_intro);

    // Benefits grid (3 cards) — always injected so admins can add/remove
    const benefitsGrid = document.getElementById('ce-benefits-grid');
    let benefits = [];
    try { benefits = JSON.parse(s.corporate_events_benefits || '[]'); } catch {}
    if (benefitsGrid) {
      if (!benefits.length) {
        // Hard-coded defaults (no emoji) so the HTML still looks right when
        // the setting is empty. These mirror the seeded defaults.
        benefits = [
          { title: 'Creativity unlocks conversation', body: 'Painting gives everyone something to do with their hands — so real conversation happens naturally, not at a round-robin icebreaker. Hybrid teams bond in one evening.' },
          { title: 'Inclusive by design',             body: 'No skill required. Non-competitive. Alcohol optional. Quieter team members thrive. We can adapt for dietary, accessibility and cultural needs — just ask.' },
          { title: 'Zero logistical lift for you',    body: 'We bring everything — canvases, paints, aprons, music, a professional facilitator. You show up. Your team leaves with their own painting and a much better group chat.' },
        ];
      }
      benefitsGrid.innerHTML = benefits.map((b, i) => `
        <div class="ce-benefit-card">
          <div class="ce-benefit-icon">${BENEFIT_ICONS[i % BENEFIT_ICONS.length]}</div>
          <h3 class="ce-benefit-h">${escHtml(b.title || '')}</h3>
          <p class="ce-benefit-p">${escHtml(b.body || '')}</p>
        </div>
      `).join('');
    }

    // Formats section
    setText('ce-formats-eyebrow', s.corporate_events_formats_eyebrow);
    setText('ce-formats-title',   s.corporate_events_formats_title);
    setText('ce-formats-lead',    s.corporate_events_formats_lead);

    const formatsGrid = document.getElementById('ce-formats-grid');
    let formats = [];
    try { formats = JSON.parse(s.corporate_events_formats || '[]'); } catch {}
    if (formatsGrid) {
      if (!formats.length) {
        formats = [
          { badge: 'Popular', title: 'At our studio',     body: 'Head to Coventry, Leamington Spa or Solihull. We handle the vibe — you handle getting everyone there.', capacity: 'Up to 30 people' },
          { badge: '',        title: 'At your office',    body: 'We come to you with everything. Ideal for Friday afternoons, onboarding weeks or all-hands wrap-ups.',      capacity: 'Up to 60 people' },
          { badge: '',        title: 'Off-site away day', body: "Tie our session into a broader away day. We'll recommend venues across the Midlands and liaise directly.", capacity: 'Up to 100+ people' },
          { badge: '',        title: 'Virtual kits',      body: 'Canvas + paints posted to each team member (including remote hires overseas). Live facilitator on Zoom.',   capacity: 'No upper limit' },
        ];
      }
      formatsGrid.innerHTML = formats.map(f => `
        <div class="ce-format-card">
          ${f.badge ? `<span class="ce-format-badge">${escHtml(f.badge)}</span>` : ''}
          <h3 class="ce-format-h">${escHtml(f.title || '')}</h3>
          <p class="ce-format-p">${escHtml(f.body || '')}</p>
          ${f.capacity ? `<p class="ce-format-cap">${escHtml(f.capacity)}</p>` : ''}
        </div>
      `).join('');
    }

    // Included checklist
    setText('ce-included-eyebrow', s.corporate_events_included_eyebrow);
    setText('ce-included-title',   s.corporate_events_included_title);
    const incGrid = document.getElementById('ce-included-grid');
    let included = [];
    try { included = JSON.parse(s.corporate_events_included || '[]'); } catch {}
    if (incGrid) {
      if (!included.length) {
        included = [
          'All materials — canvases, paints, brushes, aprons',
          'Professional artist to facilitate',
          'Soft drinks included — prosecco optional',
          'Themed music playlist',
          'Photos from the session on request',
          'Dietary & accessibility adjustments',
          'Clean VAT invoice with PO number',
          'Flexible cancellation up to 14 days',
        ];
      }
      incGrid.innerHTML = included.map(item => `
        <div class="ce-inc-item">
          <span class="ce-inc-check">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="5 10 9 14 15 6"/></svg>
          </span>
          ${escHtml(item)}
        </div>
      `).join('');
    }

    // Social proof section
    setText('ce-proof-eyebrow', s.corporate_events_proof_eyebrow);
    setText('ce-proof-title',   s.corporate_events_proof_title);
    setText('ce-trusted-label', s.corporate_events_trusted_label);

    // Testimonials
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
    } else if (grid) {
      // Hide the grid container cleanly if there are no testimonials to show
      grid.innerHTML = '';
    }

    // Trusted-by pill row (comma-separated string)
    const trustedStr = (s.corporate_events_trusted_by || '').trim();
    const trustedWrap = document.getElementById('ce-trusted');
    const trustedList = document.getElementById('ce-trusted-list');
    if (trustedWrap && trustedList) {
      if (trustedStr) {
        trustedWrap.classList.remove('hidden');
        trustedList.innerHTML = trustedStr
          .split(',').map(x => x.trim()).filter(Boolean)
          .map(x => `<span class="ce-trusted-item">${escHtml(x)}</span>`).join('');
      } else {
        trustedWrap.classList.add('hidden');
      }
    }

    // FAQ
    setText('ce-faq-eyebrow', s.corporate_events_faq_eyebrow);
    setText('ce-faq-title',   s.corporate_events_faq_title);
    const faqWrap = document.getElementById('ce-faq-wrap');
    let faqItems = [];
    try { faqItems = JSON.parse(s.corporate_events_faq || '[]'); } catch {}
    if (faqWrap) {
      if (!faqItems.length) {
        // Minimal fallback so a broken JSON payload doesn't leave the page empty.
        faqItems = [
          { q: 'How far in advance should we book?', a: '2-4 weeks ahead is ideal. For Christmas-party season, 6-8 weeks early.' },
        ];
      }
      faqWrap.innerHTML = faqItems.map(f => `
        <details class="ce-faq-item">
          <summary class="ce-faq-q">${escHtml(f.q || '')}</summary>
          <div class="ce-faq-a">${escHtml(f.a || '')}</div>
        </details>
      `).join('');
    }

    // Form copy
    setText('ce-form-title', s.corporate_events_form_title);
    setText('ce-form-sub',   s.corporate_events_form_sub);
    if (s.corporate_events_form_submit_label) {
      const btn = document.getElementById('ce-submit-btn');
      if (btn) btn.textContent = s.corporate_events_form_submit_label;
    }

    // Success screen
    setText('ce-success-title', s.corporate_events_success_title);
    setText('ce-success-sub',   s.corporate_events_success_sub);
    const next = document.getElementById('ce-success-next');
    let steps = [];
    try { steps = JSON.parse(s.corporate_events_success_steps || '[]'); } catch {}
    if (next) {
      if (!steps.length) {
        steps = [
          'Confirmation email on its way with your enquiry summary',
          'We may call to clarify a detail or two before pricing',
          "You'll receive a formal quote with PO/VAT breakdown",
        ];
      }
      next.innerHTML = steps.map(step => `
        <div class="ce-next-item">
          <svg class="ce-next-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 10 9 14 15 6"/></svg>
          <span>${escHtml(step)}</span>
        </div>
      `).join('');
    }
  }

  // Three subtle line-icons used on the benefit cards. Kept short + monochrome
  // so they read as professional line art rather than decorative emoji.
  const BENEFIT_ICONS = [
    // Conversation bubbles
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
    // People / inclusion
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c.8-3 3.2-5 6-5s5.2 2 6 5"/><path d="M14.5 19c.5-2 2-3.5 4-3.5s3.5 1.5 4 3.5"/></svg>',
    // Package / logistics
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/></svg>',
    // Calendar / schedule (used if admin adds a 4th card)
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>',
  ];

  function setText(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
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

  document.addEventListener('DOMContentLoaded', applyDesignAndHydrate);
})();
