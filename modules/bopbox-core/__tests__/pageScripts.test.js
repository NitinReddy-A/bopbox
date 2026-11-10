/**
 * @jest-environment jsdom
 *
 * Behavioural tests for the scripts injected into YouTube/Spotify pages. They run the real
 * asset files inside jsdom with a fake native bridge.
 */
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'android', 'src', 'main', 'assets', 'bopbox');
const read = (name) => fs.readFileSync(path.join(ASSETS, name), 'utf8');

// youtube.js patches globals; keep the pristine versions so every test starts clean.
const nativeJsonParse = JSON.parse;
const nativePlay = HTMLMediaElement.prototype.play;
const nativeResponse = window.Response;

function boot(config, scripts) {
  jest.useFakeTimers();
  const posted = [];
  window.BopboxBridge = { postMessage: (s) => posted.push(JSON.parse(s)) };
  window.__bopboxConfig = config;
  for (const s of scripts) window.eval(read(s));
  return posted;
}

function resetWindow() {
  JSON.parse = nativeJsonParse;
  HTMLMediaElement.prototype.play = nativePlay;
  delete window.__bopbox;
  delete window.__bopboxYouTube;
  delete window.__bopboxScriptlets;
  delete window.__bopboxGestures;
  delete window.__bopboxGesturesInternals;
  delete navigator.connection;
  delete window.__bopboxConfig;
  delete window.ytInitialPlayerResponse;
  delete window.fetch;
  window.Response = nativeResponse;
  window.localStorage.clear();
  document.documentElement.className = '';
  document.head.innerHTML = '';
  document.body.innerHTML = '';
}

// jsdom has no media playback: give HTMLMediaElement a minimal fake implementation.
function installMediaFakes() {
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return this._paused !== false; } });
  for (const [prop, initial] of [['currentTime', 0], ['playbackRate', 1], ['muted', false]]) {
    Object.defineProperty(HTMLMediaElement.prototype, prop, {
      configurable: true,
      get() { return this['_' + prop] ?? initial; },
      set(v) { this['_' + prop] = v; },
    });
  }
  HTMLMediaElement.prototype.play = function () {
    this._paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () {
    this._paused = true;
    this.dispatchEvent(new Event('pause'));
  };
}

describe('bridge.js', () => {
  beforeEach(() => {
    resetWindow();
    installMediaFakes();
  });
  afterEach(() => jest.useRealTimers());

  it('pretends the page is always visible when background play is on', () => {
    boot({ app: 'youtube', backgroundPlay: true, cosmetic: {} }, ['bridge.js']);
    expect(document.hidden).toBe(false);
    expect(document.visibilityState).toBe('visible');
    const seen = jest.fn();
    document.addEventListener('visibilitychange', seen);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).not.toHaveBeenCalled();
  });

  it('reports media session metadata and playback state', async () => {
    const posted = boot({ app: 'youtube', backgroundPlay: true, cosmetic: {} }, ['bridge.js']);
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: 'Midnight City',
      artist: 'M83',
      artwork: [{ src: 'https://i.scdn.co/small.jpg', sizes: '64x64' }, { src: 'https://i.scdn.co/big.jpg', sizes: '640x640' }],
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {});
    const audio = document.createElement('audio');
    await audio.play();
    jest.advanceTimersByTime(1100);
    const last = posted.filter((m) => m.t === 'media').pop();
    expect(last).toMatchObject({ title: 'Midnight City', artist: 'M83', artwork: 'https://i.scdn.co/big.jpg', playing: true });
    expect(last.actions).toContain('nexttrack');
  });

  it('routes native commands to media session handlers first, then the element', async () => {
    boot({ app: 'youtube', backgroundPlay: false, cosmetic: {} }, ['bridge.js']);
    const pauseHandler = jest.fn();
    navigator.mediaSession.setActionHandler('pause', pauseHandler);
    window.__bopbox.command('pause');
    expect(pauseHandler).toHaveBeenCalledWith(expect.objectContaining({ action: 'pause' }));

    const video = document.createElement('video');
    document.body.appendChild(video);
    await video.play();
    window.__bopbox.command('seek', 42);
    expect(video.currentTime).toBe(42);
  });

  it('ignores page-initiated pauses in the background but honours user pauses', async () => {
    boot({ app: 'youtube', backgroundPlay: true, cosmetic: {} }, ['bridge.js']);
    const video = document.createElement('video');
    document.body.appendChild(video);
    await video.play();

    window.__bopbox.command('background', 1);
    video.pause(); // e.g. YouTube's "background play is Premium" pause
    expect(video.paused).toBe(false);

    window.__bopbox.command('pause'); // user tapped pause on the notification
    expect(video.paused).toBe(true);

    await video.play();
    window.__bopbox.command('background', 0);
    video.pause(); // foreground: the page is in charge again
    expect(video.paused).toBe(true);
  });

  it('toggles the PiP presentation class', () => {
    boot({ app: 'youtube', backgroundPlay: true, cosmetic: {} }, ['bridge.js']);
    window.__bopbox.command('pip', 1);
    expect(document.documentElement.classList.contains('bopbox-pip')).toBe(true);
    window.__bopbox.command('pip', 0);
    expect(document.documentElement.classList.contains('bopbox-pip')).toBe(false);
  });

  it('injects host cosmetic filters only when ad blocking is on', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: { localhost: ['.promo', 'div[data-ad]'] } }, ['bridge.js']);
    const style = document.getElementById('bopbox-cosmetic');
    expect(style).not.toBeNull();
    expect(style.textContent).toContain(':is(.promo,div[data-ad]){display:none!important}');
  });
});

