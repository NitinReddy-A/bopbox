/*
 * Bopbox x Spotify (open.spotify.com web player). Runs after bridge.js at document start.
 *  - phone-friendly layout tweaks for the desktop web player
 *  - hides upsell banners, "get the app" nags and display ads
 *  - detects audio ads: mutes them and skips as soon as Spotify allows it
 *  - exposes track metadata / artwork from the now-playing bar to the native player
 */
(function () {
  'use strict';
  var B = window.__bopbox;
  if (!B || window.__bopboxSpotify) return;
  window.__bopboxSpotify = true;
  var cfg = B.cfg || {};

  function q(sel) {
    return document.querySelector(sel);
  }

  function text(sel) {
    var el = q(sel);
    return el ? (el.textContent || '').trim() : '';
  }

  // ---------------------------------------------------------------------------------------
  // Layout: the desktop player is wide; give it a sensible zoomed-out viewport on phones.
  // ---------------------------------------------------------------------------------------
  if (cfg.desktop) {
    B.onRoot(function () {
      function applyViewport() {
        var head = document.head;
        if (!head) return false;
        var meta = head.querySelector('meta[name="viewport"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'viewport';
          head.appendChild(meta);
        }
        meta.content = 'width=900, initial-scale=' + Math.min(1, (window.screen.width || 400) / 900).toFixed(3) + ', user-scalable=yes';
        return true;
      }
      if (!applyViewport()) document.addEventListener('DOMContentLoaded', applyViewport, { once: true });
    });
    B.addStyle(
      // Bigger touch targets on the player bar and sidebar when zoomed out.
      '[data-testid="now-playing-bar"] button{min-width:44px;min-height:44px}' +
        '[data-testid="control-button-playpause"]{transform:scale(1.25)}' +
        '::-webkit-scrollbar{width:0!important;height:0!important}',
      'bopbox-spotify-layout',
    );
  }

  // ---------------------------------------------------------------------------------------
  // Cosmetic: upsells, app nags, display ads.
  // ---------------------------------------------------------------------------------------
  if (cfg.adblock) {
    B.addStyle(
      B.hideRule([
        '[data-testid="upgrade-button"]',
        '[data-testid="top-bar-premium-button"]',
        '[data-testid="premium-upsell"]',
        '[data-testid="upsell-card"]',
        '[data-testid="test-ref-div"]',
        '[data-testid="install-app-button"]',
        '[data-testid="download-app-button"]',
        '[data-testid="embedded-ad"]',
        '[data-testid="hpto-wrapper"]',
        '[data-testid="sponsored-ad"]',
        '[data-testid="ad-companion-card"]',
        '[data-testid="NPV-ad-companion"]',
        'a[href*="spotify.com/download"]',
        'a[href^="/download"]',
        'a[href*="/premium?ref"]',
        'section[data-testid="home-ads-container"]',
        'div[data-testid="leaderboard-ad-wrapper"]',
        'div[data-testid="home-hpto"]',
        'div:has(> [data-testid="hpto-wrapper"])',
      ]),
      'bopbox-spotify-cosmetic',
    );
  }

  // ---------------------------------------------------------------------------------------
  // Audio ads: detect, mute, skip.
  // ---------------------------------------------------------------------------------------
  var AD_MARKERS = [
    '[data-testid="context-item-info-ad-subtitle"]',
    '[data-testid="now-playing-bar"] a[href*="/ad/"]',
    '[data-testid="now-playing-widget"][aria-label*="Advertisement" i]',
    '[data-testid="now-playing-widget"] [data-testid="ad-link"]',
  ];

  function isAd() {
    for (var i = 0; i < AD_MARKERS.length; i++) if (q(AD_MARKERS[i])) return true;
    var title = (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) || '';
    return /^advertisement$/i.test(title) || /^spotify$/i.test(text('[data-testid="context-item-info-artist"]')) && /advert/i.test(title);
  }

  var mutedForAd = false;

  function tickAds() {
    var el = B.activeMedia();
    if (isAd()) {
      if (!mutedForAd) {
        mutedForAd = true;
        B.post({ t: 'blocked', n: 1 });
      }
      if (el) {
        el.muted = true;
        // Ad audio is usually short and unencrypted: jump to its end when possible.
        try {
          if (isFinite(el.duration) && el.duration > 0 && el.duration < 90 && el.currentTime < el.duration - 0.3) el.currentTime = el.duration - 0.1;
        } catch (e) {}
      }
      var skip = q('[data-testid="control-button-skip-forward"]:not([disabled])');
      if (skip) skip.click();
    } else if (mutedForAd) {
      mutedForAd = false;
      if (el) el.muted = false;
    }
  }

  if (cfg.adblock) setInterval(tickAds, 300);

  // ---------------------------------------------------------------------------------------
  // Hooks for the bridge.
  // ---------------------------------------------------------------------------------------
  B.registerSite({
    isAd: isAd,
    metadata: function () {
      var img = q('[data-testid="now-playing-widget"] img, [data-testid="cover-art-image"]');
      return {
        title: text('[data-testid="context-item-info-title"], [data-testid="now-playing-widget"] [data-testid="context-item-link"]'),
        artist: text('[data-testid="context-item-info-artist"], [data-testid="context-item-info-subtitles"]'),
        artwork: img && img.src && img.src.indexOf('https://') === 0 ? img.src : '',
      };
    },
    canNext: function () {
      return !!q('[data-testid="control-button-skip-forward"]');
    },
    next: function () {
      var b = q('[data-testid="control-button-skip-forward"]');
      if (b) b.click();
    },
    previous: function () {
      var b = q('[data-testid="control-button-skip-back"]');
      if (b) b.click();
    },
  });

  window.__bopboxSpotifyInternals = { isAd: isAd };
})();
