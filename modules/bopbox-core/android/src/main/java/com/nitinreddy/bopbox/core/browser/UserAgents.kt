package com.nitinreddy.bopbox.core.browser

import com.nitinreddy.bopbox.core.apps.SiteMode

/**
 * Builds user agents from the device's real WebView UA.
 *
 * Mobile: identical to Chrome for Android (drops the `; wv` marker and `Version/4.0`, which sites
 * use to degrade WebViews and Google uses to refuse sign-in).
 * Desktop: a Chrome-on-Windows UA with the same Chrome version, used for Spotify's web player.
 */
object UserAgents {
  private val chromeVersion = Regex("Chrome/([0-9.]+)")

  fun mobile(defaultUa: String): String =
    defaultUa
      .replace("; wv)", ")")
      .replace(Regex("\\s*Version/[0-9.]+"), "")
      .replace(Regex("\\s{2,}"), " ")
      .trim()

  fun desktop(defaultUa: String): String {
    val version = chromeVersion.find(defaultUa)?.groupValues?.get(1)?.let(::majorOnly) ?: "140.0.0.0"
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$version Safari/537.36"
  }

  fun forMode(mode: SiteMode, defaultUa: String): String =
    if (mode == SiteMode.DESKTOP) desktop(defaultUa) else mobile(defaultUa)

  /** Chrome's reduced UA reports only the major version: 131.0.6778.135 -> 131.0.0.0 */
  private fun majorOnly(v: String): String = v.substringBefore('.') + ".0.0.0"

  fun majorVersion(defaultUa: String): String =
    chromeVersion.find(defaultUa)?.groupValues?.get(1)?.substringBefore('.') ?: "140"
}
