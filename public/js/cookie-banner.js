/* =============================================
   PAINT & BUBBLES — COOKIE CONSENT BANNER
   Self-contained: injects banner + styles, sets
   a localStorage flag when user makes a choice.
   UK GDPR / PECR compliant (no tracking cookies
   are set; banner is informational only).
   ============================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'pb_cookie_consent';

  // If the user has already made a choice, do nothing.
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch (e) {
    // localStorage unavailable — show banner but can't remember choice
  }

  // Defer to DOMContentLoaded so we don't run before <body> exists.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }

  function injectBanner() {
    if (document.getElementById('pb-cookie-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'pb-cookie-banner';
    banner.className = 'pb-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie notice');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = [
      '<div class="pb-cookie-inner">',
        '<div class="pb-cookie-icon" aria-hidden="true">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
            '<path d="M21.5 12.5a9.5 9.5 0 1 1-10-10 6 6 0 0 0 4 6 6 6 0 0 0 6 4z"/>',
            '<circle cx="8.5" cy="10.5" r="1" fill="currentColor"/>',
            '<circle cx="13" cy="15" r="1" fill="currentColor"/>',
            '<circle cx="16.5" cy="11" r="1" fill="currentColor"/>',
          '</svg>',
        '</div>',
        '<div class="pb-cookie-text">',
          '<strong>We use cookies 🍪</strong>',
          '<span>We use essential cookies to make this site work, and to remember your preferences. ',
          'We don\'t use tracking or advertising cookies. See our ',
          '<a href="/privacy">Privacy Policy</a>.</span>',
        '</div>',
        '<div class="pb-cookie-actions">',
          '<button type="button" class="pb-cookie-btn pb-cookie-accept" id="pb-cookie-accept">Got it</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(banner);

    var btn = document.getElementById('pb-cookie-accept');
    if (btn) btn.addEventListener('click', accept);
  }

  function accept() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, t: Date.now() })); } catch (e) {}
    var b = document.getElementById('pb-cookie-banner');
    if (b) {
      b.classList.add('pb-cookie-hide');
      setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 320);
    }
  }
})();
