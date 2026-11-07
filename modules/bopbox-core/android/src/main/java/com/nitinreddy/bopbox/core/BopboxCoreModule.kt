package com.nitinreddy.bopbox.core

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import com.nitinreddy.bopbox.core.adblock.AdBlocker
import com.nitinreddy.bopbox.core.apps.AppCatalog
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

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  override fun definition() = ModuleDefinition {
    Name("BopboxCore")

    Events(EVENT_SETTINGS, EVENT_NOW_PLAYING, EVENT_STATS, EVENT_PIP)

    OnCreate {
      Bopbox.init(context)
      SettingsStore.addListener(settingsListener)
      PlaybackCoordinator.addListener(nowPlayingListener)
      AdBlocker.addListener(statsListener)
      PipController.addListener(pipListener)
    }

    OnDestroy {
      SettingsStore.removeListener(settingsListener)
      PlaybackCoordinator.removeListener(nowPlayingListener)
      AdBlocker.removeListener(statsListener)
      PipController.removeListener(pipListener)
    }

    OnActivityEntersForeground {
      WebViewPool.setBackground(false)
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
  }
}
