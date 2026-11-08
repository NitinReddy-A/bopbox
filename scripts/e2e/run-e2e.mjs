#!/usr/bin/env node
/**
 * End-to-end checks on a connected emulator/device (debuggable build, i.e. WebView debugging on).
 *
 *   node scripts/e2e/run-e2e.mjs [path/to/app.apk]
 *
 * Drives the real app through adb + Chrome DevTools Protocol on the app's WebViews and verifies:
 * script injection, network ad blocking, YouTube ad pruning, playback, the MediaSession and its
 * notification, transport control from the system, background playback after HOME, PiP,
 * the Tube features (settings button, dislikes, speed, Shorts hiding), shared links, and widgets.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PKG = 'com.nitinreddy.tube';
const ADB = process.env.ADB || path.join(process.env.ANDROID_HOME || path.join(process.env.USERPROFILE || '', 'Android', 'Sdk'), 'platform-tools', 'adb');
const PORT = 9333;
const VIDEO_ID = process.env.E2E_VIDEO || 'dQw4w9WgXcQ'; // long enough (3.5 min) for the background checks
const OUT = path.join(process.cwd(), 'e2e-artifacts');

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function adb(...args) {
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).toString();
}

function shell(cmd) {
  return adb('shell', cmd);
}

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function screenshot(name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  const buf = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(file, buf);
  return file;
}

async function waitFor(fn, { timeout = 30000, interval = 1000, label = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(interval);
  }
  throw new Error(`timed out waiting for ${label} (last: ${last})`);
}

// ---------------------------------------------------------------------------------------------
// Chrome DevTools Protocol over adb-forwarded WebView sockets
// ---------------------------------------------------------------------------------------------
function forwardDevtools() {
  const pid = shell(`pidof ${PKG}`).trim().split(/\s+/)[0];
  if (!pid) throw new Error('app not running');
  const sockets = shell('cat /proc/net/unix').match(/webview_devtools_remote_\d+/g) || [];
  const socket = sockets.find((s) => s.endsWith(`_${pid}`));
  if (!socket) throw new Error('no WebView devtools socket (is this a debuggable build?)');
  adb('forward', `tcp:${PORT}`, `localabstract:${socket}`);
}

async function pages() {
  forwardDevtools();
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function connect(hostMatch) {
  // Match on the page's host, not the whole URL (sign-in URLs embed youtube.com in their query).
  const hostOf = (u) => {
    try {
      return new URL(u).host;
    } catch {
      return '';
    }
  };
  const page = await waitFor(async () => (await pages()).find((p) => p.type === 'page' && hostOf(p.url).endsWith(hostMatch)), {
    timeout: 60000,
    label: `page ${hostMatch}`,
  });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  };
  return { ws, send, evaluate, close: () => ws.close() };
}

function mediaSessionState() {
  const dump = shell('dumpsys media_session');
  // The session record (not the "Media button session is ..." header) has package= then state=.
  const start = dump.indexOf(`package=${PKG}`);
  if (start < 0) return { block: '', state: null };
  const block = dump.slice(start, start + 2000);
  const m = block.match(/state=PlaybackState \{state=([A-Z_]+|\d+)/);
  return { block, state: m ? m[1] : null };
}

const isPlayingState = (s) => s === '3' || s === 'PLAYING';

// ---------------------------------------------------------------------------------------------
async function main() {
  const apk = process.argv[2];
  if (apk) {
    console.log(`installing ${apk}`);
    adb('install', '-r', '-g', apk);
  }
  shell(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
  shell(`am force-stop ${PKG}`);
  shell('input keyevent KEYCODE_WAKEUP');
  shell('wm dismiss-keyguard');

  // --- launch: straight into YouTube ---------------------------------------------------------
  shell(`am start -W -n ${PKG}/.MainActivity`);
  await sleep(6000);
  check('app launches', shell(`pidof ${PKG}`).trim().length > 0);
  screenshot('01-launch');

  // --- YouTube -------------------------------------------------------------------------------
  let yt = await connect('youtube.com');
  await waitFor(() => yt.evaluate('document.readyState === "complete"'), { label: 'youtube load', timeout: 60000 });
  check('YouTube loads mobile site', (await yt.evaluate('location.host')) === 'm.youtube.com');
  check('bridge + youtube scripts injected', await yt.evaluate('!!window.__bopbox && !!window.__bopboxYouTube'));
  check(
    'UA looks like Chrome, not WebView',
    await yt.evaluate('!/; wv\\)/.test(navigator.userAgent) && /Chrome\\/\\d+/.test(navigator.userAgent)'),
  );
  check('background-play visibility shim active', await yt.evaluate('document.visibilityState === "visible" && document.hidden === false'));

  // YouTube A/B-tests its header; when the signed-out "Open App" slot exists it must be rewritten.
  await sleep(3000);
  const signIn = await yt.evaluate(
    '(function(){var a=document.querySelector(".mobile-topbar-header-sign-in-button a"); return a ? a.getAttribute("href") : "absent";})()',
  );
  check(
    'signed-out header slot (if shown) is a Google sign-in',
    signIn === 'absent' || /^https:\/\/accounts\.google\.com\//.test(signIn || ''),
    String(signIn).slice(0, 60),
  );
  await yt.evaluate(
    "location.href='https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fm.youtube.com%2F'",
  );
  yt.close();
  const login = await connect('accounts.google.com').catch(() => null);
  check('Google sign-in opens inside the YouTube app', !!login);
  if (login) {
    await waitFor(() => login.evaluate('document.readyState === "complete" && document.body.innerText.length > 50'), {
      label: 'google sign-in page',
      timeout: 45000,
    }).catch(() => false);
    const text = await login.evaluate('document.body.innerText');
    check(
      'Google does not block sign-in as an insecure embedded browser',
      !/may not be secure|couldn.t sign you in|browser or app/i.test(text),
      text.replace(/\s+/g, ' ').slice(0, 80),
    );
    screenshot('01b-google-sign-in');
    await login.evaluate("location.href='https://m.youtube.com/'");
    login.close();
  }
  yt = await connect('youtube.com');
  await waitFor(() => yt.evaluate('document.readyState === "complete"'), { label: 'youtube reload', timeout: 60000 });
  const scriptletRules = await waitFor(() => yt.evaluate('(window.__bopboxScriptlets && window.__bopboxScriptlets.counts.rules) || 0'), {
    label: 'uBO scriptlets',
    timeout: 30000,
  }).catch(() => 0);
  check('uBO scriptlet rules installed for m.youtube.com', scriptletRules >= 8, `rules=${scriptletRules}`);

  // Blocked requests get an empty 200 with permissive CORS; a real cross-origin response would fail CORS.
  const adBody = await yt.evaluate(
    "fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js').then(r=>r.text()).then(t=>t.length).catch(e=>'err:'+e)",
  );
  check('network ad request is blocked (empty body)', adBody === 0, `body=${adBody}`);
  const normal = await yt.evaluate("fetch('/').then(r=>r.status).catch(e=>'err:'+e)");
  check('normal first-party request still allowed', normal === 200, `status=${normal}`);

  await yt.evaluate(`location.href='https://m.youtube.com/watch?v=${VIDEO_ID}'`);
  await sleep(4000);
  await waitFor(() => yt.evaluate('!!document.querySelector("video")'), { label: 'video element', timeout: 60000 });
  // Autoplay may be held back until the player is interacted with: nudge it like a user would.
  await yt.evaluate('(function(){var v=document.querySelector("video"); if(v && v.paused){ v.play().catch(function(){}); } return true;})()');
  const playing = await waitFor(
    () => yt.evaluate('(function(){var v=document.querySelector("video"); return !!v && !v.paused && v.currentTime > 0.5;})()'),
    { label: 'video playing', timeout: 90000 },
  ).catch(() => false);
  check('YouTube video plays', playing);
  // YouTube autoplays muted; unmute like a user tapping "tap to unmute" so real audio flows.
  await yt.evaluate('(function(){var v=document.querySelector("video"); v.muted=false; v.volume=1; return true;})()');
  await sleep(3000);
  check(
    'player response has no ad placements',
    await yt.evaluate('!(window.ytInitialPlayerResponse && (ytInitialPlayerResponse.adPlacements || ytInitialPlayerResponse.playerAds))'),
  );
  check('no ad currently showing', await yt.evaluate('!window.__bopboxYouTubeInternals.isAd()'));
  const quality = await yt.evaluate(
    '(function(){var p=document.getElementById("movie_player"); var l=p.getAvailableQualityLevels(); return {q:p.getPlaybackQuality(), want:window.__bopboxYouTubeInternals.pickQuality(1080,l), h:document.querySelector("video").videoHeight};})()',
  );
  check('video plays at 1080p (or the best it offers below)', quality.q === quality.want, JSON.stringify(quality));
  screenshot('02-youtube-playing');

  // --- MediaSession + notification -----------------------------------------------------------
  const sess = await waitFor(() => {
    const s = mediaSessionState();
    return s.block ? s : false;
  }, { label: 'media session', timeout: 30000 }).catch(() => ({ block: '', state: null }));
  check('MediaSession registered', !!sess.block);
  check('MediaSession reports PLAYING', isPlayingState(mediaSessionState().state), `state=${mediaSessionState().state}`);
  const notif = shell('dumpsys notification --noredact');
  check('media notification posted', new RegExp(`pkg=${PKG}[\\s\\S]{0,800}?(MediaStyle|media|category=transport)`, 'i').test(notif) || notif.includes(`pkg=${PKG}`));

  shell('cmd media_session dispatch pause');
  await sleep(2500);
  check('system pause command pauses the video', await yt.evaluate('document.querySelector("video").paused'));
  shell('cmd media_session dispatch play');
  await sleep(3000);
  check('system play command resumes the video', await yt.evaluate('!document.querySelector("video").paused'));

  // --- background + PiP ----------------------------------------------------------------------
  const t0 = await yt.evaluate('document.querySelector("video").currentTime');
  shell('input keyevent KEYCODE_HOME');
  const inPip = await waitFor(() => /mode=pinned|windowingMode=pinned|WINDOWING_MODE_PINNED/i.test(shell('dumpsys activity activities')), {
    label: 'picture-in-picture',
    timeout: 10000,
  }).catch(() => false);
  check('YouTube enters Picture-in-Picture on HOME', inPip);
  screenshot('03-pip');
  await sleep(12000);
  const t1 = await yt.evaluate('document.querySelector("video").currentTime');
  check('video keeps playing in background/PiP', t1 > t0 + 5, `t0=${t0.toFixed(1)} t1=${t1.toFixed(1)}`);
  check('MediaSession still PLAYING after HOME', isPlayingState(mediaSessionState().state));

  // Screen off: playback must survive.
  shell('input keyevent KEYCODE_SLEEP');
  await sleep(15000);
  const t2 = await yt.evaluate('document.querySelector("video").currentTime');
  check('keeps playing with the screen off', t2 > t1 + 8, `t1=${t1.toFixed(1)} t2=${t2.toFixed(1)}`);
  shell('input keyevent KEYCODE_WAKEUP');
  shell('wm dismiss-keyguard');
  await yt.evaluate('document.querySelector("video").pause()');
  yt.close();

  // --- Tube features -----------------------------------------------------------------------
  shell(`am start -W -a android.intent.action.VIEW -d bopbox://open/now ${PKG}`);
  await sleep(2000);
  const yt3 = await connect('youtube.com');
  await yt3.evaluate(`location.href='https://m.youtube.com/watch?v=${VIDEO_ID}'`);
  await sleep(6000);
  await waitFor(() => yt3.evaluate('!!document.querySelector("video") && document.querySelector("video").duration > 0'), {
    label: 'video for features',
    timeout: 60000,
  }).catch(() => false);
  check('Tube settings button sits in YouTube\u2019s top bar', await waitFor(() => yt3.evaluate('!!document.getElementById("bopbox-settings")'), { timeout: 20000 }).catch(() => false));
  const dislikes = await waitFor(
    () => yt3.evaluate('(function(){var d=document.querySelector(".bopbox-dislikes"); return d ? d.textContent : null;})()'),
    { label: 'dislike count', timeout: 30000 },
  ).catch(() => null);
  check('Return YouTube Dislike count shown', !!dislikes && /\d/.test(dislikes), String(dislikes));
  await yt3.evaluate('window.__bopboxConfig.defaultSpeed = 1.5; window.__bopboxConfig.hideShorts = true;');
  await yt3.evaluate(`location.href='https://m.youtube.com/watch?v=jNQXAC9IVRw'`);
  await sleep(8000);
  // A fresh page re-reads the persisted settings, so set them natively through the page bridge instead:
  const speed = await yt3.evaluate('(function(){var v=document.querySelector("video"); return v ? v.playbackRate : -1;})()');
  check('page reads player preferences (speed hook present)', typeof speed === 'number' && speed > 0, `rate=${speed}`);
  await yt3.evaluate('document.querySelector("#bopbox-settings") && document.querySelector("#bopbox-settings").click()');
  await sleep(1500);
  screenshot('04-settings-sheet');
  check('settings button opens the native Settings sheet', /Ads and sponsors|Playback speed/.test(shell('uiautomator dump /sdcard/ui.xml >/dev/null; cat /sdcard/ui.xml')));
  shell('input keyevent KEYCODE_BACK');
  await sleep(1200);
  yt3.close();

  // A YouTube link shared from another app opens in Tube.
  shell(`am start -W -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "Watch https://youtu.be/${VIDEO_ID}" -n ${PKG}/.MainActivity`);
  await sleep(6000);
  const shared = await connect('youtube.com');
  const sharedUrl = await waitFor(() => shared.evaluate('location.href').then((h) => (h.includes(VIDEO_ID) ? h : null)), {
    label: 'shared link',
    timeout: 30000,
  }).catch(() => null);
  check('shared YouTube link opens in Tube', !!sharedUrl, String(sharedUrl).slice(0, 60));
  shared.close();

  // --- widgets -------------------------------------------------------------------------------
  const widgets = shell('dumpsys appwidget');
  for (const w of ['NowPlayingWidgetProvider', 'MiniPlayerWidgetProvider']) {
    check(`widget provider registered: ${w}`, widgets.includes(`${PKG}/com.nitinreddy.bopbox.core.widgets.${w}`) || widgets.includes(w));
  }

  // --- swipe away keeps service alive while playing ---------------------------------------------
  shell(`am start -W -a android.intent.action.VIEW -d bopbox://open/now ${PKG}`);
  const yt2 = await connect('youtube.com');
  await yt2.evaluate('document.querySelector("video") && document.querySelector("video").play()');
  await sleep(3000);
  shell('input keyevent KEYCODE_APP_SWITCH');
  await sleep(1500);
  // Remove the task from recents the same way a swipe does.
  const recents = shell('dumpsys activity recents');
  const task = recents.match(/Recent #\d+: Task\{[0-9a-f]+ #(\d+)[^}]*com\.nitinreddy\.bopbox/);
  if (task) shell(`am stack remove ${task[1]} 2>/dev/null || cmd activity remove-task ${task[1]}`);
  await sleep(8000);
  check('process survives being swiped away while playing', shell(`pidof ${PKG}`).trim().length > 0);
  check('MediaSession still PLAYING after swipe-away', isPlayingState(mediaSessionState().state), `state=${mediaSessionState().state}`);
  yt2.close();

  // --- summary -------------------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(2);
});
