/*
 * Bopbox x YouTube (m.youtube.com). Runs after bridge.js at document start.
 *  - strips ad payloads from player responses before the player sees them (JSON pruning)
 *  - fast-forwards / skips any ad that still slips through, then restores audio
 *  - hides promoted cards, upsell banners and "open the app" nags
 *  - optional SponsorBlock segment skipping
 *  - keeps "Are you still watching?" from interrupting background listening
 */
(function () {
  'use strict';
  var B = window.__bopbox;
  if (!B || window.__bopboxYouTube) return;
  window.__bopboxYouTube = true;
  var cfg = B.cfg || {};

  // ---------------------------------------------------------------------------------------
  // JSON pruning
  // ---------------------------------------------------------------------------------------
  var AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams', 'adInferredBlockingStatus'];

  function stripAds(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var removed = false;
    for (var i = 0; i < AD_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(obj, AD_KEYS[i])) {
        delete obj[AD_KEYS[i]];
        removed = true;
      }
    }
    return removed;
  }

  /** Remove ad payloads from a parsed YouTube response (player, next, or SPF array forms). */
  function prune(value) {
    if (!value || typeof value !== 'object') return 0;
    var count = 0;
    var targets = Array.isArray(value) ? value : [value];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t || typeof t !== 'object') continue;
      if (stripAds(t)) count++;
      if (t.playerResponse && stripAds(t.playerResponse)) count++;
      if (t.response && t.response.playerResponse && stripAds(t.response.playerResponse)) count++;
      if (t.player && t.player.args && t.player.args.raw_player_response && stripAds(t.player.args.raw_player_response)) count++;
    }
    return count;
  }

  var stats = { pruned: 0, skipped: 0, segments: 0 };

  function noteBlocked(n) {
    if (n > 0) B.post({ t: 'blocked', n: n });
  }

  if (cfg.adblock) {
    var nativeParse = JSON.parse;
    JSON.parse = function () {
      var result = nativeParse.apply(this, arguments);
      try {
        var n = prune(result);
        if (n) { stats.pruned += n; noteBlocked(n); }
      } catch (e) {}
      return result;
    };

    if (window.Response && Response.prototype.json) {
      var nativeJson = Response.prototype.json;
      Response.prototype.json = function () {
        return nativeJson.apply(this, arguments).then(function (data) {
          try {
            var n = prune(data);
            if (n) { stats.pruned += n; noteBlocked(n); }
          } catch (e) {}
          return data;
        });
      };
    }

    // Initial page data is assigned as a JS literal, not via JSON.parse.
    ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function (name) {
      var stored;
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          get: function () { return stored; },
          set: function (v) {
            var n = prune(v);
            if (n) { stats.pruned += n; noteBlocked(n); }
            stored = v;
          },
        });
      } catch (e) {}
    });
  }

  // ---------------------------------------------------------------------------------------
  // Cosmetic: promoted content, upsells, app nags.
  // ---------------------------------------------------------------------------------------
  if (cfg.adblock) {
    B.addStyle(
      B.hideRule([
        'ad-slot-renderer',
        'ytm-ad-slot-renderer',
        'ytd-ad-slot-renderer',
        'ytm-promoted-sparkles-web-renderer',
        'ytm-promoted-sparkles-text-search-renderer',
        'ytm-promoted-video-renderer',
        'ytm-companion-ad-renderer',
        'ytm-companion-slot',
        'ytm-display-ad-renderer',
        'ytm-merch-shelf-renderer',
        'ytm-statement-banner-renderer',
        'ytm-mealbar-promo-renderer',
        '.mealbar-promo-renderer',
        'ytm-paid-content-overlay-renderer',
        'ytm-rich-item-renderer:has(ad-slot-renderer)',
        'ytm-item-section-renderer:has(> ad-slot-renderer)',
        'ytm-rich-section-renderer:has(ytm-statement-banner-renderer)',
        '.ytp-ad-overlay-container',
        '.ytp-ad-image-overlay',
        '.ytp-ad-text-overlay',
        '#player-ads',
        'ytd-enforcement-message-view-model',
        'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
        'ytm-upsell-dialog-renderer',
        'ytm-open-app-promo',
        'ytm-app-promo-banner',
      ]),
      'bopbox-youtube-cosmetic',
    );
  }

  // ---------------------------------------------------------------------------------------
  // Ad skipper: anything that still plays as an ad is muted, sped through and skipped.
  // ---------------------------------------------------------------------------------------
  var SKIP_BUTTONS = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot button, button[class*="skip-ad" i]';
  var adMuted = null;

  function player() {
    return document.querySelector('#movie_player, .html5-video-player');
  }

  function isAd() {
    var p = player();
    return !!(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')));
  }

  function tickAds() {
    var p = player();
    var v = p && p.querySelector('video');
    if (!v) return;
    if (isAd()) {
      if (adMuted === null) {
        adMuted = { muted: v.muted, rate: v.playbackRate };
        stats.skipped++;
        noteBlocked(1);
      }
      v.muted = true;
      try { v.playbackRate = 16; } catch (e) {}
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) v.currentTime = v.duration - 0.1;
      var btn = document.querySelector(SKIP_BUTTONS);
      if (btn) btn.click();
    } else if (adMuted) {
      v.muted = adMuted.muted;
      v.playbackRate = adMuted.rate === 16 ? 1 : adMuted.rate || 1;
      adMuted = null;
    }
  }

  if (cfg.adblock) setInterval(tickAds, 250);

  // ---------------------------------------------------------------------------------------
  // SponsorBlock (community-sourced skips for sponsor reads, self-promo, subscribe nags).
  // ---------------------------------------------------------------------------------------
  var segments = [];
  var segmentsFor = null;

  function currentVideoId() {
    try {
      var u = new URL(location.href);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      var m = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function loadSegments(id) {
    segmentsFor = id;
    segments = [];
    if (!id || !window.fetch) return;
    var cats = encodeURIComponent(JSON.stringify(['sponsor', 'selfpromo', 'interaction']));
    fetch('https://sponsor.ajay.app/api/skipSegments?videoID=' + id + '&categories=' + cats)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (segmentsFor !== id || !Array.isArray(list)) return;
        segments = list
          .map(function (s) { return { start: s.segment[0], end: s.segment[1], done: false }; })
          .filter(function (s) { return s.end - s.start > 1; });
      })
      .catch(function () {});
  }

  function tickSponsors() {
    var id = currentVideoId();
    if (id !== segmentsFor) loadSegments(id);
    if (!segments.length || isAd()) return;
    var v = player() && player().querySelector('video');
    if (!v) return;
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      if (!s.done && v.currentTime >= s.start && v.currentTime < s.end - 0.5) {
        s.done = true;
        v.currentTime = s.end;
        stats.segments++;
        B.log('sponsor segment skipped');
      }
    }
  }

  if (cfg.sponsorBlock) setInterval(tickSponsors, 500);

  // ---------------------------------------------------------------------------------------
  // Keep "Video paused. Continue watching?" away during long background sessions.
  // ---------------------------------------------------------------------------------------
  setInterval(function () {
    try { window._lact = Date.now(); } catch (e) {}
  }, 60000);

  // ---------------------------------------------------------------------------------------
  // Signed-out header shows "Open App" where "Sign in" should be. App links are blocked inside
  // Bopbox, so turn it into a real Google sign-in that returns to m.youtube.com.
  // ---------------------------------------------------------------------------------------
  var SIGN_IN_URL =
    'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=' +
    encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&app=m&next=' + encodeURIComponent('https://m.youtube.com/'));

  function fixSignInButton() {
    var btn = document.querySelector('.mobile-topbar-header-sign-in-button a, .mobile-topbar-header-sign-in-button button');
    if (!btn || btn.__bopboxSignIn) return;
    btn.__bopboxSignIn = true;
    if (btn.tagName === 'A') btn.setAttribute('href', SIGN_IN_URL);
    btn.setAttribute('aria-label', 'Sign in');
    btn.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        location.href = SIGN_IN_URL;
      },
      true,
    );
    var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (/open app/i.test(walker.currentNode.nodeValue)) walker.currentNode.nodeValue = 'Sign in';
    }
  }

  setInterval(fixSignInButton, 1000);

  // ---------------------------------------------------------------------------------------
  // Hooks for the bridge.
  // ---------------------------------------------------------------------------------------
  function text(sel) {
    var el = document.querySelector(sel);
    return el ? (el.textContent || '').trim() : '';
  }

  B.registerSite({
    isAd: isAd,
    metadata: function () {
      var id = currentVideoId();
      var title = text('.slim-video-information-title, .slim-video-metadata-title, h2.slim-video-information-title') ||
        document.title.replace(/\s*-\s*YouTube\s*$/, '');
      return {
        title: id ? title : '',
        artist: text('.slim-owner-channel-name, ytm-slim-owner-renderer .slim-owner-channel-name, .YtmBadgeAndBylineRendererItemByline'),
        artwork: id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '',
      };
    },
    canNext: function () {
      return !!document.querySelector('button[aria-label*="Next" i].player-control-play-pause-icon, .player-controls-middle button[aria-label*="Next" i]');
    },
    next: function () {
      var b = document.querySelector('.player-controls-middle button[aria-label*="Next" i], button[aria-label*="Next video" i]');
      if (b) b.click();
    },
    onPip: function (on) {
      var v = player() && player().querySelector('video');
      if (on && v && v.paused) v.play().catch(function () {});
    },
  });

  window.__bopboxYouTubeStats = stats;
  window.__bopboxYouTubeInternals = { prune: prune, isAd: isAd };
})();
