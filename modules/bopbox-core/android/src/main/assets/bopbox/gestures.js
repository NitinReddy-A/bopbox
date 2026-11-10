/*
 * Tube gestures for m.youtube.com: the touch behaviour of the YouTube app, which the mobile
 * site does not have. Runs after youtube.js at document start.
 *
 *  Watch page   drag the player down     -> floating miniplayer, browse behind it
 *               swipe the player up      -> fullscreen
 *               press and hold           -> 2x speed while held
 *               Android back             -> minimise instead of leaving the video
 *  Miniplayer   tap -> expand, drag -> move (snaps to a corner), fling sideways or x -> close
 *  Shorts       double tap               -> like, with a heart
 *               press and hold           -> 2x speed while held
 *
 * The miniplayer keeps the watch page (and its player) alive and shows the rest of YouTube in
 * a same-origin frame behind it, so the video never stops or reloads while browsing. Tapping a
 * video in that frame opens it in the main page. Everything here is transform/opacity on
 * existing elements, so it animates on the compositor, and every listener is passive, so page
 * scrolling never waits on this script.
 */
(function () {
  'use strict';
  var B = window.__bopbox;
  if (!B || window.__bopboxGestures) return;
  window.__bopboxGestures = true;

  var FRAME_NAME = 'bopbox-browse';
  var HOME = location.origin + '/';

  if (B.inFrame) {
    if (window.name === FRAME_NAME) browseFrame();
    return;
  }

  /**
   * <html>'s class list. This script runs at document start, before <html> exists, so the
   * element is looked up on use; until it is there, class changes are simply dropped.
   */
  var NO_CLASSES = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  function rootClasses() {
    var el = document.documentElement;
    return el ? el.classList : NO_CLASSES;
  }
  var cfg = B.cfg || {};
  /** Live setting; when off, drags and Android back behave as on the plain site. */
  function miniEnabled() { return cfg.miniplayer !== false; }
  /**
   * Set when YouTube will not load inside the browse frame. The miniplayer then floats over the
   * watch page itself (related videos and comments stay usable) instead of over a second page.
   */
  var framesBroken = false;

  // ---------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------
  function onWatch() { return location.pathname === '/watch'; }
  function onShorts() { return location.pathname.indexOf('/shorts/') === 0; }

  /** How the player container is addressed in CSS: its id, or the mark set on a fallback element. */
  var PLAYER = ':is(#player-container-id,[data-bopbox-player])';

  /**
   * The element that holds the watch-page player. `#player-container-id` is what the mobile
   * site uses today; the fallbacks are the same chain Brave's Android YouTube script walks, so
   * a renamed container does not take the gestures down with it.
   */
  function playerBox() {
    var box = document.getElementById('player-container-id');
    if (box) return box;
    box = document.querySelector('[data-bopbox-player]');
    if (box) return box;
    if (!onWatch()) return null;
    var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    box = (p && p.closest('ytm-player, #player')) || (p && p.parentElement) || null;
    if (box && box !== document.body) {
      box.setAttribute('data-bopbox-player', '');
      B.log('player container not found by id; using <' + box.tagName.toLowerCase() + '>');
      return box;
    }
    return null;
  }

  function mainVideo() {
    var p = document.getElementById('movie_player');
    return (p && p.querySelector('video')) || document.querySelector('video');
  }

  /** The Short on screen: the video covering most of the viewport (feeds keep several around). */
  function shortsVideo() {
    if (!onShorts()) return null;
    var list = document.querySelectorAll('video');
    var best = null;
    var bestArea = 0;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      var w = Math.min(r.right, vw) - Math.max(r.left, 0);
      var h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w > 0 && h > 0 && w * h > bestArea) { best = list[i]; bestArea = w * h; }
    }
    return best || mainVideo();
  }

  function videoId(url) {
    try {
      var u = new URL(url, location.href);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      var m = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function isAd() {
    var p = document.getElementById('movie_player');
    return !!(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')));
  }

  function haptic(kind) { B.post({ t: 'haptic', k: kind }); }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function point(e) {
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    return { x: t.clientX, y: t.clientY };
  }

  function inside(el, x, y) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  var INTERACTIVE = 'a,button,input,textarea,select,[role="button"],[role="slider"],[contenteditable],' +
    'ytm-bottom-sheet-renderer,.ytm-progress-bar,.ytp-progress-bar,[class*="progress-bar"],[class*="seek"]';

  /** Swallow the click Chrome sends after a long press, so the player doesn't also toggle. */
  var swallowUntil = 0;
  function swallowNextClick(ms) { swallowUntil = Date.now() + (ms || 450); }
  window.addEventListener('click', function (e) {
    if (Date.now() < swallowUntil) {
      swallowUntil = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ---------------------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------------------
  var EASE = 'cubic-bezier(.2,.9,.25,1)';
  B.addStyle((
    // No grey flash on every tap: the single biggest "this is a web page" tell.
    'html{-webkit-tap-highlight-color:transparent}' +
      // Vertical drags on the watch player are ours (minimise / fullscreen), not page scroll.
      'html.bopbox-watch.bopbox-mini-on #player-container-id{touch-action:pan-x pinch-zoom!important}' +
      '#player-container-id,#player-container-id video,shorts-video,shorts-video video{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
      'html.bopbox-dragging #player-container-id{transition:none!important;will-change:transform;transform-origin:0 0!important}' +
      'html.bopbox-settling #player-container-id{transition:transform 300ms ' + EASE + '!important;will-change:transform;transform-origin:0 0!important}' +
      'html.bopbox-dragging #player-container-id,html.bopbox-settling #player-container-id{z-index:2147483001!important}' +
      // Miniplayer: the real player, fixed and scaled; everything else of the watch page hidden.
      'html.bopbox-mini:not(.bopbox-mini-solo),html.bopbox-mini:not(.bopbox-mini-solo) body{overflow:hidden!important}' +
      'html.bopbox-mini:not(.bopbox-mini-solo) body *{visibility:hidden!important}' +
      'html.bopbox-mini #player-container-id,html.bopbox-mini #player-container-id *,' +
      'html.bopbox-mini #bopbox-browse,html.bopbox-mini #bopbox-browse *,html.bopbox-mini #bopbox-mini-ui,html.bopbox-mini #bopbox-mini-ui *{visibility:visible!important}' +
      'html.bopbox-mini #player-container-id{position:fixed!important;top:0!important;left:0!important;right:auto!important;bottom:auto!important;' +
      'width:100vw!important;margin:0!important;transform-origin:0 0!important;overflow:hidden!important;pointer-events:none!important;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.45)}' +
      // The miniplayer has its own controls; YouTube's would be unreadably small.
      'html.bopbox-mini #player-control-container,html.bopbox-mini ytm-custom-control,html.bopbox-mini .player-controls-content{display:none!important}' +
      'html.bopbox-mini-closed #player-container-id,html.bopbox-mini-closed #player-container-id *,html.bopbox-mini-closed #bopbox-mini-ui,html.bopbox-mini-closed #bopbox-mini-ui *{visibility:hidden!important}' +
      '#bopbox-browse{position:fixed;inset:0;z-index:1;border:0;width:100vw;height:100vh;background:#0f0f0f;visibility:hidden;pointer-events:none;opacity:0;transition:opacity 220ms ease}' +
      'html.bopbox-mini #bopbox-browse{visibility:visible;pointer-events:auto;opacity:1}' +
      '#bopbox-mini-ui{position:fixed;top:0;left:0;z-index:2147483647;display:none;touch-action:none;border-radius:12px;transform-origin:0 0}' +
      'html.bopbox-mini #bopbox-mini-ui{display:block}' +
      '#bopbox-mini-ui button{position:absolute;width:36px;height:36px;border:0;border-radius:50%;padding:0;background:rgba(0,0,0,.55);color:#fff;' +
      'display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}' +
      '#bopbox-mini-ui .bopbox-close{top:6px;right:6px}' +
      '#bopbox-mini-ui .bopbox-toggle{left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px}' +
      // Picture-in-picture shows only the video, full size: the miniplayer steps aside.
      'html.bopbox-pip #player-container-id{transform:none!important;border-radius:0!important}' +
      'html.bopbox-pip #bopbox-browse,html.bopbox-pip #bopbox-mini-ui{display:none!important}' +
      // Hold-for-2x pill and the Shorts like heart.
      '#bopbox-pill{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;padding:6px 14px;border-radius:16px;' +
      'background:rgba(0,0,0,.6);color:#fff;font:600 14px/20px Roboto,Arial,sans-serif;pointer-events:none;opacity:0;transition:opacity 150ms ease}' +
      '#bopbox-pill.on{opacity:1}' +
      '.bopbox-heart{position:fixed;z-index:2147483647;width:96px;height:96px;margin:-48px 0 0 -48px;pointer-events:none;' +
      'animation:bopbox-heart 800ms ' + EASE + ' forwards}' +
      '@keyframes bopbox-heart{0%{transform:scale(.2) rotate(-12deg);opacity:0}15%{transform:scale(1.15) rotate(-12deg);opacity:1}' +
      '30%{transform:scale(.95) rotate(-12deg)}45%{transform:scale(1) rotate(-12deg);opacity:1}100%{transform:translateY(-90px) scale(1.1) rotate(-12deg);opacity:0}}'
    ).split('#player-container-id').join(PLAYER),
    'bopbox-gestures',
  );

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(d, size, fill) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill || 'currentColor');
    svg.appendChild(path);
    return svg;
  }
  var ICON_CLOSE = 'M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z';
  var ICON_PLAY = 'M8 5v14l11-7z';
  var ICON_PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';
  var ICON_HEART = 'M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z';

  // ---------------------------------------------------------------------------------------
  // Page state, kept in sync by a light foreground tick.
  // ---------------------------------------------------------------------------------------
  var lastBrowseUrl = HOME;

  function syncPage() {
    rootClasses().toggle('bopbox-watch', onWatch());
    rootClasses().toggle('bopbox-shorts', onShorts());
    rootClasses().toggle('bopbox-mini-on', miniEnabled());
    if (mode !== 'full' && !miniEnabled()) expand();
    if (!onWatch() && !onShorts()) lastBrowseUrl = location.href;
    // The page left the video by itself (a link, YouTube's own navigation): drop the miniplayer.
    if (mode !== 'full' && !onWatch()) resetMini();
    // Floating over the watch page itself: picking another video there replaces this one.
    if (mode !== 'full' && framesBroken && mini && videoId(location.href) !== mini.videoId) resetMini();
    if (mode === 'mini') syncMiniButton();
    maybePreloadFrame();
  }

  // ---------------------------------------------------------------------------------------
  // Miniplayer
  // ---------------------------------------------------------------------------------------
  var mode = 'full'; // 'full' | 'mini' | 'closed'
  var frame = null;
  var frameDepth = 0;
  var ui = null;
  var toggleBtn = null;
  var mini = null; // { x, y, s, w, h, naturalTop, scrollY }
  var savedZ = [];

  function viewport() { return { w: window.innerWidth, h: window.innerHeight }; }

  /** Size and resting place of the miniplayer for a player [boxH] tall (bottom right). */
  function miniGeometry(boxH, corner) {
    var vp = viewport();
    var w = Math.min(vp.w * (vp.w > vp.h ? 0.34 : 0.52), 300);
    var s = w / vp.w;
    var h = boxH * s;
    var margin = 12;
    var bottomInset = 64; // clear YouTube's bottom tab bar in the frame
    var right = !corner || corner.right;
    var bottom = !corner || corner.bottom;
    return {
      w: w,
      h: h,
      s: s,
      x: right ? vp.w - w - margin : margin,
      y: bottom ? vp.h - h - bottomInset : 56 + margin,
    };
  }

  function ensureFrame(url) {
    if (frame && frame.isConnected) return frame;
    frame = document.createElement('iframe');
    frame.id = 'bopbox-browse';
    frame.name = FRAME_NAME;
    frame.setAttribute('title', 'YouTube');
    frame.setAttribute('allow', 'fullscreen');
    frame.src = url || lastBrowseUrl || HOME;
    frameDepth = 0;
    var f = frame;
    f.addEventListener('load', function () {
      // Our scripts run in every YouTube frame. If they are not there, YouTube refused to be
      // framed (or an error page loaded): never show a dead frame. The miniplayer carries on
      // over the watch page instead.
      var ok = false;
      try { ok = !!f.contentWindow.__bopbox; } catch (e) {}
      if (ok || frame !== f) return;
      framesBroken = true;
      B.log('browse frame unavailable; miniplayer floats over the watch page');
      f.remove();
      frame = null;
      if (mode === 'mini') rootClasses().add('bopbox-mini-solo');
      else if (mode === 'closed') resetMini();
    });
    (document.body || document.documentElement).appendChild(frame);
    return frame;
  }

  var preloadAt = 0;
  /**
   * Load the browse frame ahead of time once a video is well under way (never while it is still
   * starting up), so the first minimise is instant. Low-memory devices create it on demand.
   */
  function maybePreloadFrame() {
    if (frame || framesBroken || !miniEnabled() || !onWatch() || B.isBackground()) return;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return;
    var c = navigator.connection;
    if (c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))) return;
    var v = mainVideo();
    if (!v || v.paused || v.readyState < 3 || v.currentTime < 8) { preloadAt = 0; return; }
    if (!preloadAt) preloadAt = Date.now();
    if (Date.now() - preloadAt > 2000) ensureFrame();
  }

  function ensureUi() {
    if (ui && ui.isConnected) return ui;
    ui = document.createElement('div');
    ui.id = 'bopbox-mini-ui';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'bopbox-close';
    close.setAttribute('aria-label', 'Close miniplayer');
    close.appendChild(icon(ICON_CLOSE, 20));
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'bopbox-toggle';
    toggleBtn.setAttribute('aria-label', 'Play or pause');
    ui.appendChild(toggleBtn);
    ui.appendChild(close);
    (document.body || document.documentElement).appendChild(ui);
    wireMiniUi(ui, close);
    return ui;
  }

  function syncMiniButton() {
    var v = mainVideo();
    if (!toggleBtn) return;
    var playing = !!(v && !v.paused && !v.ended);
    var want = playing ? 'pause' : 'play';
    if (toggleBtn.dataset.state === want) return;
    toggleBtn.dataset.state = want;
    while (toggleBtn.firstChild) toggleBtn.removeChild(toggleBtn.firstChild);
    toggleBtn.appendChild(icon(playing ? ICON_PAUSE : ICON_PLAY, 24));
  }

  function place(x, y, s) {
    var box = playerBox();
    if (box) box.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';
    if (ui) {
      ui.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      ui.style.width = mini.w + 'px';
      ui.style.height = mini.h + 'px';
    }
    if (box) box.style.borderRadius = (12 / s) + 'px';
  }

  /**
   * The player sits inside YouTube's own stacking contexts; lift each ancestor so the fixed,
   * scaled player paints above the browse frame. Restored when the miniplayer goes away.
   */
  function liftAncestors(box) {
    savedZ = [];
    for (var el = box; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      savedZ.push([el, el.style.zIndex]);
      el.style.zIndex = '2147483001';
    }
  }

  function restoreAncestors() {
    savedZ.forEach(function (pair) { pair[0].style.zIndex = pair[1]; });
    savedZ = [];
  }

  /**
   * Finish a drag (or a back press) by settling into the miniplayer. [natural] is the player's
   * untransformed place on screen; a drag passes the one it measured before it moved anything.
   */
  function enterMini(animate, natural) {
    var box = playerBox();
    if (!box || mode !== 'full' || !miniEnabled()) return false;
    var r = natural || box.getBoundingClientRect();
    var g = miniGeometry(r.height);
    mini = {
      x: g.x, y: g.y, s: g.s, w: g.w, h: g.h, naturalTop: r.top, scrollY: window.scrollY,
      corner: { right: true, bottom: true }, videoId: videoId(location.href),
    };
    if (!framesBroken) ensureFrame();
    ensureUi();
    var commit = function () {
      rootClasses().remove('bopbox-settling', 'bopbox-dragging');
      liftAncestors(box);
      rootClasses().toggle('bopbox-mini-solo', framesBroken);
      rootClasses().add('bopbox-mini');
      mode = 'mini';
      place(mini.x, mini.y, mini.s);
      syncMiniButton();
    };
    if (animate) {
      rootClasses().remove('bopbox-dragging');
      rootClasses().add('bopbox-settling');
      box.style.transform = 'translate3d(' + mini.x + 'px,' + (mini.y - mini.naturalTop) + 'px,0) scale(' + mini.s + ')';
      settle(box, commit);
    } else {
      commit();
    }
    haptic('light');
    return true;
  }

  /** Back to the full watch page, animating the player up from wherever the miniplayer is. */
  function expand() {
    if (mode === 'full' || !mini) return;
    var box = playerBox();
    var m = mini;
    rootClasses().remove('bopbox-mini', 'bopbox-mini-closed', 'bopbox-mini-solo');
    restoreAncestors();
    mode = 'full';
    window.scrollTo(0, m.scrollY || 0);
    if (!box) { resetMini(); return; }
    // Start where the miniplayer was (in the player's normal flow position), then let go.
    rootClasses().add('bopbox-dragging');
    box.style.borderRadius = '';
    box.style.transform = 'translate3d(' + m.x + 'px,' + (m.y - m.naturalTop) + 'px,0) scale(' + m.s + ')';
    void box.offsetWidth;
    rootClasses().remove('bopbox-dragging');
    rootClasses().add('bopbox-settling');
    box.style.transform = '';
    settle(box, function () {
      rootClasses().remove('bopbox-settling');
      box.style.transform = '';
    });
    haptic('light');
  }

  /** Close button / fling: stop the video and leave the browse page on screen. */
  function closeMini() {
    if (mode !== 'mini') return;
    var v = mainVideo();
    if (v && !v.paused) v.pause();
    if (framesBroken) {
      // No other page to leave on screen: closing puts the paused video back in its place.
      expand();
      return;
    }
    mode = 'closed';
    rootClasses().add('bopbox-mini-closed');
    haptic('light');
  }

  /** Drop every miniplayer trace without animation (the page navigated, or a new video). */
  function resetMini() {
    var box = playerBox();
    rootClasses().remove('bopbox-mini', 'bopbox-mini-closed', 'bopbox-mini-solo', 'bopbox-settling', 'bopbox-dragging');
    restoreAncestors();
    if (box) {
      box.style.transform = '';
      box.style.borderRadius = '';
    }
    mode = 'full';
    mini = null;
  }

  function settle(el, done) {
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      el.removeEventListener('transitionend', onEnd);
      done();
    };
    var onEnd = function (e) { if (e.target === el) finish(); };
    el.addEventListener('transitionend', onEnd);
    setTimeout(finish, 380); // transitionend never fires if nothing actually moved
  }

  /** Miniplayer touch: tap expands, drag moves and snaps to a corner, sideways fling closes. */
  function wireMiniUi(el, close) {
    var start = null;
    var last = null;
    function togglePlay() {
      var v = mainVideo();
      if (!v) return;
      if (v.paused) { var r = v.play(); if (r && r.catch) r.catch(function () {}); } else v.pause();
      setTimeout(syncMiniButton, 50);
    }
    // Clicks serve accessibility services and mice; fingers are handled on touchend below,
    // because Chrome drops the click of a tap that lands while a previous drag is still coasting.
    close.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMini();
    });
    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePlay();
    });
    el.addEventListener('click', function () { expand(); });
    el.addEventListener('touchstart', function (e) {
      if (!mini) return;
      var p = point(e);
      start = { x: p.x, y: p.y, mx: mini.x, my: mini.y, t: Date.now(), moved: false, target: e.target };
      last = { x: p.x, t: Date.now(), vx: 0 };
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!start || !mini) return;
      var p = point(e);
      var dx = p.x - start.x;
      var dy = p.y - start.y;
      if (!start.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.moved = true;
      var now = Date.now();
      if (now > last.t) last.vx = (p.x - last.x) / (now - last.t);
      last.x = p.x;
      last.t = now;
      mini.x = start.mx + dx;
      mini.y = start.my + dy;
      place(mini.x, mini.y, mini.s);
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!start || !mini) return;
      var s = start;
      start = null;
      if (!s.moved) {
        // Act now and cancel the click, so it can neither repeat this nor land on whatever
        // is under the finger once the miniplayer has moved away.
        if (e.cancelable) e.preventDefault();
        var button = s.target && s.target.closest && s.target.closest('button');
        if (button === close) closeMini();
        else if (button === toggleBtn) togglePlay();
        else expand();
        return;
      }
      var vp = viewport();
      var offscreen = mini.x + mini.w < mini.w * 0.45 || mini.x > vp.w - mini.w * 0.45;
      if (offscreen || Math.abs(last.vx) > 1.2) {
        closeMini();
        return;
      }
      var corner = { right: mini.x + mini.w / 2 > vp.w / 2, bottom: mini.y + mini.h / 2 > vp.h / 2 };
      var g = miniGeometry(mini.h / mini.s, corner);
      mini.x = g.x;
      mini.y = g.y;
      mini.corner = corner;
      var box = playerBox();
      [box, ui].forEach(function (n) { if (n) n.style.transition = 'transform 260ms ' + EASE; });
      place(mini.x, mini.y, mini.s);
      setTimeout(function () { [box, ui].forEach(function (n) { if (n) n.style.transition = ''; }); }, 300);
    }, { passive: false });
  }

  // Messages from the browse frame: a video was tapped, or the frame navigated.
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || !e.data) return;
    var d = e.data;
    if (d.__bopboxOpen) openFromFrame(String(d.__bopboxOpen));
    else if (d.__bopboxLeave && /^https?:\/\//i.test(String(d.__bopboxLeave))) location.assign(String(d.__bopboxLeave));
    else if (d.__bopboxNav === 'push') frameDepth++;
    else if (d.__bopboxNav === 'pop') frameDepth = Math.max(0, frameDepth - 1);
  });

  function openFromFrame(url) {
    var id = videoId(url);
    if (!id) return;
    if (onWatch() && id === videoId(location.href) && mode !== 'full') {
      if (mode === 'closed') {
        rootClasses().remove('bopbox-mini-closed');
        mode = 'mini';
      }
      expand();
      var v = mainVideo();
      if (v && v.paused) { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
      return;
    }
    // A different video: the main page opens it. Clicking a link lets YouTube's own router swap
    // the video in place (no reload); if it does not take it, the browser just follows the link.
    resetMini();
    var a = document.createElement('a');
    a.href = new URL(url, location.href).href;
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 1000);
  }

  B.onBack(function () {
    if (document.fullscreenElement) return 'none';
    if (mode === 'full') {
      // Only a video that is actually playing is worth keeping: paused, finished or still
      // loading, back simply goes back a page as it always did.
      var box = playerBox();
      var v = mainVideo();
      var playing = !!v && !v.paused && !v.ended;
      if (miniEnabled() && onWatch() && playing && box && box.getBoundingClientRect().height > 0 && enterMini(true)) return 'handled';
      return 'none';
    }
    // Over the watch page itself there is nothing behind to walk back through: normal back.
    if (framesBroken) return 'none';
    if (frameDepth > 0 && frame && frame.contentWindow) {
      frame.contentWindow.history.back();
      return 'handled';
    }
    return 'background';
  });

  // ---------------------------------------------------------------------------------------
  // Hold for 2x
  // ---------------------------------------------------------------------------------------
  var hold = null;
  var pill = null;

  function startHold(v) {
    if (!v || v.paused || isAd() || v.playbackRate >= 2) return false;
    hold = { v: v, rate: v.playbackRate };
    v.playbackRate = 2;
    if (!pill || !pill.isConnected) {
      pill = document.createElement('div');
      pill.id = 'bopbox-pill';
      pill.textContent = '2×  ▸▸';
      (document.body || document.documentElement).appendChild(pill);
    }
    var box = onShorts() ? null : playerBox();
    var top = box ? Math.max(8, box.getBoundingClientRect().top + 12) : 72;
    pill.style.top = top + 'px';
    pill.classList.add('on');
    haptic('light');
    return true;
  }

  function endHold() {
    if (!hold) return;
    var h = hold;
    hold = null;
    h.v.playbackRate = h.rate;
    // If the site ran its own hold-to-speed-up too, it restores to our 2x: put it back again.
    setTimeout(function () { if (!hold && h.v.playbackRate === 2 && h.rate !== 2) h.v.playbackRate = h.rate; }, 200);
    if (pill) pill.classList.remove('on');
    swallowNextClick();
  }

  window.addEventListener('contextmenu', function (e) {
    if (hold || (e.target && e.target.closest && e.target.closest('#player-container-id, [data-bopbox-player], shorts-video, #player-shorts-container'))) {
      e.preventDefault();
    }
  }, true);

  // ---------------------------------------------------------------------------------------
  // Watch-page player: drag down to minimise, swipe up for fullscreen, hold for 2x.
  // ---------------------------------------------------------------------------------------
  var touch = null;
  var HOLD_MS = 420;

  function enterFullscreen() {
    // If the site has its own swipe-up, it is already on its way to fullscreen: don't undo it.
    setTimeout(function () { if (!document.fullscreenElement) requestFullscreen(); }, 220);
  }

  /**
   * Fullscreen by the most native route that works, checking after each: YouTube's own button
   * (keeps its controls and state in step), then the player's API, then the browser's.
   */
  function requestFullscreen() {
    var box = playerBox();
    var steps = [
      function () {
        var btn = box && box.querySelector('button.fullscreen-icon, .ytp-fullscreen-button, button[aria-label*="full screen" i], button[aria-label*="fullscreen" i]');
        if (!btn) return false;
        btn.click();
        return true;
      },
      function () {
        var p = document.getElementById('movie_player');
        if (!p || typeof p.toggleFullscreen !== 'function') return false;
        p.toggleFullscreen();
        return true;
      },
      function () {
        var el = box || mainVideo();
        if (!el || !el.requestFullscreen) return false;
        var r = el.requestFullscreen();
        if (r && r.catch) r.catch(function () {});
        return true;
      },
    ];
    var i = 0;
    (function next() {
      if (document.fullscreenElement) return;
      while (i < steps.length) {
        var tried = false;
        try { tried = steps[i++](); } catch (e) {}
        if (tried) { setTimeout(next, 600); return; }
      }
    })();
  }

  function watchTouchStart(e, box) {
    var p = point(e);
    var r = box.getBoundingClientRect();
    // The bottom strip of the player is the seek bar: leave it entirely to YouTube.
    var onSeekBar = p.y > r.bottom - Math.max(28, r.height * 0.16);
    var interactive = e.target.closest && e.target.closest(INTERACTIVE);
    touch = {
      kind: 'watch',
      x: p.x, y: p.y, t: Date.now(),
      top: r.top,
      height: r.height,
      dragOk: !onSeekBar && !interactive && miniEnabled(),
      swipeOk: !onSeekBar && !interactive,
      target0: e.target,
      axis: null,
      samples: [{ y: p.y, t: Date.now() }],
      holdTimer: null,
    };
    if (!interactive && !onSeekBar) {
      touch.holdTimer = setTimeout(function () {
        if (touch && !touch.axis) touch.held = startHold(mainVideo());
      }, HOLD_MS);
    }
  }

  function watchTouchMove(e) {
    var p = point(e);
    var dx = p.x - touch.x;
    var dy = p.y - touch.y;
    touch.samples.push({ y: p.y, t: Date.now() });
    if (touch.samples.length > 6) touch.samples.shift();
    if (!touch.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      clearTimeout(touch.holdTimer);
      if (touch.held) return;
      var vertical = Math.abs(dy) > Math.abs(dx) * 1.3;
      touch.axis = vertical && dy > 0 && touch.dragOk ? 'down' : vertical && dy < 0 && touch.swipeOk ? 'up' : 'other';
      if (touch.axis === 'down') {
        releasePlayerTouch(touch.target0, p);
        if (!frame && !framesBroken) ensureFrame(); // starts loading while the finger is still moving
        var g = miniGeometry(touch.height);
        touch.target = g;
        touch.travel = Math.max(120, g.y - touch.top);
        rootClasses().add('bopbox-dragging');
      }
    }
    if (touch.axis === 'down') {
      e.stopPropagation(); // the player must not read this as a seek or a tap
      var progress = clamp(dy / touch.travel, 0, 1);
      var g2 = touch.target;
      var s = 1 - progress * (1 - g2.s);
      var box = playerBox();
      if (box) box.style.transform = 'translate3d(' + (progress * g2.x) + 'px,' + Math.max(0, dy) + 'px,0) scale(' + s + ')';
    }
  }

  /**
   * We are taking this touch over: tell the player its gesture was cancelled, so it does not
   * treat the drag as a tap or a scrub when the finger lifts.
   */
  var syntheticCancel = false;
  function releasePlayerTouch(target, p) {
    if (!target || typeof TouchEvent !== 'function' || typeof Touch !== 'function') return;
    try {
      var t = new Touch({ identifier: 0, target: target, clientX: p.x, clientY: p.y });
      syntheticCancel = true;
      target.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: false, touches: [], targetTouches: [], changedTouches: [t] }));
    } catch (e) {}
    syntheticCancel = false;
  }

  function velocity(samples) {
    if (samples.length < 2) return 0;
    var a = samples[0];
    var b = samples[samples.length - 1];
    return b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px per ms, positive = down
  }

  function watchTouchEnd(e) {
    var t = touch;
    clearTimeout(t.holdTimer);
    if (t.held) { endHold(); return; }
    var p = point(e);
    var dy = p.y - t.y;
    var v = velocity(t.samples);
    var box = playerBox();
    if (t.axis === 'down' && box) {
      e.stopPropagation();
      var docked = (dy > t.travel * 0.35 || (v > 0.55 && dy > 40)) && enterMini(true, { top: t.top, height: t.height });
      if (docked) {
        rootClasses().remove('bopbox-dragging');
      } else {
        rootClasses().remove('bopbox-dragging');
        rootClasses().add('bopbox-settling');
        box.style.transform = '';
        settle(box, function () { rootClasses().remove('bopbox-settling'); });
      }
    } else if (t.axis === 'up' && (-dy > 60 || v < -0.5)) {
      e.stopPropagation();
      enterFullscreen();
    }
  }

  // ---------------------------------------------------------------------------------------
  // Shorts: double tap to like (single taps are delayed just long enough to tell them apart),
  // hold for 2x.
  // ---------------------------------------------------------------------------------------
  var DOUBLE_MS = 260;
  var pendingTap = null;
  var replaying = false;

  /**
   * The like button of the Short on screen. Tried in order: YouTube's like components (the
   * mobile site wraps the like/dislike pair in ytm-like-button-renderer), a label that says
   * like, and finally the first toggle button, which works in any language.
   */
  var LIKE_SELECTORS = [
    'like-button-view-model button',
    'ytm-like-button-renderer button',
    '.shorts-player-action-panel-button-view-model[data-type="like"] button',
    'button[aria-label]',
    'button[aria-pressed]',
  ];

  function likeButton() {
    var scope = document.querySelector('ytm-reel-video-renderer[is-active]') || document;
    var vh = window.innerHeight;
    for (var s = 0; s < LIKE_SELECTORS.length; s++) {
      var list = scope.querySelectorAll(LIKE_SELECTORS[s]);
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var label = b.getAttribute('aria-label') || b.getAttribute('title') || '';
        if (/dislike/i.test(label) || b.closest('dislike-button-view-model, .dislike-button, #dislike-button')) continue;
        if (LIKE_SELECTORS[s] === 'button[aria-label]' && !/\blikes?\b/i.test(label)) continue;
        var r = b.getBoundingClientRect();
        var mid = r.top + r.height / 2;
        if (!r.width || mid < 0 || mid > vh) continue;
        return b;
      }
    }
    return null;
  }

  function heart(x, y) {
    var h = document.createElement('div');
    h.className = 'bopbox-heart';
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    h.appendChild(icon(ICON_HEART, 96, '#ff2e4d'));
    (document.body || document.documentElement).appendChild(h);
    setTimeout(function () { h.remove(); }, 850);
  }

  function likeShort(x, y) {
    heart(x, y);
    haptic('confirm');
    var b = likeButton();
    if (!b) B.log('double tap: no like button found on this Short');
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
  }

  function isShortsTap(e) {
    if (!onShorts() || replaying) return false;
    var p = point(e);
    if (!inside(shortsVideo(), p.x, p.y)) return false;
    return !(e.target.closest && e.target.closest(INTERACTIVE + ',ytm-like-button-renderer,like-button-view-model,ytm-reel-player-overlay-renderer [role="button"]'));
  }

  function replayTap(t) {
    replaying = true;
    try {
      t.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: t.x, clientY: t.y }));
    } catch (e) {}
    replaying = false;
    // A single tap toggles play/pause; if the site ignored our replayed click, do it ourselves.
    setTimeout(function () {
      var v = shortsVideo();
      if (v && v.paused === t.pausedBefore) {
        if (v.paused) { var r = v.play(); if (r && r.catch) r.catch(function () {}); } else v.pause();
      }
    }, 160);
  }

  window.addEventListener('click', function (e) {
    if (!isShortsTap(e)) return;
    var p = point(e);
    e.preventDefault();
    e.stopImmediatePropagation();
    if (pendingTap && Date.now() - pendingTap.t < DOUBLE_MS && Math.abs(p.x - pendingTap.x) < 60 && Math.abs(p.y - pendingTap.y) < 60) {
      clearTimeout(pendingTap.timer);
      var before = pendingTap.pausedBefore;
      pendingTap = null;
      likeShort(p.x, p.y);
      // If the site toggled on touch rather than click, put playback back how it was.
      setTimeout(function () {
        var v = shortsVideo();
        if (v && v.paused !== before) {
          if (before) v.pause(); else { var r = v.play(); if (r && r.catch) r.catch(function () {}); }
        }
      }, 120);
      return;
    }
    var tap = { x: p.x, y: p.y, t: Date.now(), target: e.target, pausedBefore: touchPausedBefore };
    tap.timer = setTimeout(function () {
      if (pendingTap === tap) pendingTap = null;
      replayTap(tap);
    }, DOUBLE_MS);
    pendingTap = tap;
  }, true);

  var touchPausedBefore = true;

  function shortsTouchStart(e) {
    if (pendingTap) return; // second tap of a double tap: the first tap's state is what counts
    var v = shortsVideo();
    touchPausedBefore = !v || v.paused;
    var p = point(e);
    touch = { kind: 'shorts', x: p.x, y: p.y, t: Date.now(), held: false, holdTimer: null };
    touch.holdTimer = setTimeout(function () {
      if (touch && touch.kind === 'shorts') touch.held = startHold(shortsVideo());
    }, HOLD_MS);
  }

  // ---------------------------------------------------------------------------------------
  // Touch routing. All passive: scrolling never waits on us.
  // ---------------------------------------------------------------------------------------
  window.addEventListener('touchstart', function (e) {
    touch = null;
    if (e.touches.length !== 1 || mode !== 'full' || document.fullscreenElement) return;
    var target = e.target;
    if (!target || !target.closest) return;
    if (onWatch()) {
      var box = playerBox();
      if (box && box.contains(target)) watchTouchStart(e, box);
    } else if (onShorts()) {
      var p = point(e);
      if (inside(shortsVideo(), p.x, p.y) && !target.closest(INTERACTIVE)) shortsTouchStart(e);
    }
  }, { capture: true, passive: true });

  window.addEventListener('touchmove', function (e) {
    if (!touch) return;
    if (e.touches.length !== 1) { cancelTouch(); return; }
    if (touch.kind === 'watch') { watchTouchMove(e); return; }
    var p = point(e);
    if (!touch.held && (Math.abs(p.x - touch.x) > 10 || Math.abs(p.y - touch.y) > 10)) {
      clearTimeout(touch.holdTimer);
      touch = null;
    }
  }, { capture: true, passive: true });

  window.addEventListener('touchend', function (e) {
    if (!touch) return;
    var t = touch;
    if (t.kind === 'watch') watchTouchEnd(e);
    else {
      clearTimeout(t.holdTimer);
      if (t.held) endHold();
    }
    touch = null;
  }, { capture: true, passive: true });

  window.addEventListener('touchcancel', cancelTouch, { capture: true, passive: true });

  function cancelTouch() {
    if (!touch || syntheticCancel) return;
    clearTimeout(touch.holdTimer);
    if (touch.held) endHold();
    if (touch.kind === 'watch' && touch.axis === 'down') {
      var box = playerBox();
      rootClasses().remove('bopbox-dragging');
      if (box) box.style.transform = '';
    }
    touch = null;
  }

  setInterval(function () {
    if (!B.isBackground()) syncPage();
  }, 400);
  B.onRoot(syncPage);

  window.__bopboxGesturesInternals = {
    mode: function () { return mode; },
    enterMini: enterMini,
    expand: expand,
    closeMini: closeMini,
    miniGeometry: miniGeometry,
    likeButton: likeButton,
    startHold: startHold,
    endHold: endHold,
    openFromFrame: openFromFrame,
    frameDepth: function () { return frameDepth; },
  };

  // ---------------------------------------------------------------------------------------
  // Inside the browse frame: no video of its own, and video links open in the main page.
  // ---------------------------------------------------------------------------------------
  function browseFrame() {
    var host = window.parent;
    var origin = location.origin;
    function send(msg) { try { host.postMessage(msg, origin); } catch (e) {} }

    // Feed previews must not play behind (or over the sound of) the miniplayer.
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('Playback happens in the main page', 'NotAllowedError'));
    };
    B.addStyle(
      'html{-webkit-tap-highlight-color:transparent}' +
        '#player-container-id,ytm-inline-playback-renderer video,.inline-player-container{display:none!important}',
      'bopbox-browse-frame',
    );

    function isVideoUrl(href) {
      try {
        var u = new URL(href, location.href);
        return u.origin === origin && (u.pathname === '/watch' || u.pathname.indexOf('/shorts/') === 0);
      } catch (e) {
        return false;
      }
    }

    window.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var video = isVideoUrl(a.href);
      var offSite = false;
      try { offSite = /^https?:$/.test(a.protocol) && a.origin !== origin; } catch (err) {}
      if (!video && !offSite) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Videos play in the main page; other sites (Google sign-in) refuse to load in a frame.
      send(video ? { __bopboxOpen: a.href } : { __bopboxLeave: a.href });
    }, true);

    // Navigation YouTube does by itself (no link in the DOM): hand the video over, stay put.
    var push = history.pushState;
    history.pushState = function (state, title, url) {
      if (url != null && isVideoUrl(String(url))) {
        send({ __bopboxOpen: new URL(String(url), location.href).href });
        return undefined;
      }
      var r = push.apply(this, arguments);
      send({ __bopboxNav: 'push' });
      return r;
    };
    window.addEventListener('popstate', function () { send({ __bopboxNav: 'pop' }); });
  }
})();
