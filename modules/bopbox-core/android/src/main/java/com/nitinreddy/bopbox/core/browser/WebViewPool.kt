package com.nitinreddy.bopbox.core.browser

import android.content.Context
import android.content.MutableContextWrapper
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebStorage
import com.nitinreddy.bopbox.core.adblock.AdBlocker
import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.media.MediaCommand
import com.nitinreddy.bopbox.core.media.PlaybackCoordinator
import com.nitinreddy.bopbox.core.settings.SettingsStore
import com.nitinreddy.bopbox.core.util.UrlUtils
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Owns one [BopboxWebView] per app for the life of the process. Screens borrow them; when the
 * activity goes away the views are re-pointed at the application context so playback continues.
 */
object WebViewPool {
  private val views = mutableMapOf<String, BopboxWebView>()
  private val main = Handler(Looper.getMainLooper())
  private val rebuildListeners = CopyOnWriteArraySet<(String) -> Unit>()
  private val uiListeners = CopyOnWriteArraySet<(String) -> Unit>()

  /** UI requests coming from inside a page, forwarded to the React Native shell. */
  const val UI_OPEN_SETTINGS = "openSettings"

  fun addUiListener(l: (String) -> Unit) { uiListeners += l }
  fun removeUiListener(l: (String) -> Unit) { uiListeners -= l }
  fun emitUi(event: String) { uiListeners.forEach { it(event) } }
  private lateinit var appContext: Context

  fun init(context: Context) {
    if (::appContext.isInitialized) return
    appContext = context.applicationContext
    SettingsStore.addListener { s -> main.post { views.values.forEach { it.applySettings(s) } } }
    // Cosmetic rules come from the filter engine, which finishes loading after the first pages.
    var engineReady = AdBlocker.isReady
    AdBlocker.addListener { stats ->
      if (stats.ready && !engineReady) {
        engineReady = true
        main.post { views.values.forEach { it.applySettings(SettingsStore.current) } }
      }
    }
  }

  /** Get (or lazily create) the WebView for [appId], bound to [context] (an Activity ideally). */
  fun obtain(context: Context, appId: String): BopboxWebView {
    check(Looper.myLooper() == Looper.getMainLooper()) { "WebViewPool must be used on the main thread" }
    init(context)
    val existing = views[appId]
    if (existing != null) {
      existing.setBaseContext(context)
      return existing
    }
    val app = AppCatalog.require(appId)
    val view = BopboxWebView(app, MutableContextWrapper(context))
    views[appId] = view
    return view
  }

  fun peek(appId: String): BopboxWebView? = views[appId]

  /** Run [block] on every live WebView (main thread). */
  fun forEach(block: (BopboxWebView) -> Unit) {
    views.values.toList().forEach(block)
  }

  /** Called when the hosting activity is destroyed: keep views alive on the application context. */
  fun detachFromActivity(view: BopboxWebView) {
    (view.parent as? ViewGroup)?.removeView(view)
    view.host = null
    if (::appContext.isInitialized) view.setBaseContext(appContext)
  }

  /** True while Bopbox is not in the foreground (backgrounded, screen off or shrunk into PiP). */
  @Volatile
  var inBackground: Boolean = false
    private set

  /** App currently on screen inside Bopbox (null on home/settings). Others count as background. */
  @Volatile
  var visibleAppId: String? = null
    private set

  fun setBackground(background: Boolean) {
    main.post {
      inBackground = background
      views.values.forEach { it.syncBackground() }
    }
  }

  fun setVisibleApp(appId: String?) {
    main.post {
      visibleAppId = appId
      views.values.forEach { it.syncBackground() }
    }
  }

  /** Whether [appId]'s page should be protected from pausing itself (not on screen). */
  fun isHidden(appId: String): Boolean = inBackground || visibleAppId != appId

  fun command(appId: String, cmd: MediaCommand, arg: Double? = null) {
    main.post { views[appId]?.command(cmd, arg) }
  }

  fun addRebuildListener(l: (String) -> Unit) { rebuildListeners += l }
  fun removeRebuildListener(l: (String) -> Unit) { rebuildListeners -= l }

  /** The renderer crashed or was killed: drop the dead view so the next obtain() recreates it. */
  fun onRendererGone(appId: String) {
    main.post {
      val dead = views.remove(appId) ?: return@post
      (dead.parent as? ViewGroup)?.removeView(dead)
      dead.host = null
      runCatching { dead.destroy() }
      PlaybackCoordinator.onAppGone(appId)
      rebuildListeners.forEach { it(appId) }
    }
  }

  /** Sign out of an app: wipe its cookies + storage and reload it. */
  fun clearAppData(appId: String, onDone: () -> Unit) {
    val app = AppCatalog.require(appId)
    val cookies = CookieManager.getInstance()
    val hosts = app.internalHosts.filterNot { h -> AppCatalog.all.any { it.id != appId && it.internalHosts.contains(h) } }
    for (host in hosts) {
      val url = "https://$host"
      cookies.getCookie(url)?.split(';')?.map { it.substringBefore('=').trim() }?.filter { it.isNotEmpty() }?.forEach { name ->
        cookies.setCookie(url, "$name=; Max-Age=0; Path=/")
        cookies.setCookie(url, "$name=; Max-Age=0; Path=/; Domain=.${UrlUtils.baseDomain(host)}")
      }
      WebStorage.getInstance().deleteOrigin(url)
    }
    cookies.flush()
    main.post {
      views[appId]?.apply {
        clearCache(true)
        clearHistory()
        goHome()
      }
      onDone()
    }
  }

  fun clearAllData(onDone: () -> Unit) {
    CookieManager.getInstance().removeAllCookies {
      WebStorage.getInstance().deleteAllData()
      main.post {
        views.values.forEach {
          it.clearCache(true)
          it.clearHistory()
          it.goHome()
        }
        onDone()
      }
    }
  }
}
