package com.nitinreddy.bopbox.core.apps

import com.nitinreddy.bopbox.core.util.UrlUtils

/**
 * Turns what other apps hand us (a tapped YouTube link, or "Share → Tube") into a URL the
 * YouTube WebView can open. Pure logic so it can be unit tested without an Intent.
 */
object IncomingLinks {
  private val urlInText = Regex("https?://\\S+")

  /** Extra set on an Intent once its link has been opened. */
  const val EXTRA_HANDLED = "com.nitinreddy.bopbox.LINK_HANDLED"

  /** `Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`, kept here so this stays free of Android. */
  const val FLAG_LAUNCHED_FROM_HISTORY = 0x00100000

  /**
   * Whether an intent still carries a link to open. Android hands the same launch intent back
   * whenever the activity is recreated (with our mark on it, [EXTRA_HANDLED]) or reopened from
   * Recents after the process was killed (flagged as launched from history); in both cases its
   * link was opened long ago and must not pull the user back to it.
   */
  fun isNew(flags: Int, alreadyHandled: Boolean): Boolean =
    !alreadyHandled && (flags and FLAG_LAUNCHED_FROM_HISTORY) == 0

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
