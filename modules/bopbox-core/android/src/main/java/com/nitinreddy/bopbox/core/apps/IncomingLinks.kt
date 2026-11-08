package com.nitinreddy.bopbox.core.apps

import com.nitinreddy.bopbox.core.util.UrlUtils

/**
 * Turns what other apps hand us (a tapped YouTube link, or "Share → Tube") into a URL the
 * YouTube WebView can open. Pure logic so it can be unit tested without an Intent.
 */
object IncomingLinks {
  private val urlInText = Regex("https?://\\S+")

  /**
   * @param action the intent action (`android.intent.action.VIEW` / `SEND`)
   * @param data the intent's data URI as a string, for VIEW
   * @param text `Intent.EXTRA_TEXT`, for SEND
   */
  fun resolve(action: String?, data: String?, text: String?): String? {
    val candidate = when (action) {
      "android.intent.action.VIEW" -> data
      "android.intent.action.SEND" -> text?.let { urlInText.find(it)?.value }
      else -> null
    } ?: return null
    val url = candidate.trim().trimEnd('.', ',', ')', ']')
    val scheme = UrlUtils.schemeOf(url)
    if (scheme != "https" && scheme != "http") return null
    return if (AppCatalog.forUrl(url) != null) url.replaceFirst("http://", "https://") else null
  }
}
