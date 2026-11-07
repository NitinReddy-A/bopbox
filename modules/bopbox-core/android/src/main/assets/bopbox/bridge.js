/*
 * Bopbox page bridge (injected at document start on the app's own origins only).
 *  - keeps pages playing in the background (visibility shims)
 *  - captures navigator.mediaSession + <video>/<audio> state and reports it to native
 *  - executes transport commands coming from the notification / widgets / lock screen
 *  - applies host-specific cosmetic filters from the ad blocker
 * Site scripts (youtube.js, spotify.js) plug in through window.__bopbox.registerSite().
 */
(function () {
  'use strict';
  if (window.__bopbox) return;

  var cfg = window.__bopboxConfig || {};
  var site = {};

  function post(msg) {
    try {
      var b = window.BopboxBridge;
      if (b && b.postMessage) b.postMessage(JSON.stringify(msg));
    } catch (e) {
      /* bridge unavailable (e.g. tests) */
    }
  }

  function log(m) {
    post({ t: 'log', m: String(m) });
  }

  function onRoot(cb) {
    if (document.documentElement) return cb(document.documentElement);
    var mo = new MutationObserver(function () {
      if (document.documentElement) {
        mo.disconnect();
        cb(document.documentElement);
      }
    });
    mo.observe(document, { childList: true });
  }

  function addStyle(css, id) {
    onRoot(function (root) {
      var s = document.createElement('style');
      if (id) s.id = id;
      s.textContent = css;
      (document.head || root).appendChild(s);
    });
  }

  /** Build a forgiving hide rule: invalid selectors inside :is() are ignored instead of killing the rule. */
  function hideRule(selectors) {
    var out = [];
    for (var i = 0; i < selectors.length; i += 200) {
      out.push(':is(' + selectors.slice(i, i + 200).join(',') + '){display:none!important}');
    }
    return out.join('\n');
  }

  // ---------------------------------------------------------------------------------------
  // 1. Background playback: the page always believes it is visible and focused.
  // ---------------------------------------------------------------------------------------
  if (cfg.backgroundPlay) {
    var define = function (obj, prop, value) {
      try {
        Object.defineProperty(obj, prop, { get: function () { return value; }, configurable: true });
      } catch (e) {}
    };
    define(Document.prototype, 'hidden', false);
    define(Document.prototype, 'webkitHidden', false);
    define(Document.prototype, 'visibilityState', 'visible');
    define(Document.prototype, 'webkitVisibilityState', 'visible');
    try {
      Document.prototype.hasFocus = function () { return true; };
    } catch (e) {}
    var swallow = function (e) {
      if (e.target === document || e.target === window) e.stopImmediatePropagation();
    };
    ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'pagehide', 'blur'].forEach(function (type) {
      window.addEventListener(type, swallow, true);
      document.addEventListener(type, swallow, true);
    });
  }

  // ---------------------------------------------------------------------------------------
  // 2. Media Session capture (with a polyfill for WebViews that don't expose it).
  // ---------------------------------------------------------------------------------------
  var handlers = {};
  var sessionMeta = null;
  var sessionState = 'none';

  if (!('MediaMetadata' in window)) {
    window.MediaMetadata = function MediaMetadata(init) {
      init = init || {};
      this.title = init.title || '';
      this.artist = init.artist || '';
      this.album = init.album || '';
      this.artwork = init.artwork || [];
    };
  }

  (function hookMediaSession() {
    var ms = navigator.mediaSession;
    if (!ms) {
      ms = { metadata: null, playbackState: 'none', setActionHandler: function () {}, setPositionState: function () {} };
      try {
        Object.defineProperty(Navigator.prototype, 'mediaSession', { get: function () { return ms; }, configurable: true });
      } catch (e) {}
    }
    var proto = Object.getPrototypeOf(ms) || {};
    var metaDesc = Object.getOwnPropertyDescriptor(proto, 'metadata') || Object.getOwnPropertyDescriptor(ms, 'metadata');
    var stateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackState') || Object.getOwnPropertyDescriptor(ms, 'playbackState');
    var originalSetAction = ms.setActionHandler;

    ms.setActionHandler = function (action, handler) {
      handlers[action] = handler || null;
      try {
        return originalSetAction.call(ms, action, handler);
      } catch (e) {
        /* unsupported action in this engine: still keep our copy */
      }
    };
    try {
      Object.defineProperty(ms, 'metadata', {
        configurable: true,
        get: function () { return sessionMeta; },
        set: function (v) {
          sessionMeta = v;
          try { if (metaDesc && metaDesc.set) metaDesc.set.call(ms, v); } catch (e) {}
          schedule();
        },
      });
      Object.defineProperty(ms, 'playbackState', {
        configurable: true,
        get: function () { return sessionState; },
        set: function (v) {
          sessionState = v;
          try { if (stateDesc && stateDesc.set) stateDesc.set.call(ms, v); } catch (e) {}
          schedule();
        },
      });
    } catch (e) {
      log('mediaSession hook failed: ' + e);
    }
  })();

  // ---------------------------------------------------------------------------------------
  // 3. Media element tracking. Elements may be detached from the DOM (Spotify), so we hook
  //    play() and listen on the elements themselves.
  // ---------------------------------------------------------------------------------------
  var elements = [];
  var lastActive = null;
  var MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeked', 'emptied', 'volumechange'];

  function track(el) {
    if (!el || elements.indexOf(el) !== -1) return;
    elements.push(el);
    if (elements.length > 12) elements.shift();
    MEDIA_EVENTS.forEach(function (type) {
      el.addEventListener(type, function () {
        if (type === 'play' || type === 'playing') lastActive = el;
        schedule();
      });
    });
  }

  // ---------------------------------------------------------------------------------------
  // 3b. Background guard. Some sites (YouTube) pause themselves once the app is backgrounded
  //     or shrunk into PiP. While native says we're in the background, page-initiated pause()
  //     calls are ignored; pauses the user asked for (notification, headset, PiP controls) come
  //     through command('pause'), which opens a short allow window first. System pauses
  //     (calls, other audio apps) don't go through pause() and are unaffected.
  // ---------------------------------------------------------------------------------------
  var inBackground = false;
  var allowPauseUntil = 0;
  var nativePause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    if (cfg.backgroundPlay && inBackground && Date.now() > allowPauseUntil && !this.ended) {
      log('ignored a page-initiated pause while in background');
      return undefined;
    }
    return nativePause.apply(this, arguments);
  };

  var nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    track(this);
    lastActive = this;
    return nativePlay.apply(this, arguments);
  };
  document.addEventListener('play', function (e) { if (e.target instanceof HTMLMediaElement) { track(e.target); lastActive = e.target; } }, true);

  function activeMedia() {
    for (var i = elements.length - 1; i >= 0; i--) {
      var el = elements[i];
      if (!el.paused && !el.ended) return el;
    }
    if (lastActive) return lastActive;
    var found = document.querySelector('video, audio');
    if (found) track(found);
    return found;
  }

  // ---------------------------------------------------------------------------------------
  // 4. State reporting.
  // ---------------------------------------------------------------------------------------
  function bestArtwork(list) {
    if (!list || !list.length) return '';
    var best = list[0];
    var bestSize = 0;
    for (var i = 0; i < list.length; i++) {
      var size = parseInt(String(list[i].sizes || '0').split('x')[0], 10) || 0;
      if (size >= bestSize) { best = list[i]; bestSize = size; }
    }
    try { return new URL(best.src, location.href).href; } catch (e) { return ''; }
  }

  function snapshot() {
    var el = activeMedia();
    var m = sessionMeta || {};
    var fallback = (site.metadata && site.metadata()) || {};
    var playing = el ? !el.paused && !el.ended : sessionState === 'playing';
    var dur = el && isFinite(el.duration) ? el.duration : 0;
    var actions = Object.keys(handlers).filter(function (k) { return !!handlers[k]; });
    if (site.canNext && site.canNext() && actions.indexOf('nexttrack') === -1) actions.push('nexttrack');
    return {
      t: 'media',
      title: m.title || fallback.title || '',
      artist: m.artist || fallback.artist || '',
      album: m.album || fallback.album || '',
      artwork: bestArtwork(m.artwork) || fallback.artwork || '',
      playing: playing,
      pos: el ? el.currentTime || 0 : 0,
      dur: dur,
      video: !!(el && el.tagName === 'VIDEO' && el.videoWidth > 0),
      ad: !!(site.isAd && site.isAd()),
      actions: actions,
    };
  }

  var lastKey = '';
  var pending = null;

  function report(force) {
    var s = snapshot();
    if (!s.title && !s.dur && !s.playing) return;
    var key = [s.title, s.artist, s.artwork, s.playing, Math.floor(s.pos / 5), Math.round(s.dur), s.video, s.ad, s.actions.join()].join('|');
    if (force || key !== lastKey) {
      lastKey = key;
      post(s);
    }
  }

  function schedule() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      report(false);
    }, 150);
  }

  setInterval(function () { report(false); }, 1000);

  // ---------------------------------------------------------------------------------------
  // 5. Commands from native.
  // ---------------------------------------------------------------------------------------
  function callHandler(action, details) {
    var h = handlers[action];
    if (!h) return false;
    try {
      h(Object.assign({ action: action }, details || {}));
      return true;
    } catch (e) {
      log('handler ' + action + ' failed: ' + e);
      return false;
    }
  }

  function command(name, arg) {
    var el = activeMedia();
    switch (name) {
      case 'play':
        if (!callHandler('play') && el) el.play().catch(function () {});
        break;
      case 'pause':
        allowPauseUntil = Date.now() + 2500;
        if (!callHandler('pause') && el) el.pause();
        break;
      case 'background':
        inBackground = !!arg;
        break;
      case 'next':
        if (!callHandler('nexttrack') && site.next) site.next();
        break;
      case 'previous':
        if (!callHandler('previoustrack')) {
          if (site.previous) site.previous();
          else if (el) el.currentTime = 0;
        }
        break;
      case 'seek':
        if (typeof arg === 'number' && !callHandler('seekto', { seekTime: arg, fastSeek: false }) && el) el.currentTime = arg;
        break;
      case 'pip':
        onRoot(function (root) { root.classList.toggle('bopbox-pip', !!arg); });
        if (site.onPip) site.onPip(!!arg);
        break;
      default:
        log('unknown command ' + name);
    }
    setTimeout(function () { report(true); }, 350);
  }

  // ---------------------------------------------------------------------------------------
  // 6. Cosmetic filtering from the filter lists + PiP presentation.
  // ---------------------------------------------------------------------------------------
  var hostSelectors = (cfg.cosmetic && cfg.cosmetic[location.hostname]) || [];
  if (cfg.adblock && hostSelectors.length) addStyle(hideRule(hostSelectors), 'bopbox-cosmetic');
  addStyle(
    'html.bopbox-pip,html.bopbox-pip body{background:#000!important;overflow:hidden!important}' +
      'html.bopbox-pip body *{visibility:hidden!important}' +
      'html.bopbox-pip video{visibility:visible!important;position:fixed!important;inset:0!important;' +
      'width:100vw!important;height:100vh!important;z-index:2147483647!important;object-fit:contain!important;background:#000!important}',
    'bopbox-pip',
  );

  window.__bopbox = {
    cfg: cfg,
    post: post,
    log: log,
    addStyle: addStyle,
    hideRule: hideRule,
    onRoot: onRoot,
    command: command,
    report: function () { report(true); },
    activeMedia: activeMedia,
    registerSite: function (hooks) { site = hooks || {}; },
    _snapshot: snapshot,
  };
})();
