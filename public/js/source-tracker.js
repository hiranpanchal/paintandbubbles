/* =============================================
   PAINT & BUBBLES — SOURCE ATTRIBUTION
   Very lightweight first-touch attribution stored
   in sessionStorage. Read by the booking code to
   tag new bookings with where the visitor came
   from (google / facebook / instagram / …).
   Runs once per tab, as early as possible.
   ============================================= */
(function () {
  'use strict';

  var KEY = 'pb_src';

  // Map hostname patterns → coarse source bucket.
  // Order matters: first match wins.
  var HOST_MAP = [
    [/(^|\.)google\./i,          'google'],
    [/(^|\.)bing\./i,            'google'],   // bucket bing with search for now
    [/(^|\.)duckduckgo\./i,      'google'],
    [/(^|\.)facebook\./i,        'facebook'],
    [/(^|\.)fb\./i,              'facebook'],
    [/(^|\.)m\.facebook\./i,     'facebook'],
    [/(^|\.)instagram\./i,       'instagram'],
    [/(^|\.)l\.instagram\./i,    'instagram'],
    [/(^|\.)tiktok\./i,          'tiktok'],
    [/(^|\.)youtube\./i,         'youtube'],
    [/(^|\.)youtu\.be/i,         'youtube'],
    [/(^|\.)pinterest\./i,       'pinterest'],
    [/(^|\.)twitter\./i,         'twitter'],
    [/(^|\.)x\.com/i,            'twitter'],
    [/(^|\.)t\.co/i,             'twitter'],
    [/(^|\.)linkedin\./i,        'other'],
  ];

  // utm_source string → bucket
  function bucketUtm(s) {
    var v = String(s || '').toLowerCase();
    if (!v) return null;
    if (v.indexOf('google') !== -1) return 'google';
    if (v.indexOf('facebook') !== -1 || v === 'fb' || v === 'meta') return 'facebook';
    if (v.indexOf('insta') !== -1 || v === 'ig') return 'instagram';
    if (v.indexOf('tiktok') !== -1) return 'tiktok';
    if (v.indexOf('youtube') !== -1 || v === 'yt') return 'youtube';
    if (v.indexOf('pinterest') !== -1) return 'pinterest';
    if (v.indexOf('twitter') !== -1 || v === 'x') return 'twitter';
    if (v.indexOf('email') !== -1 || v.indexOf('newsletter') !== -1 || v === 'resend') return 'email';
    if (v.indexOf('mailchimp') !== -1) return 'email';
    return 'other';
  }

  function bucketReferrer(refUrl) {
    if (!refUrl) return null;
    try {
      var u = new URL(refUrl);
      // Same-host referrals don't count as a new source
      if (u.host === location.host) return null;
      for (var i = 0; i < HOST_MAP.length; i++) {
        if (HOST_MAP[i][0].test(u.host)) return HOST_MAP[i][1];
      }
      return 'referral';
    } catch (e) {
      return null;
    }
  }

  function readExisting() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.source) return parsed;
    } catch (e) {}
    return null;
  }

  function write(obj) {
    try { sessionStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function resolve() {
    // First-touch wins — don't overwrite if we already decided earlier in the session.
    var existing = readExisting();
    if (existing) return existing;

    var params = new URLSearchParams(location.search);
    var utm = params.get('utm_source');
    var source, referrer;

    if (utm) {
      source = bucketUtm(utm);
      referrer = 'utm:' + utm + (params.get('utm_medium') ? '|' + params.get('utm_medium') : '');
    } else {
      var r = document.referrer || '';
      source = bucketReferrer(r);
      if (source) {
        try { referrer = new URL(r).host; } catch (e) { referrer = ''; }
      } else {
        source = 'direct';
        referrer = '';
      }
    }

    var out = { source: source, referrer: referrer, t: Date.now() };
    write(out);
    return out;
  }

  // Resolve immediately so the first-touch decision is pinned.
  var decision = resolve();

  // Expose a tiny reader for booking code.
  window.PBSource = {
    get: function () { return readExisting() || decision; },
    // For debugging from the console:
    _clear: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} },
  };
})();
