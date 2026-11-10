package com.nitinreddy.bopbox.core.browser

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * React Native view that displays one app's pooled [BopboxWebView]. Destroying this view never
 * destroys the WebView: it is handed back to the pool so playback continues.
 */
class BrowserView(context: Context, appContext: AppContext) : ExpoView(context, appContext), BrowserHost {
  override val shouldUseAndroidLayout = true

  private val onNavigationStateChange by EventDispatcher()
  private val onFullscreenChange by EventDispatcher()
  private val onLoadError by EventDispatcher()
  private val onSwitchApp by EventDispatcher()

  private val container = FrameLayout(context).apply { setBackgroundColor(Color.BLACK) }
  private var appId: String? = null
  private var webView: BopboxWebView? = null
  private var fullscreenView: View? = null
  private var swipeLayer: SwipeControlsLayout? = null
  private var savedOrientation: Int? = null

  private val rebuildListener: (String) -> Unit = { id -> if (id == appId) { webView = null; appId = null; setAppId(id) } }

  init {
    addView(container, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    WebViewPool.addRebuildListener(rebuildListener)
  }

  private val activity: Activity? get() = appContext.currentActivity

  fun setAppId(id: String) {
    if (id == appId && webView != null) return
    webView?.let(::release)
    appId = id
    val wv = WebViewPool.obtain(activity ?: context, id)
    (wv.parent as? ViewGroup)?.removeView(wv)
    container.addView(wv, 0, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    wv.host = this
    webView = wv
    onNavState(wv.currentNavState())
  }

  private fun release(wv: BopboxWebView) {
    if (wv.host === this) wv.host = null
    if (wv.parent === container) container.removeView(wv)
  }

  fun dispose() {
    WebViewPool.removeRebuildListener(rebuildListener)
    onHideFullscreen()
    webView?.let {
      release(it)
      WebViewPool.detachFromActivity(it)
    }
    webView = null
  }

  // --- Commands from JS -----------------------------------------------------------------

  fun goBack() = webView?.takeIf { it.canGoBack() }?.goBack()

  /**
   * Android back. The page gets the first say (a playing video minimises instead of closing);
   * otherwise walk back through history, and at the start of it leave to the background so
   * playback continues. The app never finishes itself.
   */
  fun back() {
    val wv = webView
    if (wv == null) {
      activity?.moveTaskToBack(true)
      return
    }
    wv.askBack { answer ->
      when {
        answer == "handled" -> Unit
        answer == "none" && wv.canGoBack() -> wv.goBack()
        else -> activity?.moveTaskToBack(true)
      }
    }
  }
  fun goForward() = webView?.takeIf { it.canGoForward() }?.goForward()
  fun reload() = webView?.reload()
  fun goHome() = webView?.goHome()
  fun loadUrl(url: String) = webView?.let { wv -> if (wv.app.isInternal(url)) wv.loadUrl(url) }
  fun search(query: String) = webView?.search(query)
  fun exitFullscreen() = webView?.exitFullscreen()
  fun scrollToTop() = webView?.evaluateJavascript("window.scrollTo({top:0,behavior:'smooth'})", null)

  // --- BrowserHost ------------------------------------------------------------------------

  override fun onNavState(state: NavState) {
    onNavigationStateChange(state.toMap())
  }

  override fun onLoadError(url: String, description: String) {
    onLoadError(mapOf("url" to url, "description" to description))
  }

  override fun onSwitchApp(appId: String, url: String) {
    onSwitchApp(mapOf("appId" to appId, "url" to url))
  }

  override fun onShowFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
    if (fullscreenView != null) {
      callback.onCustomViewHidden()
      return
    }
    fullscreenView = view
    // The player sits inside a layer that turns vertical swipes into brightness and volume.
    val layer = SwipeControlsLayout(context) { activity }.apply {
      setBackgroundColor(Color.BLACK)
      addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    swipeLayer = layer
    container.addView(layer, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    activity?.let { a ->
      savedOrientation = a.requestedOrientation
      a.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      WindowCompat.getInsetsController(a.window, a.window.decorView).apply {
        systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        hide(WindowInsetsCompat.Type.systemBars())
      }
    }
    onFullscreenChange(mapOf("fullscreen" to true))
  }

  override fun onHideFullscreen() {
    val v = fullscreenView ?: return
    fullscreenView = null
    swipeLayer?.let { layer ->
      layer.restore()
      layer.removeView(v)
      container.removeView(layer)
    }
    swipeLayer = null
    activity?.let { a ->
      a.requestedOrientation = savedOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
      WindowCompat.getInsetsController(a.window, a.window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }
    savedOrientation = null
    onFullscreenChange(mapOf("fullscreen" to false))
  }
}