describe('youtube.js', () => {
  beforeEach(() => {
    resetWindow();
    installMediaFakes();
  });
  afterEach(() => jest.useRealTimers());

  const adJson = JSON.stringify({
    playabilityStatus: { status: 'OK' },
    adPlacements: [{ x: 1 }],
    playerAds: [{ y: 1 }],
    adSlots: [],
    streamingData: { formats: [1] },
  });

  it('prunes ad payloads from JSON.parse results', () => {
    const posted = boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const parsed = JSON.parse(adJson);
    expect(parsed.adPlacements).toBeUndefined();
    expect(parsed.playerAds).toBeUndefined();
    expect(parsed.adSlots).toBeUndefined();
    expect(parsed.streamingData.formats).toEqual([1]);
    expect(posted.some((m) => m.t === 'blocked')).toBe(true);
  });

  it('prunes the initial player response assigned as a literal', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    window.ytInitialPlayerResponse = { adPlacements: [1], videoDetails: { videoId: 'abc' } };
    expect(window.ytInitialPlayerResponse.adPlacements).toBeUndefined();
    expect(window.ytInitialPlayerResponse.videoDetails.videoId).toBe('abc');
  });

  it('prunes nested playerResponse objects in SPF arrays', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const parsed = JSON.parse(JSON.stringify([{ playerResponse: { adPlacements: [1], ok: true } }]));
    expect(parsed[0].playerResponse.adPlacements).toBeUndefined();
    expect(parsed[0].playerResponse.ok).toBe(true);
  });

  it('leaves responses untouched when ad blocking is off', () => {
    boot({ app: 'youtube', adblock: false, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    expect(JSON.parse(adJson).adPlacements).toHaveLength(1);
  });

  it('mutes and skips ads that still play, then restores audio', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    document.body.innerHTML = '<div id="movie_player" class="html5-video-player ad-showing"><video></video><button class="ytp-skip-ad-button"></button></div>';
    const video = document.querySelector('video');
    const skip = document.querySelector('button');
    const clicked = jest.fn();
    skip.addEventListener('click', clicked);
    Object.defineProperty(video, 'duration', { configurable: true, value: 15 });
    jest.advanceTimersByTime(300);
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBeCloseTo(14.9);
    expect(clicked).toHaveBeenCalled();

    document.getElementById('movie_player').classList.remove('ad-showing');
    jest.advanceTimersByTime(300);
    expect(video.muted).toBe(false);
    expect(video.playbackRate).toBe(1);
  });

  it('turns the signed-out "Open App" button into a Google sign-in link', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    document.body.innerHTML =
      '<div class="mobile-topbar-header-sign-in-button"><a href="intent://open" aria-label="Open App"><span>Open App</span></a></div>';
    jest.advanceTimersByTime(1100);
    const link = document.querySelector('a');
    expect(link.getAttribute('href')).toMatch(/^https:\/\/accounts\.google\.com\/ServiceLogin\?service=youtube/);
    expect(link.getAttribute('aria-label')).toBe('Sign in');
    expect(link.textContent).toBe('Sign in');
  });

  it('exposes video metadata fallbacks for the notification', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    window.history.pushState({}, '', '/watch?v=dQw4w9WgXcQ');
    document.title = 'Never Gonna Give You Up - YouTube';
    const snap = window.__bopbox._snapshot();
    expect(snap.title).toBe('Never Gonna Give You Up');
    expect(snap.artwork).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    window.history.pushState({}, '', '/');
  });
});

