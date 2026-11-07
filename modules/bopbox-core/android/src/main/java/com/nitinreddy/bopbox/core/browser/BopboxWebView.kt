package com.nitinreddy.bopbox.core.browser

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Bitmap
import android.net.Uri
import android.os.Message
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ScriptHandler
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.nitinreddy.bopbox.core.BuildConfig
import com.nitinreddy.bopbox.core.adblock.AdBlocker
import com.nitinreddy.bopbox.core.apps.AppSpec
import com.nitinreddy.bopbox.core.apps.SiteMode
import com.nitinreddy.bopbox.core.media.BridgeMessage
import com.nitinreddy.bopbox.core.media.BridgeProtocol
import com.nitinreddy.bopbox.core.media.MediaCommand
import com.nitinreddy.bopbox.core.media.PlaybackCoordinator
import com.nitinreddy.bopbox.core.settings.Settings
import com.nitinreddy.bopbox.core.settings.SettingsStore
import com.nitinreddy.bopbox.core.util.UrlUtils

/** Navigation snapshot forwarded to the React Native toolbar. */
data class NavState(
  val url: String,
  val title: String,
  val canGoBack: Boolean,
  val canGoForward: Boolean,
  val loading: Boolean,
  val progress: Int,
) {
  fun toMap(): Map<String, Any> = mapOf(
    "url" to url,
    "title" to title,
    "canGoBack" to canGoBack,
    "canGoForward" to canGoForward,
    "loading" to loading,
    "progress" to progress,
  )
}

/** Callbacks for whichever BrowserView currently hosts this WebView. */
interface BrowserHost {
  fun onNavState(state: NavState)
  fun onShowFullscreen(view: View, callback: WebChromeClient.CustomViewCallback)
  fun onHideFullscreen()
  fun onLoadError(url: String, description: String)
  fun onSwitchApp(appId: String, url: String)
}

/**
 * One long-lived WebView per Bopbox app. It survives screen changes and activity recreation
 * (owned by [WebViewPool]) and keeps media playing while the app is in the background.
 */
