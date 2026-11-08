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
  delete window.__bopboxConfig;
  delete window.ytInitialPlayerResponse;
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
    document.body.innerHTML =
      '<div class="mobile-topbar-header-content"><ytm-topbar-menu-button-renderer><button aria-label="Search YouTube"></button></ytm-topbar-menu-button-renderer></div>';
    jest.advanceTimersByTime(900);
    const btn = document.getElementById('bopbox-settings');
    expect(btn).not.toBeNull();
    expect(btn.nextElementSibling.tagName.toLowerCase()).toBe('ytm-topbar-menu-button-renderer');
    btn.click();
    expect(posted).toContainEqual({ t: 'openSettings' });
    jest.advanceTimersByTime(900);
    expect(document.querySelectorAll('#bopbox-settings')).toHaveLength(1);
  });
});
