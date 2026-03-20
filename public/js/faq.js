/* =============================================
   PAINT & BUBBLES — FAQ PAGE
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  await applyDesignSettings();
  await loadFAQs();
});

async function applyDesignSettings() {
  try {
    const res = await fetch('/api/design/settings');
    if (!res.ok) return;
    const s = await res.json();

    const vars = [];
    if (s.color_rose)      vars.push(`--rose: ${s.color_rose}`);
    if (s.color_rose_deep) vars.push(`--rose-deep: ${s.color_rose_deep}`);
    if (s.color_rose_dark) vars.push(`--rose-dark: ${s.color_rose_dark}`);
    if (s.color_bg)        vars.push(`--bg: ${s.color_bg}`);
    if (s.color_text_dark) vars.push(`--text-dark: ${s.color_text_dark}`);
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
    if (s.footer_tagline) {
      const el = document.querySelector('.footer-tagline');
      if (el) el.textContent = s.footer_tagline;
    }
  } catch {}
}

async function loadFAQs() {
  const list = document.getElementById('faq-list');
  try {
    const faqs = await fetch('/api/faqs').then(r => r.json());

    if (!faqs.length) {
      list.innerHTML = `
        <div class="faq-empty">
          <p>No FAQs yet — check back soon!</p>
        </div>`;
      return;
    }

    list.innerHTML = faqs.map((faq, i) => `
      <div class="faq-item" id="faq-${faq.id}">
        <button class="faq-question" onclick="toggleFAQ(${faq.id})" aria-expanded="false">
          <span>${escHtml(faq.question)}</span>
          <svg class="faq-chevron" viewBox="0 0 20 20" fill="none">
            <path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="faq-answer" id="ans-${faq.id}">
          <div class="faq-answer-inner">${escHtml(faq.answer)}</div>
        </div>
      </div>`).join('');

    // Open first item by default
    if (faqs.length) toggleFAQ(faqs[0].id);
  } catch {
    list.innerHTML = `<div class="empty-state"><h3>Failed to load FAQs</h3><p>Please try refreshing the page.</p></div>`;
  }
}

function toggleFAQ(id) {
  const item   = document.getElementById(`faq-${id}`);
  const answer = document.getElementById(`ans-${id}`);
  const btn    = item.querySelector('.faq-question');
  const isOpen = item.classList.contains('open');

  // Close all
  document.querySelectorAll('.faq-item.open').forEach(el => {
    el.classList.remove('open');
    el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    el.querySelector('.faq-answer').style.maxHeight = '';
  });

  // Open clicked (if it was closed)
  if (!isOpen) {
    item.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
