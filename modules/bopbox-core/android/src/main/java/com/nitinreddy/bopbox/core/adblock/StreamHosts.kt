package com.nitinreddy.bopbox.core.adblock

/**
 * Hosts that only ever serve the video stream, thumbnails and avatars. A playing video makes
 * hundreds of range requests to them, and every one used to be tokenised and run through the
 * filter engine while the WebView waited for the answer. No list blocks these hosts for YouTube
 * pages (ads come from the same stream hosts as the video, which is why they are removed from
 * the player response instead), so they skip the engine entirely.
 */
internal object StreamHosts {
  private val SUFFIXES = arrayOf("googlevideo.com", "ytimg.com", "ggpht.com")

  fun isStream(url: String): Boolean {
    val bounds = UrlHost.bounds(url)
    if (bounds < 0) return false
    val start = (bounds ushr 32).toInt()
    val end = bounds.toInt()
    for (suffix in SUFFIXES) {
      val at = end - suffix.length
      if (at < start || !url.regionMatches(at, suffix, 0, suffix.length, ignoreCase = true)) continue
      if (at == start || url[at - 1] == '.') return true
    }
    return false
  }
}
