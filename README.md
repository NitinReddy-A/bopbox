<p align="center">
  <img src="assets/icon.png" width="128" alt="Tube icon" />
</p>

<h1 align="center">Tube</h1>

<p align="center"><b>YouTube as a real Android app: no ads, no limits, plays in the background.</b></p>

---

Tube opens straight into YouTube's mobile site and adds the features people install patched
YouTube builds for. It is its own app (Expo + a Kotlin native module); it does not modify or
redistribute Google's YouTube APK.

| Feature | What it does |
|---|---|
| **No ads** | EasyList + EasyPrivacy (auto-updating), YouTube player-response pruning, auto-skip for anything that slips through, promo and upsell cards hidden |
| **Background play** | Keeps playing after you leave the app, with the screen off, or after you swipe it away |
| **Picture in picture** | Videos float when you go home |
| **Media controls** | Notification, lock screen, Bluetooth and headset buttons (Media3 `MediaSession`) |
| **SponsorBlock** | Skips sponsor reads, self-promos and subscribe nags |
| **Return YouTube Dislike** | Dislike counts back on the dislike button |
| **Playback speed** | A default speed for every video, up to 3× |
| **Video quality** | A default resolution, picking the best available at or below it |
| **Swipe controls** | In fullscreen, swipe the left side for brightness and the right side for volume |
| **Always repeat** | Loops every video |
| **Hide Shorts** | Removes Shorts shelves, cards and the Shorts tab |
| **Hide end screens** | Removes end-screen cards and info cards |
| **Open links** | YouTube links tapped or shared from other apps open in Tube |
| **Widgets** | Now Playing and Mini Player |

Settings live behind the sliders button Tube adds to YouTube's own top bar, in an iOS-style sheet
you can drag down to dismiss.

> Personal project, not affiliated with YouTube or Google. Ad blocking depends on how YouTube
> behaves this week; filter lists update automatically, the page script may need a tweak now and then.

## How it works

```
React Native shell (Expo Router, TypeScript)
  Stage: one YouTube BrowserView, edge to edge, never unmounted
  Settings sheet (Reanimated springs, Gesture Handler drag-to-dismiss)
        │  BopboxCore module API + events
modules/bopbox-core (Kotlin)
  BopboxWebView: request interception → FilterEngine, document-start scripts
    bridge.js  media session capture, background-play shims, command routing
    youtube.js ad pruning/skipping, SponsorBlock, dislikes, speed, quality, Shorts, settings button
  SwipeControlsLayout: fullscreen brightness/volume gestures
  PlaybackCoordinator → WebViewPlayer (Media3) → PlaybackService (MediaSession)
  PipController, widgets, incoming YouTube links
```

## Build

```bash
npm install
npm test               # app + injected page-script tests
npm run typecheck
npm run lint
npx eas-cli build -p android --profile preview     # signed APK
npx eas-cli build -p android --profile e2e         # same, with WebView debugging for e2e
node scripts/e2e/run-e2e.mjs path/to/tube-e2e.apk  # needs a running emulator or device
```

Kotlin unit tests: `cd android && ./gradlew :bopbox-core:testDebugUnitTest` after `npx expo prebuild -p android`.

## License

MIT, see [LICENSE](LICENSE). Bundled filter lists are © their authors (EasyList, dual GPLv3 / CC BY-SA).
