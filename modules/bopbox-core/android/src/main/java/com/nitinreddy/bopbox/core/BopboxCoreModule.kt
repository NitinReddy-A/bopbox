package com.nitinreddy.bopbox.core

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import com.nitinreddy.bopbox.core.adblock.AdBlocker
import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.IncomingLinks
import com.nitinreddy.bopbox.core.browser.BrowserView
import com.nitinreddy.bopbox.core.browser.WebViewPool
import com.nitinreddy.bopbox.core.media.MediaCommand
import com.nitinreddy.bopbox.core.media.NowPlaying
import com.nitinreddy.bopbox.core.media.PlaybackCoordinator
import com.nitinreddy.bopbox.core.pip.PipController
import com.nitinreddy.bopbox.core.settings.Settings
import com.nitinreddy.bopbox.core.settings.SettingsStore
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Process-wide bootstrap shared by the module, the media service and widgets. */
object Bopbox {
  @Synchronized
  fun init(context: Context) {
    SettingsStore.init(context)
    AdBlocker.init(context, SettingsStore.current.filterAutoUpdate)
    PlaybackCoordinator.init(context)
    WebViewPool.init(context)
  }
}

/** JS-facing API. See modules/bopbox-core/src/BopboxCore.ts for the typed surface. */
class BopboxCoreModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  private val settingsListener: (Settings) -> Unit = { s -> sendEvent(EVENT_SETTINGS, s.toMap()) }
  private val nowPlayingListener: (NowPlaying?) -> Unit = { np -> sendEvent(EVENT_NOW_PLAYING, mapOf("nowPlaying" to np?.toMap())) }
  private val statsListener: (AdBlocker.Stats) -> Unit = { s -> sendEvent(EVENT_STATS, s.toMap()) }
  private val pipListener: (Boolean) -> Unit = { inPip -> sendEvent(EVENT_PIP, mapOf("inPip" to inPip)) }
  private val uiListener: (String) -> Unit = { event ->
    if (event == WebViewPool.UI_OPEN_SETTINGS) sendEvent(EVENT_OPEN_SETTINGS, emptyMap<String, Any>())
  }

  /** A YouTube link another app sent us before JS was ready to receive the event. */
  @Volatile private var pendingUrl: String? = null
  private var handledLaunchIntent: Intent? = null

  private fun handleIntent(intent: Intent?) {
    val url = intent?.let { IncomingLinks.resolve(it.action, it.dataString, it.getStringExtra(Intent.EXTRA_TEXT)) } ?: return
    pendingUrl = url
    sendEvent(EVENT_OPEN_URL, mapOf("url" to url))
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  override fun definition() = ModuleDefinition {
    Name("BopboxCore")

    Events(EVENT_SETTINGS, EVENT_NOW_PLAYING, EVENT_STATS, EVENT_PIP, EVENT_OPEN_SETTINGS, EVENT_OPEN_URL)

    OnCreate {
      Bopbox.init(context)
      SettingsStore.addListener(settingsListener)
      PlaybackCoordinator.addListener(nowPlayingListener)
      AdBlocker.addListener(statsListener)
      PipController.addListener(pipListener)
      WebViewPool.addUiListener(uiListener)
      // Start loading YouTube now, in parallel with the JS bundle, instead of when the first
      // React render mounts the view (which then just picks this WebView up from the pool).
      appContext.currentActivity?.let { activity ->
        main.post { runCatching { WebViewPool.obtain(activity, AppCatalog.YOUTUBE.id) } }
      }
    }

    OnDestroy {
      SettingsStore.removeListener(settingsListener)
      PlaybackCoordinator.removeListener(nowPlayingListener)
      AdBlocker.removeListener(statsListener)
      PipController.removeListener(pipListener)
      WebViewPool.removeUiListener(uiListener)
    }

    OnNewIntent { intent -> handleIntent(intent) }

    OnActivityEntersForeground {
      WebViewPool.setBackground(false)
      appContext.currentActivity?.intent?.let { launch ->
        // The intent that cold-started us arrives before JS listens; keep it for consumeLaunchUrl.
        if (launch !== handledLaunchIntent) {
          handledLaunchIntent = launch
          handleIntent(launch)
        }
      }
      (appContext.currentActivity as? ComponentActivity)?.let { activity ->
        main.post { PipController.attach(activity) }
      }
    }

    OnActivityEntersBackground {
      WebViewPool.setBackground(true)
    }

    Function("getApps") {
      AppCatalog.all.map { mapOf("id" to it.id, "name" to it.displayName, "homeUrl" to it.homeUrl) }
    }

    Function("getSettings") { SettingsStore.current.toMap() }

    Function("consumeLaunchUrl") {
      val url = pendingUrl
      pendingUrl = null
      url
    }

    Function("updateSettings") { patch: Map<String, Any?> -> SettingsStore.update(patch).toMap() }

    Function("getNowPlaying") { PlaybackCoordinator.current?.toMap() }

    Function("control") { command: String, arg: Double? ->
      val cmd = MediaCommand.from(command)
      main.post { PlaybackCoordinator.command(cmd, arg) }
    }

    Function("getAdblockStats") { AdBlocker.stats().toMap() }

    AsyncFunction("updateFilters") { promise: Promise ->
      AdBlocker.updateNow { stats -> promise.resolve(stats.toMap()) }
    }

    AsyncFunction("clearAppData") { appId: String, promise: Promise ->
      AppCatalog.require(appId)
      main.post { WebViewPool.clearAppData(appId) { promise.resolve(null) } }
    }

    AsyncFunction("clearAllData") { promise: Promise ->
      main.post { WebViewPool.clearAllData { promise.resolve(null) } }
    }

    Function("setVisibleApp") { appId: String? ->
      main.post { PipController.visibleAppId = appId }
      WebViewPool.setVisibleApp(appId)
    }

    Function("enterPip") {
      main.post { PipController.enter() }
    }

    Function("isInPip") { PipController.isInPip }

    Function("moveToBackground") {
      appContext.currentActivity?.let { a -> main.post { a.moveTaskToBack(true) } }
    }

    View(BrowserView::class) {
      Events("onNavigationStateChange", "onFullscreenChange", "onLoadError", "onSwitchApp")

      Prop("appId") { view: BrowserView, appId: String -> view.setAppId(appId) }

      AsyncFunction("goBack") { view: BrowserView -> view.goBack() }
      AsyncFunction("back") { view: BrowserView -> view.back() }
      AsyncFunction("goForward") { view: BrowserView -> view.goForward() }
      AsyncFunction("reload") { view: BrowserView -> view.reload() }
      AsyncFunction("goHome") { view: BrowserView -> view.goHome() }
      AsyncFunction("loadUrl") { view: BrowserView, url: String -> view.loadUrl(url) }
      AsyncFunction("search") { view: BrowserView, query: String -> view.search(query) }
      AsyncFunction("exitFullscreen") { view: BrowserView -> view.exitFullscreen() }
      AsyncFunction("scrollToTop") { view: BrowserView -> view.scrollToTop() }

      OnViewDestroys { view: BrowserView -> view.dispose() }
    }
  }

  companion object {
    const val EVENT_SETTINGS = "onSettingsChanged"
    const val EVENT_NOW_PLAYING = "onNowPlayingChanged"
    const val EVENT_STATS = "onAdblockStatsChanged"
    const val EVENT_PIP = "onPipModeChanged"
    const val EVENT_OPEN_SETTINGS = "onOpenSettings"
    const val EVENT_OPEN_URL = "onOpenUrl"
  }
}