describe('youtube.js player features', () => {
  beforeEach(() => {
    resetWindow();
    installMediaFakes();
    window.history.pushState({}, '', '/watch?v=dQw4w9WgXcQ');
  });
  afterEach(() => {
    window.history.pushState({}, '', '/');
    jest.useRealTimers();
  });

  function mountPlayer(api = {}) {
    document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
    const p = document.getElementById('movie_player');
    Object.assign(p, api);
    const v = p.querySelector('video');
    Object.defineProperty(v, 'duration', { configurable: true, value: 212 });
    return { p, v };
  }

  it('applies the default speed and quality once per video, and always-repeat', () => {
    boot({ app: 'youtube', adblock: true, defaultSpeed: 1.5, defaultQuality: '720', alwaysRepeat: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const setRange = jest.fn();
    const { v } = mountPlayer({
      setPlaybackRate: jest.fn(),
      getAvailableQualityLevels: () => ['hd1080', 'large', 'medium', 'auto'],
      setPlaybackQualityRange: setRange,
    });
    jest.advanceTimersByTime(600);
    expect(v.playbackRate).toBe(1.5);
    expect(v.loop).toBe(true);
    // 720p isn't offered, so the best level below it wins.
    expect(setRange).toHaveBeenCalledWith('large', 'large');

    v.playbackRate = 1; // the user changes it on this video: respected
    jest.advanceTimersByTime(1000);
    expect(v.playbackRate).toBe(1);
  });

  it('always loops Shorts, and replays when a player ends the stream itself', () => {
    window.history.pushState({}, '', '/shorts/dQw4w9WgXcQ');
    boot({ app: 'youtube', adblock: true, alwaysRepeat: false, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const { v } = mountPlayer();
    jest.advanceTimersByTime(600);
    expect(v.loop).toBe(true);
    v.currentTime = 30;
    v.pause();
    v.dispatchEvent(new Event('ended'));
    expect(v.currentTime).toBe(0);
    expect(v.paused).toBe(false);
  });

  it('replays a regular video through the player when Always repeat is on, not when it is off', () => {
    const cfg = { app: 'youtube', adblock: true, alwaysRepeat: true, cosmetic: {} };
    boot(cfg, ['bridge.js', 'youtube.js']);
    const seekTo = jest.fn();
    const { v } = mountPlayer({ seekTo });
    jest.advanceTimersByTime(600);
    expect(v.loop).toBe(true);
    v.dispatchEvent(new Event('ended'));
    expect(seekTo).toHaveBeenCalledWith(0, true);
    expect(v.paused).toBe(false);

    cfg.alwaysRepeat = false; // toggled live from Settings
    jest.advanceTimersByTime(600);
    expect(v.loop).toBe(false);
    v.pause();
    v.dispatchEvent(new Event('ended'));
    expect(seekTo).toHaveBeenCalledTimes(1);
    expect(v.paused).toBe(true);
  });

  it('starts lower on slow or metered connections so the first frame is not held up', () => {
    const cfg = { app: 'youtube', defaultQuality: '1080', cosmetic: {} };
    const net = { effectiveType: '4g', downlink: 10, saveData: false };
    Object.defineProperty(navigator, 'connection', { configurable: true, value: net });
    boot(cfg, ['bridge.js', 'youtube.js']);
    const { startQuality } = window.__bopboxYouTubeInternals;
    expect(startQuality()).toBe('1080');
    net.downlink = 3.5;
    expect(startQuality()).toBe('720');
    net.effectiveType = '3g';
    expect(startQuality()).toBe('480');
    net.effectiveType = '2g';
    expect(startQuality()).toBe('360');
    Object.assign(net, { effectiveType: '4g', downlink: 10, saveData: true });
    expect(startQuality()).toBe('360');
    net.saveData = false;
    cfg.defaultQuality = '480'; // never raises a lower preference
    net.downlink = 3;
    expect(startQuality()).toBe('480');
    cfg.defaultQuality = 'auto';
    expect(startQuality()).toBe('auto');
  });

  it('stops page upkeep while in the background, but keeps skipping ads and sponsors', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const { v, p } = mountPlayer();
    document.body.insertAdjacentHTML('beforeend', '<ytm-mobile-topbar-renderer><header></header></ytm-mobile-topbar-renderer>');
    window.__bopbox.command('background', 1);
    jest.advanceTimersByTime(3000);
    expect(document.getElementById('bopbox-settings')).toBeNull();
    p.classList.add('ad-showing');
    jest.advanceTimersByTime(300);
    expect(v.muted).toBe(true);
    p.classList.remove('ad-showing');
    window.__bopbox.command('background', 0);
    jest.advanceTimersByTime(1100);
    expect(document.getElementById('bopbox-settings')).not.toBeNull();
  });

  it('starts every video at the preferred quality via YouTube’s own sticky setting', () => {
    boot({ app: 'youtube', adblock: true, defaultQuality: '1080', cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const sticky = JSON.parse(window.localStorage.getItem('yt-player-quality'));
    expect(JSON.parse(sticky.data).quality).toBe(1080);
    expect(sticky.expiration).toBeGreaterThan(Date.now());

    // Already playing at that quality: no second switch (which would rebuffer).
    const setRange = jest.fn();
    mountPlayer({ getAvailableQualityLevels: () => ['hd1080', 'hd720'], getPlaybackQuality: () => 'hd1080', setPlaybackQualityRange: setRange });
    jest.advanceTimersByTime(600);
    expect(setRange).not.toHaveBeenCalled();

    // Back to Auto: our entry goes, YouTube decides again.
    window.__bopboxConfig.defaultQuality = 'auto';
    jest.advanceTimersByTime(600);
    expect(window.localStorage.getItem('yt-player-quality')).toBeNull();
  });

  it('leaves a quality the user picked in YouTube alone when set to Auto', () => {
    window.localStorage.setItem('yt-player-quality', JSON.stringify({ data: JSON.stringify({ quality: 480 }) }));
    boot({ app: 'youtube', adblock: true, defaultQuality: 'auto', cosmetic: {} }, ['bridge.js', 'youtube.js']);
    jest.advanceTimersByTime(600);
    expect(window.localStorage.getItem('yt-player-quality')).not.toBeNull();
  });

  it('picks the best quality at or below the preference', () => {
    boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const { pickQuality } = window.__bopboxYouTubeInternals;
    expect(pickQuality(1080, ['hd2160', 'hd1080', 'hd720'])).toBe('hd1080');
    expect(pickQuality(1440, ['hd1080', 'hd720'])).toBe('hd1080');
    expect(pickQuality(144, ['hd720'])).toBeNull();
  });

  it('shows the Return YouTube Dislike count on the dislike button', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ dislikes: 2345678 }) }));
    boot({ app: 'youtube', adblock: true, returnDislike: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    document.body.innerHTML += '<button aria-label="Dislike this video"><svg></svg></button>';
    jest.advanceTimersByTime(800);
    for (let i = 0; i < 8; i++) await Promise.resolve(); // let the fetch chain settle
    jest.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith('https://returnyoutubedislikeapi.com/votes?videoId=dQw4w9WgXcQ');
    expect(document.querySelector('.bopbox-dislikes').textContent).toBe('2.3M');
    const { shortCount } = window.__bopboxYouTubeInternals;
    expect([shortCount(950), shortCount(1234), shortCount(52160), shortCount(521600)]).toEqual(['950', '1.2K', '52K', '522K']);
    delete global.fetch;
  });

  it('toggles Shorts and card hiding live from the config', () => {
    boot({ app: 'youtube', adblock: true, hideShorts: false, hideCards: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    const root = document.documentElement;
    expect(root.classList.contains('bopbox-hide-shorts')).toBe(false);
    expect(root.classList.contains('bopbox-hide-cards')).toBe(true);
    Object.assign(window.__bopboxConfig, { hideShorts: true, hideCards: false });
    jest.advanceTimersByTime(1100);
    expect(root.classList.contains('bopbox-hide-shorts')).toBe(true);
    expect(root.classList.contains('bopbox-hide-cards')).toBe(false);
  });

  it('puts a Settings button in YouTube’s top bar that asks native to open Settings', () => {
    const posted = boot({ app: 'youtube', adblock: true, cosmetic: {} }, ['bridge.js', 'youtube.js']);
    // The header layout YouTube currently serves: buttons are direct children of <header>.
    document.body.innerHTML =
      '<ytm-mobile-topbar-renderer><header class="mobile-topbar-header"><ytm-home-logo></ytm-home-logo>' +
      '<yt-searchbox><div><button aria-label="Search"></button></div></yt-searchbox>' +
      '<div class="mobile-topbar-header-content"></div><button class="topbar-button-search-button" aria-label="Search YouTube"></button>' +
      '<button aria-label="More options"></button></header></ytm-mobile-topbar-renderer>';
    jest.advanceTimersByTime(900);
    const btn = document.getElementById('bopbox-settings');
    expect(btn).not.toBeNull();
    expect(btn.nextElementSibling.getAttribute('aria-label')).toBe('Search YouTube');
    expect(btn.querySelector('svg')).not.toBeNull();
    btn.click();
    expect(posted).toContainEqual({ t: 'openSettings' });
    jest.advanceTimersByTime(900);
    expect(document.querySelectorAll('#bopbox-settings')).toHaveLength(1);
  });
});

describe('scriptlets.js (uBO ##+js rules)', () => {
  beforeEach(() => {
    resetWindow();
    installMediaFakes();
  });
  afterEach(() => jest.useRealTimers());

  // jsdom pages run on http://localhost/, so rules are keyed by that host.
  const withRules = (rules, extra = {}) =>
    boot(
      { app: 'youtube', adblock: true, cosmetic: {}, scriptlets: { localhost: rules }, ...extra },
      ['bridge.js', 'scriptlets.js', 'youtube.js'],
    );

  // Minimal fetch Response stand-in (jsdom has none).
  class FakeResponse {
    constructor(body, init = {}) {
      this.body = String(body);
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? 'OK';
      this.headers = init.headers ?? {};
      this.ok = this.status >= 200 && this.status < 300;
      this.redirected = false;
      this.type = 'basic';
      this.url = init.url ?? '';
    }
    clone() {
      return new FakeResponse(this.body, this);
    }
    text() {
      return Promise.resolve(this.body);
    }
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
  }

  function serve(routes) {
    window.Response = FakeResponse;
    window.fetch = jest.fn((url) => {
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      return Promise.resolve(new FakeResponse(JSON.stringify(routes[key] ?? {}), { url: String(url) }));
    });
  }

  it('parses rule arguments like uBO: quotes, escaped commas, empty slots', () => {
    withRules([]);
    const { parseArgs } = window.__bopboxScriptlets;
    expect(parseArgs(`trusted-rpfr, '"adPlacements"', '"no_ads"', player?`)).toEqual([
      'trusted-rpfr',
      '"adPlacements"',
      '"no_ads"',
      'player?',
    ]);
    expect(parseArgs('json-prune-fetch-response, a.b c, , propsToMatch, url:/x?')).toEqual([
      'json-prune-fetch-response',
      'a.b c',
      '',
      'propsToMatch',
      'url:/x?',
    ]);
    expect(parseArgs(String.raw`nano-stb.js, /a{2\,4}/, 17000`)).toEqual(['nano-stb', '/a{2,4}/', '17000']);
  });

  it('set rules strip ads from the initial player response, alongside youtube.js', () => {
    withRules([
      'set, ytInitialPlayerResponse.playerAds, undefined',
      'set, ytInitialPlayerResponse.adPlacements, undefined',
      'set, ytInitialPlayerResponse.adSlots, undefined',
    ]);
    window.ytInitialPlayerResponse = { playerAds: [1], adPlacements: [2], adSlots: [3], videoDetails: { videoId: 'abc' } };
    const r = window.ytInitialPlayerResponse;
    expect(r.playerAds).toBeUndefined();
    expect(r.adPlacements).toBeUndefined();
    expect(r.adSlots).toBeUndefined();
    expect(r.videoDetails.videoId).toBe('abc');
    expect(JSON.parse(JSON.stringify(r))).toEqual({ videoDetails: { videoId: 'abc' } });
  });

  it('json-prune removes sponsored Shorts from reel feeds and nothing else', () => {
    withRules(['json-prune, entries.[-].command.reelWatchEndpoint.adClientParams.isAd']);
    const feed = JSON.parse(
      JSON.stringify({
        entries: [
          { command: { reelWatchEndpoint: { videoId: 'a' } } },
          { command: { reelWatchEndpoint: { videoId: 'ad', adClientParams: { isAd: true } } } },
          { command: { reelWatchEndpoint: { videoId: 'b' } } },
        ],
      }),
    );
    expect(feed.entries.map((e) => e.command.reelWatchEndpoint.videoId)).toEqual(['a', 'b']);
    expect(window.__bopboxScriptlets.counts.rules).toBe(1);
  });

  it('json-prune only prunes when every needle path is present', () => {
    withRules(['json-prune, trackingParams, adSignals']);
    expect(JSON.parse('{"trackingParams":1}').trackingParams).toBe(1);
    expect(JSON.parse('{"trackingParams":1,"adSignals":{}}').trackingParams).toBeUndefined();
  });

  it('json-prune-fetch-response edits matching requests only', async () => {
    const body = { endpoint: { watchEndpoint: { unserializedPrefetchData: { playerResponse: { adPlacements: [1], ok: 1 } } } } };
    serve({ '/resolve_url?': body, '/other': body });
    withRules([
      'json-prune-fetch-response, endpoint.watchEndpoint.unserializedPrefetchData.playerResponse.adPlacements, , propsToMatch, /resolve_url?',
    ]);
    const pruned = await (await window.fetch('https://m.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false')).json();
    expect(pruned.endpoint.watchEndpoint.unserializedPrefetchData.playerResponse).toEqual({ ok: 1 });
    const untouched = await (await window.fetch('https://m.youtube.com/other')).json();
    expect(untouched.endpoint.watchEndpoint.unserializedPrefetchData.playerResponse.adPlacements).toEqual([1]);
  });

  it('json-edit-fetch-response drops ad slots from watch-page item sections', async () => {
    serve({
      '/get_watch': [
        {
          response: {
            a: { itemSectionRenderer: { contents: [{ videoRenderer: 1 }, { adSlotRenderer: { x: 1 } }, { videoRenderer: 2 }] } },
            b: { itemSectionRenderer: { contents: [{ adSlotRenderer: {} }] } },
          },
        },
      ],
    });
    withRules(['json-edit-fetch-response, ..itemSectionRenderer.contents.*[?.adSlotRenderer], propsToMatch, /get_watch']);
    const data = await (await window.fetch('https://m.youtube.com/youtubei/v1/get_watch?prettyPrint=false')).json();
    expect(data[0].response.a.itemSectionRenderer.contents).toEqual([{ videoRenderer: 1 }, { videoRenderer: 2 }]);
    expect(data[0].response.b.itemSectionRenderer.contents).toEqual([]);
  });

  it('trusted-replace-fetch-response rewrites matching bodies as text', async () => {
    serve({ 'player?': { adPlacements: [1], keep: true } });
    withRules([`trusted-rpfr, '"adPlacements"', '"no_ads"', player?`], { adblock: true });
    const data = await (await window.fetch('https://www.youtube.com/youtubei/v1/player?key=1')).json();
    expect(data).toEqual({ no_ads: [1], keep: true });
  });

  it('JSON paths: filters, wildcards, and assignments for trusted rules only', () => {
    withRules([]);
    const { compileJsonPath, applyJsonPath, run } = window.__bopboxScriptlets;
    const obj = { list: [{ kind: 'ad', v: 1 }, { kind: 'video', v: 2 }], deep: { x: { kind: 'ad' } } };
    expect(applyJsonPath(compileJsonPath('.list[?.kind=="ad"]'), obj)).toBe(1);
    expect(obj.list).toEqual([{ kind: 'video', v: 2 }]);
    expect(applyJsonPath(compileJsonPath('..kind=1'), obj)).toBe(2);
    expect(obj.deep.x.kind).toBe(1);
    expect(compileJsonPath('.a[')).toBeNull();
    expect(run('json-edit, .a=1')).toBe(false);
    expect(run('trusted-json-edit, .a=1')).toBe(true);
  });

  it('removes several ad slots from the same list, wherever they sit', async () => {
    const slot = { adSlotRenderer: {} };
    serve({
      '/get_watch': { x: { itemSectionRenderer: { contents: [slot, { v: 1 }, slot, slot, { v: 2 }, slot] } } },
    });
    withRules(['json-edit-fetch-response, ..itemSectionRenderer.contents.*[?.adSlotRenderer], propsToMatch, /get_watch']);
    const data = await (await window.fetch('https://m.youtube.com/youtubei/v1/get_watch')).json();
    expect(data.x.itemSectionRenderer.contents).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it('hands back the original response, unparsed, when a body cannot contain what a rule removes', async () => {
    serve({ '/get_watch': { x: { itemSectionRenderer: { contents: [{ videoRenderer: 1 }] } } } });
    withRules([
      'json-edit-fetch-response, ..itemSectionRenderer.contents.*[?.adSlotRenderer], propsToMatch, /get_watch',
      'json-prune-fetch-response, playerResponse.adPlacements playerResponse.adSlots, , propsToMatch, /get_watch',
    ]);
    const parse = jest.spyOn(JSON, 'parse');
    const res = await window.fetch('https://m.youtube.com/youtubei/v1/get_watch');
    // No ad keys in the text: no parse, no re-serialised copy, the page gets YouTube's own response.
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(res.constructor.name).toBe('FakeResponse');
    expect((await res.json()).x.itemSectionRenderer.contents).toEqual([{ videoRenderer: 1 }]);
    expect(window.__bopboxScriptlets.counts.edits).toBe(0);
  });

  it('text hints: every needle and at least one prune path must appear as a key', () => {
    withRules([]);
    const { makePruner, textHint } = window.__bopboxScriptlets;
    const prune = makePruner('a.[-].ad b.gone', 'meta.ok');
    expect(prune.mayApply('{"meta":{"ok":1},"a":[{"ad":1}]}')).toBe(true);
    expect(prune.mayApply('{"meta":{"ok":1},"b":{"gone":1}}')).toBe(true);
    expect(prune.mayApply('{"meta":{"ok":1},"a":[{"video":1}]}')).toBe(false);
    expect(prune.mayApply('{"a":[{"ad":1}]}')).toBe(false); // needle missing
    expect(prune.mayApply({ not: 'text' })).toBe(true); // unknown input: never skip
    expect(textHint([['x']])('{"y":1}')).toBe(false);
    expect(textHint([['x']])('{"y":"x"}')).toBe(true); // may over-match (never under-match)
  });

  it('skips scriptlets it does not implement, and installs late rules once', () => {
    withRules([String.raw`rmnt, script, window\,"fetch"`, 'no-xhr-if, /ads/']);
    expect(window.__bopboxScriptlets.counts.rules).toBe(0);
    window.__bopboxConfig.scriptlets = { localhost: ['json-prune, adPlacements'] };
    window.__bopboxScriptlets.sync();
    window.__bopboxScriptlets.sync();
    expect(window.__bopboxScriptlets.counts.rules).toBe(1);
    expect(JSON.parse('{"adPlacements":[1],"a":1}')).toEqual({ a: 1 });
  });

  it('does nothing while ad blocking is off', () => {
    withRules(['json-prune, keepme'], { adblock: false });
    expect(JSON.parse('{"keepme":1}')).toEqual({ keepme: 1 });
    expect(window.__bopboxScriptlets.counts.rules).toBe(0);
  });
});

describe('gestures.js', () => {
  const SCRIPTS = ['bridge.js', 'youtube.js', 'gestures.js'];
  const VIEW = { w: 400, h: 800 };

  beforeEach(() => {
    resetWindow();
    installMediaFakes();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEW.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEW.h });
    window.scrollTo = jest.fn();
    // The scripts listen on window for good; remove each test's listeners so runs stay separate.
    const add = window.addEventListener;
    added = [];
    window.addEventListener = function (...args) {
      added.push(args);
      return add.apply(this, args);
    };
    restoreAdd = () => { window.addEventListener = add; };
  });
  afterEach(() => {
    restoreAdd();
    for (const args of added) window.removeEventListener(...args);
    window.history.pushState({}, '', '/');
    jest.useRealTimers();
  });

  let added = [];
  let restoreAdd = () => {};

  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

  // jsdom has no layout: give the elements the gestures measure a fixed place on screen.
  function mountWatch() {
    window.history.pushState({}, '', '/watch?v=dQw4w9WgXcQ');
    document.body.innerHTML =
      '<div id="player-container-id"><div id="movie_player" class="html5-video-player"><video></video>' +
      '<button class="fullscreen-icon"></button></div></div>';
    const box = document.getElementById('player-container-id');
    box.getBoundingClientRect = () => rect(0, 48, VIEW.w, 225);
    const video = box.querySelector('video');
    video.getBoundingClientRect = () => rect(0, 48, VIEW.w, 225);
    return { box, video };
  }

  function mountShort({ liked = false } = {}) {
    window.history.pushState({}, '', '/shorts/dQw4w9WgXcQ');
    document.body.innerHTML =
      '<shorts-video><div id="movie_player"><video></video></div><div class="overlay"></div></shorts-video>' +
      `<button aria-label="Dislike this video"></button><button id="like" aria-label="like this video along with 12K other people" aria-pressed="${liked}"></button>`;
    const video = document.querySelector('video');
    video.getBoundingClientRect = () => rect(0, 0, VIEW.w, VIEW.h);
    for (const b of document.querySelectorAll('button')) b.getBoundingClientRect = () => rect(340, 400, 48, 48);
    const like = document.getElementById('like');
    const liked_ = jest.fn();
    like.addEventListener('click', liked_);
    return { video, like, liked: liked_, overlay: document.querySelector('.overlay') };
  }

  function touch(type, target, x, y) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    const points = [{ clientX: x, clientY: y, identifier: 0, target }];
    e.touches = type === 'touchend' ? [] : points;
    e.changedTouches = points;
    target.dispatchEvent(e);
  }

  function tap(target, x, y) {
    touch('touchstart', target, x, y);
    touch('touchend', target, x, y);
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    target.dispatchEvent(e);
    return e;
  }

  const G = () => window.__bopboxGesturesInternals;
  const frame = () => document.getElementById('bopbox-browse');

  it('Android back on a playing video shrinks it into the miniplayer instead of leaving', () => {
    window.history.pushState({}, '', '/results?search_query=cats');
    const posted = boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    jest.advanceTimersByTime(500); // remembers the page the video was opened from
    const { box, video } = mountWatch();
    video.play();
    jest.advanceTimersByTime(500);

    expect(window.__bopbox.back()).toBe('handled');
    jest.advanceTimersByTime(400); // settle animation
    expect(G().mode()).toBe('mini');
    expect(document.documentElement.classList.contains('bopbox-mini')).toBe(true);
    // The rest of YouTube shows behind it, where the user came from.
    expect(frame().name).toBe('bopbox-browse');
    expect(frame().src).toBe('http://localhost/results?search_query=cats');
    // Bottom right, scaled down, clear of the tab bar.
    const g = G().miniGeometry(225);
    expect(box.style.transform).toBe(`translate3d(${g.x}px,${g.y}px,0) scale(${g.s})`);
    expect(g.x + g.w).toBeLessThanOrEqual(VIEW.w - 12);
    expect(g.y + g.h).toBeLessThanOrEqual(VIEW.h - 64);
    expect(posted).toContainEqual({ t: 'haptic', k: 'light' });

    // Back again: nothing left to minimise, so the app steps into the background and keeps playing.
    expect(window.__bopbox.back()).toBe('background');
  });

  it('tapping the miniplayer expands it; the close button stops the video', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { box, video } = mountWatch();
    video.play();
    window.__bopbox.back();
    jest.advanceTimersByTime(400);
    const ui = document.getElementById('bopbox-mini-ui');

    touch('touchstart', ui, 300, 600);
    touch('touchend', ui, 300, 600);
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('full');
    expect(document.documentElement.classList.contains('bopbox-mini')).toBe(false);
    expect(box.style.transform).toBe('');
    expect(video.paused).toBe(false);

    window.__bopbox.back();
    jest.advanceTimersByTime(400);
    ui.querySelector('.bopbox-close').click();
    expect(G().mode()).toBe('closed');
    expect(video.paused).toBe(true);
    expect(window.__bopbox.back()).toBe('background');
  });

  it('dragging the player down past the threshold minimises; a short drag springs back', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { box, video } = mountWatch();
    jest.advanceTimersByTime(500);

    touch('touchstart', video, 200, 120);
    touch('touchmove', video, 202, 160);
    expect(document.documentElement.classList.contains('bopbox-dragging')).toBe(true);
    expect(box.style.transform).toMatch(/^translate3d\(.+px,40px,0\) scale\(0\.\d+\)$/);
    expect(frame()).not.toBeNull(); // the browse page starts loading mid-drag
    touch('touchend', video, 202, 170);
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('full');
    expect(box.style.transform).toBe('');

    touch('touchstart', video, 200, 120);
    touch('touchmove', video, 200, 200);
    touch('touchmove', video, 200, 420);
    touch('touchend', video, 200, 420);
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('mini');
  });

  it('leaves the seek bar and sideways drags to YouTube', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { box, video } = mountWatch();
    jest.advanceTimersByTime(500);
    touch('touchstart', video, 200, 268); // bottom strip of the player
    touch('touchmove', video, 200, 400);
    touch('touchend', video, 200, 400);
    touch('touchstart', video, 100, 120);
    touch('touchmove', video, 300, 130);
    touch('touchend', video, 300, 130);
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('full');
    expect(box.style.transform).toBe('');
  });

  it('swiping the player up goes fullscreen through YouTube’s own button', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    const fullscreen = jest.fn();
    document.querySelector('.fullscreen-icon').addEventListener('click', fullscreen);
    jest.advanceTimersByTime(500);
    touch('touchstart', video, 200, 200);
    touch('touchmove', video, 200, 150);
    touch('touchend', video, 200, 110);
    jest.advanceTimersByTime(300);
    expect(fullscreen).toHaveBeenCalledTimes(1);
  });

  it('with the miniplayer switched off, back and drags behave like the plain site', () => {
    const cfg = { app: 'youtube', miniplayer: false, cosmetic: {} };
    boot(cfg, SCRIPTS);
    const { box, video } = mountWatch();
    jest.advanceTimersByTime(500);
    expect(window.__bopbox.back()).toBe('none');
    touch('touchstart', video, 200, 120);
    touch('touchmove', video, 200, 420);
    touch('touchend', video, 200, 420);
    expect(G().mode()).toBe('full');
    expect(box.style.transform).toBe('');
    expect(document.documentElement.classList.contains('bopbox-mini-on')).toBe(false);

    cfg.miniplayer = true; // switched on live from Settings
    video.play();
    jest.advanceTimersByTime(500);
    expect(window.__bopbox.back()).toBe('handled');
  });

  it('back is left to the app on pages without a video', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    expect(window.__bopbox.back()).toBe('none');
    mountShort().video.play();
    expect(window.__bopbox.back()).toBe('none');
  });

  it('back only keeps a video that is playing: paused or finished, it goes back a page', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    jest.advanceTimersByTime(500);
    expect(window.__bopbox.back()).toBe('none'); // not started yet
    video.play();
    video.pause();
    expect(window.__bopbox.back()).toBe('none');
    expect(G().mode()).toBe('full');
    video.play();
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    expect(window.__bopbox.back()).toBe('none');
    delete video.ended;
    expect(window.__bopbox.back()).toBe('handled');
  });

  it('finds the player even if YouTube renames its container, the way Brave looks for it', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    window.history.pushState({}, '', '/watch?v=dQw4w9WgXcQ');
    document.body.innerHTML = '<ytm-player><div id="movie_player" class="html5-video-player"><video></video></div></ytm-player>';
    const box = document.querySelector('ytm-player');
    box.getBoundingClientRect = () => rect(0, 48, VIEW.w, 225);
    document.querySelector('video').play();
    jest.advanceTimersByTime(500);
    expect(window.__bopbox.back()).toBe('handled');
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('mini');
    expect(box.hasAttribute('data-bopbox-player')).toBe(true);
    expect(box.style.transform).toMatch(/^translate3d\(.+\) scale\(0\.\d+\)$/);
    // The styles address it by that mark as well as by the usual id.
    expect(document.getElementById('bopbox-gestures').textContent).toContain(':is(#player-container-id,[data-bopbox-player])');
  });

  it('if YouTube will not load in the frame, the miniplayer floats over the watch page instead', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    video.play();
    jest.advanceTimersByTime(500);
    window.__bopbox.back();
    jest.advanceTimersByTime(400);
    // The frame "loads" without Tube's scripts in it: an error page, or a refusal.
    frame().dispatchEvent(new Event('load'));
    expect(frame()).toBeNull();
    expect(G().mode()).toBe('mini');
    const cls = document.documentElement.classList;
    expect(cls.contains('bopbox-mini-solo')).toBe(true);
    // Nothing behind to walk back through, so back is a normal back.
    expect(window.__bopbox.back()).toBe('none');
    // Closing puts the paused video back in its place rather than leaving an empty page.
    document.querySelector('#bopbox-mini-ui .bopbox-close').click();
    expect(G().mode()).toBe('full');
    expect(video.paused).toBe(true);
    expect(cls.contains('bopbox-mini') || cls.contains('bopbox-mini-solo')).toBe(false);

    // From then on no frame is created; picking a related video drops the miniplayer.
    video.play();
    expect(window.__bopbox.back()).toBe('handled');
    jest.advanceTimersByTime(400);
    expect(frame()).toBeNull();
    expect(cls.contains('bopbox-mini-solo')).toBe(true);
    window.history.pushState({}, '', '/watch?v=aaaaaaaaaaa');
    jest.advanceTimersByTime(500);
    expect(G().mode()).toBe('full');
  });

  it('finds the Short’s like button from YouTube’s components, its label, or its position', () => {
    boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    window.history.pushState({}, '', '/shorts/dQw4w9WgXcQ');
    const place = () => { for (const b of document.querySelectorAll('button')) b.getBoundingClientRect = () => rect(340, 400, 48, 48); };

    // Mobile markup: a like/dislike pair inside ytm-like-button-renderer, label "100 likes".
    document.body.innerHTML =
      '<ytm-reel-video-renderer video-id="other"><ytm-like-button-renderer><like-button-view-model><button id="wrong" aria-pressed="false"></button></like-button-view-model></ytm-like-button-renderer></ytm-reel-video-renderer>' +
      '<ytm-reel-video-renderer is-active video-id="dQw4w9WgXcQ"><ytm-like-button-renderer>' +
      '<like-button-view-model><button id="a" aria-label="100 likes" aria-pressed="false"></button></like-button-view-model>' +
      '<dislike-button-view-model><button aria-label="Dislike" aria-pressed="false"></button></dislike-button-view-model>' +
      '</ytm-like-button-renderer></ytm-reel-video-renderer>';
    place();
    expect(G().likeButton().id).toBe('a'); // the Short on screen, not a neighbour in the feed

    // Older markup: both buttons directly in the renderer, dislike told apart by its label.
    document.body.innerHTML = '<ytm-like-button-renderer><button aria-label="Dislike this video"></button><button id="b" aria-label="like this video"></button></ytm-like-button-renderer>';
    place();
    expect(G().likeButton().id).toBe('b');

    // No known component at all: the label decides.
    document.body.innerHTML = '<div><button aria-label="Share"></button><button id="c" aria-label="1.2K likes"></button></div>';
    place();
    expect(G().likeButton().id).toBe('c');

    // Another language, unknown components: the first toggle button is the like button.
    document.body.innerHTML = '<div><button aria-label="Teilen"></button><button id="d" aria-label="Mag ich" aria-pressed="false"></button><button aria-label="Mag ich nicht" aria-pressed="false"></button></div>';
    place();
    expect(G().likeButton().id).toBe('d');

    document.body.innerHTML = '<div><button aria-label="Share"></button></div>';
    place();
    expect(G().likeButton()).toBeNull();
  });

  it('fullscreen falls back to the player API when YouTube’s button is not there', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    document.querySelector('.fullscreen-icon').remove();
    const toggleFullscreen = jest.fn();
    document.getElementById('movie_player').toggleFullscreen = toggleFullscreen;
    jest.advanceTimersByTime(500);
    touch('touchstart', video, 200, 200);
    touch('touchmove', video, 200, 150);
    touch('touchend', video, 200, 110);
    jest.advanceTimersByTime(300);
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('a video picked behind the miniplayer opens in the main page; the same one just expands', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    mountWatch().video.play();
    window.__bopbox.back();
    jest.advanceTimersByTime(400);
    const followed = [];
    document.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') { followed.push(e.target.href); e.preventDefault(); }
    });

    G().openFromFrame('/watch?v=dQw4w9WgXcQ&t=10');
    jest.advanceTimersByTime(400);
    expect(G().mode()).toBe('full');
    expect(followed).toEqual([]);

    window.__bopbox.back();
    jest.advanceTimersByTime(400);
    G().openFromFrame('https://localhost/watch?v=aaaaaaaaaaa');
    expect(followed).toEqual(['https://localhost/watch?v=aaaaaaaaaaa']);
    expect(G().mode()).toBe('full');
    expect(document.documentElement.classList.contains('bopbox-mini')).toBe(false);
  });

  it('holding the player plays at 2× until the finger lifts', () => {
    const posted = boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    video.play();
    video.playbackRate = 1.25;
    jest.advanceTimersByTime(500);
    touch('touchstart', video, 200, 120);
    jest.advanceTimersByTime(300);
    expect(video.playbackRate).toBe(1.25); // not yet: a tap must stay a tap
    jest.advanceTimersByTime(200);
    expect(video.playbackRate).toBe(2);
    expect(document.getElementById('bopbox-pill').classList.contains('on')).toBe(true);
    touch('touchend', video, 200, 120);
    expect(video.playbackRate).toBe(1.25);
    expect(document.getElementById('bopbox-pill').classList.contains('on')).toBe(false);
    expect(posted).toContainEqual({ t: 'haptic', k: 'light' });
    // The click that follows a long press must not toggle the player.
    const seen = jest.fn();
    video.addEventListener('click', seen);
    video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).not.toHaveBeenCalled();
  });

  it('a paused video is not sped up by a hold, and moving cancels the hold', () => {
    boot({ app: 'youtube', miniplayer: true, cosmetic: {} }, SCRIPTS);
    const { video } = mountWatch();
    jest.advanceTimersByTime(500);
    touch('touchstart', video, 200, 120);
    jest.advanceTimersByTime(600);
    expect(video.playbackRate).toBe(1);
    touch('touchend', video, 200, 120);

    video.play();
    touch('touchstart', video, 200, 120);
    touch('touchmove', video, 260, 122);
    jest.advanceTimersByTime(600);
    expect(video.playbackRate).toBe(1);
  });

  it('double tapping a Short likes it once, with a heart and a haptic', () => {
    const posted = boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    const { overlay, liked, video } = mountShort();
    video.play();
    const siteTap = jest.fn();
    overlay.addEventListener('click', siteTap);

    tap(overlay, 200, 400);
    jest.advanceTimersByTime(120);
    tap(overlay, 204, 398);
    expect(liked).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.bopbox-heart')).not.toBeNull();
    expect(posted).toContainEqual({ t: 'haptic', k: 'confirm' });
    jest.advanceTimersByTime(1000);
    expect(siteTap).not.toHaveBeenCalled(); // neither tap reached YouTube: playback never flickered
    expect(video.paused).toBe(false);
    expect(document.querySelector('.bopbox-heart')).toBeNull();
  });

  it('double tapping a Short that is already liked shows the heart but does not unlike it', () => {
    boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    const { overlay, liked } = mountShort({ liked: true });
    tap(overlay, 200, 400);
    tap(overlay, 200, 400);
    expect(liked).not.toHaveBeenCalled();
    expect(document.querySelector('.bopbox-heart')).not.toBeNull();
  });

  it('a single tap on a Short still reaches YouTube, a moment later', () => {
    boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    const { overlay, liked, video } = mountShort();
    video.play();
    const siteTap = jest.fn(() => video.pause());
    overlay.addEventListener('click', siteTap);
    tap(overlay, 200, 400);
    expect(siteTap).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(siteTap).toHaveBeenCalledTimes(1);
    expect(liked).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(video.paused).toBe(true); // toggled exactly once
  });

  it('a single tap pauses the Short itself if YouTube ignores the replayed tap', () => {
    boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    const { overlay, video } = mountShort();
    video.play();
    tap(overlay, 200, 400);
    jest.advanceTimersByTime(600);
    expect(video.paused).toBe(true);
  });

  it('taps on a Short’s own buttons are never delayed or swallowed', () => {
    boot({ app: 'youtube', cosmetic: {} }, SCRIPTS);
    const { like, liked } = mountShort();
    const e = tap(like, 360, 420);
    expect(liked).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });
});