@SuppressLint("SetJavaScriptEnabled", "ViewConstructor")
class BopboxWebView(
  val app: AppSpec,
  private val contextWrapper: MutableContextWrapper,
) : WebView(contextWrapper) {
  var host: BrowserHost? = null
  @Volatile private var pageUrl: String? = null
  private var progress = 0
  private var loading = false
  private var scriptHandler: ScriptHandler? = null
  private var appliedMode: SiteMode? = null
  private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
  private val defaultUa: String = WebSettings.getDefaultUserAgent(context)
  /** Used only on old WebViews without document-start script support. */
  private var fallbackScript: String? = null

  init {
    configureSettings(SettingsStore.current)
    CookieManager.getInstance().apply {
      setAcceptCookie(true)
      setAcceptThirdPartyCookies(this@BopboxWebView, true)
    }
    if (BuildConfig.DEBUG || BuildConfig.WEBVIEW_DEBUG) setWebContentsDebuggingEnabled(true)
    webViewClient = Client()
    webChromeClient = Chrome()
    installBridge()
    installScripts(SettingsStore.current)
    setBackgroundColor(0xFF0B0B12.toInt())
    loadUrl(app.homeUrl)
  }

  fun setBaseContext(ctx: Context) {
    if (contextWrapper.baseContext !== ctx) contextWrapper.baseContext = ctx
  }

  // --- Background playback ----------------------------------------------------------------

  /**
   * Chromium pauses/hides pages when the window is not visible. While background play is on we
   * report the window as visible so audio keeps going after the user leaves the app.
   */
  override fun onWindowVisibilityChanged(visibility: Int) {
    if (SettingsStore.current.backgroundPlay && visibility != View.VISIBLE) {
      super.onWindowVisibilityChanged(View.VISIBLE)
    } else {
      super.onWindowVisibilityChanged(visibility)
    }
  }

  // --- Settings ---------------------------------------------------------------------------

  fun applySettings(settings: Settings) {
    val modeChanged = appliedMode != settings.modeFor(app.id)
    configureSettings(settings)
    installScripts(settings)
    if (modeChanged) reload()
  }

  private fun configureSettings(settings: Settings) {
    val mode = settings.modeFor(app.id)
    appliedMode = mode
    this.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      javaScriptCanOpenWindowsAutomatically = false
      setSupportMultipleWindows(false)
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      allowFileAccess = false
      allowContentAccess = false
      userAgentString = UserAgents.forMode(mode, defaultUa)
      useWideViewPort = true
      loadWithOverviewMode = mode == SiteMode.DESKTOP
      setSupportZoom(mode == SiteMode.DESKTOP)
      builtInZoomControls = mode == SiteMode.DESKTOP
      displayZoomControls = false
      textZoom = 100
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
      WebSettingsCompat.setRequestedWithHeaderOriginAllowList(this.settings, emptySet())
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
      val major = UserAgents.majorVersion(defaultUa)
      val desktop = mode == SiteMode.DESKTOP
      val brands = listOf(
        UserAgentMetadata.BrandVersion.Builder().setBrand("Chromium").setMajorVersion(major).setFullVersion("$major.0.0.0").build(),
        UserAgentMetadata.BrandVersion.Builder().setBrand("Google Chrome").setMajorVersion(major).setFullVersion("$major.0.0.0").build(),
        UserAgentMetadata.BrandVersion.Builder().setBrand("Not)A;Brand").setMajorVersion("99").setFullVersion("99.0.0.0").build(),
      )
      val base = WebSettingsCompat.getUserAgentMetadata(this.settings)
      WebSettingsCompat.setUserAgentMetadata(
        this.settings,
        UserAgentMetadata.Builder(base)
          .setBrandVersionList(brands)
          .setMobile(!desktop)
          .setPlatform(if (desktop) "Windows" else "Android")
          .setPlatformVersion(if (desktop) "10.0.0" else base.platformVersion ?: "15.0.0")
          .build(),
      )
    }
  }

  // --- Script injection + bridge --------------------------------------------------------

  private fun installScripts(settings: Settings) {
    val origins = PageScripts.originsFor(app)
    val cosmetic = origins.associate { o -> val h = o.removePrefix("https://"); h to AdBlocker.cosmeticSelectors(h) }
    val script = PageScripts.build(app, settings, cosmetic) { name ->
      context.assets.open("bopbox/$name").bufferedReader().use { it.readText() }
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      scriptHandler?.remove()
      scriptHandler = WebViewCompat.addDocumentStartJavaScript(this, script, origins)
    } else {
      fallbackScript = script
    }
  }

  private fun installBridge() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      Log.w(TAG, "WebMessageListener unsupported; media controls disabled")
      return
    }
    WebViewCompat.addWebMessageListener(this, "BopboxBridge", PageScripts.originsFor(app)) {
        _: WebView, message: WebMessageCompat, _: Uri, isMainFrame: Boolean, _: JavaScriptReplyProxy ->
      if (!isMainFrame) return@addWebMessageListener
      val data = message.data ?: return@addWebMessageListener
      when (val msg = BridgeProtocol.parse(app.id, data, System.currentTimeMillis())) {
        is BridgeMessage.Media -> PlaybackCoordinator.onPageState(msg.state)
        is BridgeMessage.Blocked -> AdBlocker.recordBlocked(msg.count)
        is BridgeMessage.Log -> if (BuildConfig.DEBUG) Log.d(TAG, "[${app.id}] ${msg.text}")
        null -> Unit
      }
    }
  }

  /** Send a media command to the page. Safe to call from the main thread only. */
  fun command(cmd: MediaCommand, arg: Double? = null) {
    evaluateJavascript(PageScripts.command(cmd.js, arg), null)
  }

  fun setPictureInPicture(enabled: Boolean) {
    evaluateJavascript(PageScripts.command("pip", if (enabled) 1.0 else 0.0), null)
  }

  // --- Navigation helpers -------------------------------------------------------------------

  fun goHome() = loadUrl(app.homeUrl)

  fun search(query: String) {
    val url = UrlUtils.asUrlOrNull(query)?.takeIf { app.isInternal(it) } ?: app.searchUrl(query)
    loadUrl(url)
  }

  fun exitFullscreen() {
    val cb = fullscreenCallback ?: return
    fullscreenCallback = null
    cb.onCustomViewHidden()
    host?.onHideFullscreen()
  }

  val isFullscreen: Boolean get() = fullscreenCallback != null

  fun currentNavState(): NavState = NavState(
    url = url ?: pageUrl ?: app.homeUrl,
    title = title ?: app.displayName,
    canGoBack = canGoBack(),
    canGoForward = canGoForward(),
    loading = loading,
    progress = progress,
  )

  private fun emitNav() {
    host?.onNavState(currentNavState())
  }

  // --- Clients ----------------------------------------------------------------------------

  private inner class Client : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      if (!SettingsStore.current.adblockFor(app.id)) return null
      return AdBlocker.intercept(request, pageUrl)
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      return when (val d = NavigationPolicy.decide(app, request.url.toString(), request.isForMainFrame)) {
        NavDecision.Inside -> false
        is NavDecision.Redirect -> { view.loadUrl(d.url); true }
        is NavDecision.SwitchApp -> { host?.onSwitchApp(d.appId, d.url); true }
        is NavDecision.External -> { openExternal(d.url); true }
        NavDecision.Block -> true
      }
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      pageUrl = url
      loading = true
      fallbackScript?.let { view.evaluateJavascript(it, null) }
      emitNav()
    }

    override fun onPageFinished(view: WebView, url: String) {
      loading = false
      CookieManager.getInstance().flush()
      emitNav()
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
      pageUrl = url
      emitNav()
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
      if (request.isForMainFrame) host?.onLoadError(request.url.toString(), error.description?.toString() ?: "Load failed")
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      Log.e(TAG, "renderer gone for ${app.id} (crash=${detail.didCrash()})")
      WebViewPool.onRendererGone(app.id)
      return true
    }
  }

  private inner class Chrome : WebChromeClient() {
    override fun onProgressChanged(view: WebView, newProgress: Int) {
      progress = newProgress
      emitNav()
    }

    override fun onReceivedTitle(view: WebView, title: String?) = emitNav()

    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
      fullscreenCallback = callback
      val h = host
      if (h == null) callback.onCustomViewHidden() else h.onShowFullscreen(view, callback)
    }

    override fun onHideCustomView() {
      fullscreenCallback = null
      host?.onHideFullscreen()
    }

    override fun onPermissionRequest(request: PermissionRequest) {
      val origin = request.origin?.toString().orEmpty()
      val drm = PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID
      if (app.needsDrm && app.isInternal(origin) && request.resources.contains(drm)) {
        request.grant(arrayOf(drm))
      } else {
        request.deny()
      }
    }

    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message?) = false

    override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
      if (BuildConfig.DEBUG && consoleMessage.message().startsWith("[bopbox]")) Log.d(TAG, consoleMessage.message())
      return true
    }
  }

  private fun openExternal(url: String) {
    try {
      val intent = Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    } catch (t: Throwable) {
      Log.w(TAG, "no handler for $url", t)
    }
  }

  companion object {
    private const val TAG = "BopboxWebView"
  }
}
