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
      tuned = null; // the real video starts now: apply speed and quality to it
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

  setInterval(function () {
    if (cfg.sponsorBlock) tickSponsors();
  }, 500);

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
  // Player preferences, applied once per video: speed, quality, always repeat.
  // ---------------------------------------------------------------------------------------
  var QUALITY_LABELS = { 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium', 240: 'small', 144: 'tiny' };
  var QUALITY_ORDER = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  var tuned = null;

  /** Best available level at or below the wanted one. */
  function pickQuality(wanted, available) {
    var want = QUALITY_LABELS[wanted];
    if (!want || !available || !available.length) return null;
    for (var i = QUALITY_ORDER.indexOf(want); i < QUALITY_ORDER.length; i++) {
      if (available.indexOf(QUALITY_ORDER[i]) !== -1) return QUALITY_ORDER[i];
    }
    return null;
  }

  function tunePlayer() {
    var p = player();
    var v = p && p.querySelector('video');
    var id = currentVideoId();
    if (!v || !id || isAd() || !isFinite(v.duration) || v.duration <= 0) return;
    v.loop = !!cfg.alwaysRepeat;
    if (tuned === id) return;
    tuned = id;
    var speed = Number(cfg.defaultSpeed) || 1;
    if (speed !== 1) {
      try {
        if (p.setPlaybackRate && speed <= 2) p.setPlaybackRate(speed);
      } catch (e) {}
      v.playbackRate = speed;
    }
    if (cfg.defaultQuality && cfg.defaultQuality !== 'auto' && p.getAvailableQualityLevels) {
      var q = pickQuality(Number(cfg.defaultQuality), p.getAvailableQualityLevels());
      if (q) {
        try {
          if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(q, q);
          if (p.setPlaybackQuality) p.setPlaybackQuality(q);
        } catch (e) {}
      }
    }
  }

  setInterval(tunePlayer, 500);

  // ---------------------------------------------------------------------------------------
  // Return YouTube Dislike: the public count, shown on the dislike button.
  // ---------------------------------------------------------------------------------------
  var dislikes = { id: null, count: null };
  var compact =
    typeof Intl !== 'undefined' && Intl.NumberFormat
      ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
      : { format: String };

  function dislikeButton() {
    var buttons = document.querySelectorAll('button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      if (/dislike/i.test(buttons[i].getAttribute('aria-label'))) return buttons[i];
    }
    return null;
  }

  function tickDislikes() {
    var id = currentVideoId();
    var old = document.querySelector('.bopbox-dislikes');
    if (!cfg.returnDislike || !id) {
      if (old) old.remove();
      return;
    }
    if (dislikes.id !== id) {
      dislikes = { id: id, count: null };
      if (old) old.remove();
      if (window.fetch) {
        fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + id)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (d && dislikes.id === id && typeof d.dislikes === 'number') dislikes.count = d.dislikes;
          })
          .catch(function () {});
      }
      return;
    }
    if (dislikes.count === null) return;
    var btn = dislikeButton();
    if (!btn) return;
    var label = btn.querySelector('.bopbox-dislikes');
    var text = compact.format(dislikes.count);
    if (!label) {
      label = document.createElement('span');
      label.className = 'bopbox-dislikes';
      btn.appendChild(label);
    }
    if (label.textContent !== text) label.textContent = text;
  }

  setInterval(tickDislikes, 700);

  // ---------------------------------------------------------------------------------------
  // Feed and player clean-up, switched live by classes on <html>.
  // ---------------------------------------------------------------------------------------
  B.addStyle(
    '.bopbox-dislikes{margin-left:6px;font:inherit;font-size:14px;font-weight:500;white-space:nowrap}\n' +
      'html.bopbox-hide-shorts ' +
      B.hideRule([
        'ytm-reel-shelf-renderer',
        'ytm-shorts-lockup-view-model',
        'ytm-shorts-lockup-view-model-v2',
        'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer)',
        'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
        'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2)',
        'ytm-video-with-context-renderer:has(a[href^="/shorts/"])',
        'ytm-rich-item-renderer:has(a[href^="/shorts/"])',
        'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
      ]) +
      '\nhtml.bopbox-hide-cards ' +
      B.hideRule(['.ytp-ce-element', '.ytp-cards-teaser', '.ytp-cards-button', '.ytp-pause-overlay', '.ytp-suggested-action', '.iv-branding']),
    'bopbox-youtube-prefs',
  );

  function syncClasses() {
    B.onRoot(function (root) {
      root.classList.toggle('bopbox-hide-shorts', !!cfg.hideShorts);
      root.classList.toggle('bopbox-hide-cards', !!cfg.hideCards);
    });
  }

  syncClasses();
  setInterval(syncClasses, 1000);

  // ---------------------------------------------------------------------------------------
  // The app's own Settings, reachable from YouTube's top bar like a built-in control.
  // ---------------------------------------------------------------------------------------
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Built with DOM calls: YouTube enforces Trusted Types, so innerHTML strings would throw. */
  function settingsIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 7h9M17 7h3M4 17h3M11 17h9');
    svg.appendChild(path);
    [[15, 7], [9, 17]].forEach(function (c) {
      var circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(c[0]));
      circle.setAttribute('cy', String(c[1]));
      circle.setAttribute('r', '2.2');
      svg.appendChild(circle);
    });
    return svg;
  }

  function injectSettingsButton() {
    if (document.getElementById('bopbox-settings')) return;
    var header = document.querySelector('ytm-mobile-topbar-renderer header, header.mobile-topbar-header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = 'bopbox-settings';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Tube settings');
    btn.appendChild(settingsIcon());
    btn.style.cssText =
      'background:transparent;border:0;color:inherit;width:40px;height:40px;padding:8px;margin:0 2px;' +
      'display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;-webkit-tap-highlight-color:transparent';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      B.post({ t: 'openSettings' });
    });
    // YouTube A/B-tests its header: put the button just before its search button, wherever that is.
    var search = header.querySelector('button[aria-label="Search YouTube"], button.topbar-button-search-button, button[aria-label*="Search" i]');
    var host = search && (search.closest('ytm-topbar-menu-button-renderer') || search);
    if (host && host.parentNode) host.parentNode.insertBefore(btn, host);
    else header.appendChild(btn);
  }

  setInterval(injectSettingsButton, 800);

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
  window.__bopboxYouTubeInternals = { prune: prune, isAd: isAd, pickQuality: pickQuality };
})();
