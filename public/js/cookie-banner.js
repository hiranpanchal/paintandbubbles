/* =============================================
   PAINT & BUBBLES — COOKIE CONSENT BANNER
   UK GDPR / PECR compliant — gives the visitor a
   real choice before any non-essential cookies
   (e.g. Meta Pixel) are set.

   Stores `{ v:2, t, analytics: true|false }` under
   localStorage['pb_cookie_consent']. Other scripts
   (pixel, analytics) listen for the
   `pb:consent-changed` event so they can fire
   immediately on accept without a page reload.
   ============================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'pb_cookie_consent';

  // Already made a choice? Don't show the banner again.
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch (e) {
    // localStorage unavailable — banner will show but choice can't persist.
  }

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
          '<span>Essential cookies keep this site working. With your permission we’d also use analytics &amp; advertising cookies (e.g. Meta Pixel) so we can show you more relevant ads and improve the site. See our ',
          '<a href="/privacy">Privacy Policy</a>.</span>',
        '</div>',
        '<div class="pb-cookie-actions">',
          '<button type="button" class="pb-cookie-btn pb-cookie-reject" id="pb-cookie-reject">Reject</button>',
          '<button type="button" class="pb-cookie-btn pb-cookie-accept" id="pb-cookie-accept">Accept</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(banner);

    var btnAccept = document.getElementById('pb-cookie-accept');
    var btnReject = document.getElementById('pb-cookie-reject');
    if (btnAccept) btnAccept.addEventListener('click', function () { decide(true); });
    if (btnReject) btnReject.addEventListener('click', function () { decide(false); });
  }

  function decide(analytics) {
    var value = { v: 2, t: Date.now(), analytics: !!analytics };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (e) {}

    // Notify listeners (Meta Pixel, future analytics) so they can fire
    // immediately on accept without waiting for a page reload.
    try {
      window.dispatchEvent(new CustomEvent('pb:consent-changed', { detail: value }));
    } catch (e) { /* old browser without CustomEvent — fine, next page load picks it up */ }

    var b = document.getElementById('pb-cookie-banner');
    if (b) {
      b.classList.add('pb-cookie-hide');
      setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 320);
    }
  }
})();
