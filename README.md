<p align="center">
  <img src="assets/icon.png" width="128" alt="Bopbox icon" />
</p>

<h1 align="center">Bopbox</h1>

<p align="center"><b>YouTube + Spotify in one Android app. Ads get yeeted. Music keeps bopping when you leave.</b></p>

---

Bopbox is a personal Android app that wraps the **YouTube mobile site** and the **Spotify web player**
as two "apps" inside a single APK, and bolts on the stuff a real music app has:

| | |
|---|---|
| 🚫 **Ad blocking** | EasyList + EasyPrivacy + hand-tuned rules (network blocking in Kotlin), YouTube player-response pruning and ad auto-skip, Spotify audio-ad mute & skip, cosmetic hiding of promos / upsells / "get the app" nags |
| 🎧 **Background play** | Keeps playing with the screen off, after you leave the app, or after you swipe it away |
| 🔔 **Media controls** | Media3 `MediaSession`: notification, lock screen, Bluetooth / headset buttons, audio focus, "headphones unplugged" pause |
| 📺 **Picture-in-Picture** | YouTube videos float when you head home (Android 12+ auto-enter) |
| 🧩 **3 widgets** | Now Playing (art + controls), Mini player, Quick Access (YouTube / Spotify / search / home) |
| ⏭️ **SponsorBlock** | Skips sponsor reads and "smash that subscribe" segments (toggleable) |
| 🍪 **Stays logged in** | Persistent cookies; per-app sign-out and "nuke everything" in settings |
| 🌗 **Themes** | Dark / light / system, neon "late-night radio" vibe |

> Personal project, not affiliated with YouTube, Google or Spotify. Ad blocking depends on how those
> services behave this week — it is very good, not magic. Use your own accounts responsibly.

## How it works

```
┌──────────────── React Native shell (Expo Router, TypeScript) ────────────────┐
│ Home · App chrome · Settings · back/deep-link logic · hooks over native state │
└──────────────┬───────────────────────────────────────────────┬───────────────┘
               │ <BrowserView appId>                            │ BopboxCore module API + events
┌──────────────▼────────────── modules/bopbox-core (Kotlin) ────▼───────────────┐
│ WebViewPool ── one long-lived WebView per app (survives screens & activity)    │
│   ├─ shouldInterceptRequest → AdBlocker → FilterEngine (EasyList/EasyPrivacy)  │
│   ├─ document-start scripts: bridge.js + youtube.js / spotify.js               │
│   └─ WebMessageListener (origin-locked) ← media state from the page            │
│ PlaybackCoordinator ── one app audible at a time, audio focus, noisy receiver  │
│   ├─ WebViewPlayer (Media3 SimpleBasePlayer) → PlaybackService (MediaSession)  │
│   └─ WidgetUpdater → 3 home-screen widgets                                     │
│ PipController ── auto Picture-in-Picture for YouTube                           │
└────────────────────────────────────────────────────────────────────────────────┘
```

The two WebViews are never unmounted: switching screens only changes which one is visible, and
when the activity goes away the pool re-points them at the application context, while the
foreground media service keeps the process alive. That's the whole background-play trick.

## Project layout

```
src/                      React Native app (Expo Router routes in src/app)
modules/bopbox-core/      Local Expo module
  android/src/main/java/… Kotlin: adblock/, browser/, media/, pip/, widgets/, settings/
  android/src/main/assets/bopbox/
    bridge.js youtube.js spotify.js   injected page scripts
    filters/                          bundled filter lists (auto-updated on device)
  android/src/test/…      JVM unit tests (JUnit)
  __tests__/              jsdom tests for the injected scripts
plugins/withBopbox.js     Config plugin (PiP, singleTask, cleartext off)
scripts/                  icon generator, e2e helpers
```

## Build it

Prereqs: Node 20+, an Expo account (for cloud builds) or the Android SDK + JDK 17+ (for local builds).

```bash
npm install
npm test                 # JS + injected-script tests
npm run typecheck
```

**Cloud APK (EAS):**

```bash
npx eas-cli build -p android --profile preview
```

**Local APK:**

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew :bopbox-core:testDebugUnitTest assembleRelease
```

The APK lands in `android/app/build/outputs/apk/release/`. Sideload it, allow notifications, add a
widget, put on a playlist, lock the phone. Bop.

## Known limits

- Spotify's web player needs Widevine DRM on the device (virtually every real phone has it) and
  officially targets desktops, so Bopbox loads it in desktop mode with a phone-friendly zoom.
- Google may occasionally refuse sign-in inside embedded browsers; if it does, retry from
  YouTube's own "Sign in" button or sign in to Spotify with email/password.
- YouTube and Spotify change their ad delivery regularly. Filter lists auto-update every few days;
  the site scripts may need a tweak now and then.

## License

MIT — see [LICENSE](LICENSE). Bundled filter lists are © their authors (EasyList, dual GPLv3 / CC BY-SA).
