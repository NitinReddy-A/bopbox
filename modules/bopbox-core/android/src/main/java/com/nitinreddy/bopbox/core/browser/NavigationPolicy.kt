package com.nitinreddy.bopbox.core.browser

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.AppSpec
import com.nitinreddy.bopbox.core.util.UrlUtils
import java.net.URLDecoder

/** What to do with a main-frame navigation. Pure logic so it can be unit tested. */
sealed interface NavDecision {
  /** Let the WebView load it. */
  data object Inside : NavDecision

  /** Load a different URL in this WebView instead (e.g. an intent:// fallback). */
  data class Redirect(val url: String) : NavDecision

  /** It belongs to another Bopbox app. */
  data class SwitchApp(val appId: String, val url: String) : NavDecision

  /** Hand it to the system (browser, mail, dialer...). */
  data class External(val url: String) : NavDecision

  /** Swallow it (store links, "open in app" nags). */
  data object Block : NavDecision
}

object NavigationPolicy {
  /** Schemes that only exist to bounce users into the official apps / stores. */
  private val nagSchemes = setOf("vnd.youtube", "youtube", "spotify", "market", "android-app", "fb", "fbapi")
  private val externalSchemes = setOf("mailto", "tel", "sms", "geo")

  fun decide(app: AppSpec, url: String, isMainFrame: Boolean): NavDecision {
    if (!isMainFrame) return NavDecision.Inside
    val scheme = UrlUtils.schemeOf(url) ?: return NavDecision.Block
    return when {
      scheme == "http" || scheme == "https" -> decideWeb(app, url)
      scheme == "intent" -> intentFallback(url)?.let { fallback ->
        when (val d = decideWeb(app, fallback)) {
          NavDecision.Inside -> NavDecision.Redirect(fallback)
          else -> d
        }
      } ?: NavDecision.Block
      scheme in nagSchemes -> NavDecision.Block
      scheme in externalSchemes -> NavDecision.External(url)
      scheme == "about" || scheme == "data" || scheme == "blob" -> NavDecision.Inside
      else -> NavDecision.Block
    }
  }

  private fun decideWeb(app: AppSpec, url: String): NavDecision {
    if (app.isInternal(url)) return NavDecision.Inside
    val owner = AppCatalog.forUrl(url)
    if (owner != null && owner.id != app.id) return NavDecision.SwitchApp(owner.id, url)
    return NavDecision.External(url)
  }

  /** Extract `S.browser_fallback_url` from an intent:// URI without android.content.Intent. */
  fun intentFallback(intentUri: String): String? {
    val extras = intentUri.substringAfter("#Intent;", "")
    if (extras.isEmpty()) return null
    val raw = extras.split(';').firstOrNull { it.startsWith("S.browser_fallback_url=") }
      ?.substringAfter('=') ?: return null
    val decoded = try { URLDecoder.decode(raw, "UTF-8") } catch (_: Exception) { return null }
    val scheme = UrlUtils.schemeOf(decoded)
    return decoded.takeIf { scheme == "https" || scheme == "http" }
  }
}
