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
| **No ads** | Blocks the way Brave and uBlock Origin do: EasyList, EasyPrivacy and uBO's own lists (refreshed daily), including uBO's YouTube scriptlet rules that strip ads from player responses and Shorts feeds. Auto-skip for anything that slips through; promo and upsell cards hidden. Everything else on the page stays exactly as YouTube serves it |
| **Background play** | Keeps playing after you leave the app, with the screen off, or after you swipe it away |
| **Picture in picture** | Videos float when you go home |
| **Media controls** | Notification, lock screen, Bluetooth and headset buttons (Media3 `MediaSession`) |
| **SponsorBlock** | Skips sponsor reads, self-promos and subscribe nags |
| **Return YouTube Dislike** | Dislike counts back on the dislike button |
| **Playback speed** | A default speed for every video, up to 3× |
| **Video quality** | Videos and Shorts start at 1080p by default (or your choice) instead of YouTube's 240p ramp-up, picking the best available at or below it. On slow or metered connections the start is capped lower so the first frame is not held up |
| **Miniplayer** | Drag a video down (or press back while it plays) and it shrinks into a floating player while you keep browsing; tap to expand, drag to move, fling it away to close. Back on a paused video just goes back |
| **App gestures** | Swipe the player up for fullscreen, press and hold for 2× speed, double tap a Short to like it |
| **Swipe controls** | In fullscreen, swipe the left side for brightness and the right side for volume |
| **Always repeat** | Videos replay when they end (on by default); Shorts always loop |
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
    bridge.js     media session capture, background-play shims, command routing
    scriptlets.js uBO `##+js` rules for the page's host (set, json-prune, json-edit, ...)
    youtube.js    ad pruning/skipping, SponsorBlock, dislikes, speed, quality, replay, Shorts, settings button
    gestures.js   miniplayer, swipe to fullscreen, hold for 2×, double tap to like, Android back
  SwipeControlsLayout: fullscreen brightness/volume gestures
  PlaybackCoordinator → WebViewPlayer (Media3) → PlaybackService (MediaSession)
  PipController, widgets, incoming YouTube links
```

### Why it stays fast

Brave and uBlock Origin keep YouTube quick by doing almost nothing per request and per response;
ReVanced by changing the player rather than fighting it. Tube follows the same rules:

- **Stream requests skip the filter engine.** Ads come from the same `googlevideo.com` hosts as
  the video, so no list can block them there (that is why they are stripped from the player
  response instead). The hundreds of range requests a video makes, plus thumbnails and avatars,
  are passed straight through; a unit test fails if a list update ever makes that unsafe.
- **Responses are only parsed when they can contain an ad.** Each scriptlet rule knows which
  property names it needs; a cheap text check skips the parse, tree walk and re-serialise for the
  large watch and browse responses that carry no ads, and the page gets YouTube's own response.
- **One timer, asleep in the background.** Every periodic job runs off a single 250 ms tick, and
  the ones that only maintain the visible page stop while Tube is in the background.
- **Gestures run on the compositor.** The miniplayer is the real player moved with
  `transform`, never a second player or a reload; every touch listener is passive, so scrolling
  never waits on script. Browsing behind the miniplayer happens in a same-origin frame, and
  picking a video there goes through YouTube's own router.
- **YouTube starts loading before the React UI mounts**, and the WebView's renderer keeps foreground
  priority while playing in the background.

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

MIT, see [LICENSE](LICENSE). Bundled filter lists are © their authors: EasyList and EasyPrivacy
(dual GPLv3 / CC BY-SA) and uBlock Origin's uAssets lists (GPLv3). `scriptlets.js` is written
from uBO's documented scriptlet behaviour, not copied from its source.
