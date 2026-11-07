package com.nitinreddy.bopbox.core.adblock

/**
 * Infers a [ResourceType] for WebView requests, which carry no type information.
 *
 * Signals, strongest first: main-frame / sub-frame flags, a specific `Accept` header, URL path
 * heuristics (pings, API calls, media streams), then the file extension. Unknown requests are
 * [ResourceType.OTHER]; the engine only applies untyped rules or rules listing `$other` to those,
 * so a wrong "OTHER" guess cannot trigger a type-specific rule.
 */
object ResourceTypeGuesser {
  /**
   * @param url request URL
   * @param accept value of the request's `Accept` header, if any
   * @param isMainFrame true for top-level navigations
   * @param isForSubFrame true for iframe navigations
   */
  fun guess(url: String, accept: String?, isMainFrame: Boolean, isForSubFrame: Boolean = false): ResourceType {
    if (isMainFrame) return ResourceType.DOCUMENT
    if (isForSubFrame) return ResourceType.SUBDOCUMENT
    val lower = url.lowercase()
    if (lower.startsWith("ws:") || lower.startsWith("wss:")) return ResourceType.WEBSOCKET

    fromAccept(accept?.lowercase()?.trim())?.let { return it }

    val pathStart = lower.indexOf("://").let { if (it < 0) 0 else lower.indexOf('/', it + 3) }
    if (pathStart < 0) return ResourceType.OTHER
    val queryStart = lower.indexOfAny(charArrayOf('?', '#'), pathStart).let { if (it < 0) lower.length else it }
    val path = lower.substring(pathStart, queryStart)
    val query = lower.substring(queryStart)

    if (PING_MARKERS.any { path.contains(it) }) return ResourceType.PING
    if (MEDIA_MARKERS.any { path.contains(it) } || query.contains("mime=audio") || query.contains("mime=video")) {
      return ResourceType.MEDIA
    }
    fromExtension(path)?.let { return it }
    if (XHR_MARKERS.any { path.contains(it) } || query.contains("alt=json") || query.contains("format=json")) {
      return ResourceType.XHR
    }
    return ResourceType.OTHER
  }

  private fun fromAccept(a: String?): ResourceType? {
    if (a.isNullOrEmpty() || a.startsWith("*/*")) return null
    return when {
      a.startsWith("text/html") || a.startsWith("application/xhtml") -> ResourceType.SUBDOCUMENT
      a.startsWith("text/css") -> ResourceType.STYLESHEET
      a.startsWith("image/") -> ResourceType.IMAGE
      a.startsWith("video/") || a.startsWith("audio/") -> ResourceType.MEDIA
      a.startsWith("font/") || a.startsWith("application/font") -> ResourceType.FONT
      a.startsWith("application/json") || a.startsWith("text/event-stream") ||
        a.startsWith("application/x-protobuf") -> ResourceType.XHR
      a.contains("javascript") || a.contains("ecmascript") -> ResourceType.SCRIPT
      else -> null
    }
  }

  private fun fromExtension(path: String): ResourceType? {
    val lastSegment = path.substringAfterLast('/')
    val dot = lastSegment.lastIndexOf('.')
    if (dot < 0 || dot == lastSegment.length - 1) return null
    return EXTENSIONS[lastSegment.substring(dot + 1)]
  }

  private val EXTENSIONS: Map<String, ResourceType> = buildMap {
    listOf("js", "mjs", "cjs").forEach { put(it, ResourceType.SCRIPT) }
    put("css", ResourceType.STYLESHEET)
    listOf("png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif", "apng", "jfif")
      .forEach { put(it, ResourceType.IMAGE) }
    listOf("woff", "woff2", "ttf", "otf", "eot").forEach { put(it, ResourceType.FONT) }
    listOf("mp4", "webm", "m3u8", "mpd", "mp3", "m4a", "m4s", "m4v", "aac", "ogg", "oga", "ogv", "opus", "wav", "flac", "mov")
      .forEach { put(it, ResourceType.MEDIA) }
    put("json", ResourceType.XHR)
  }

  private val PING_MARKERS = listOf(
    "generate_204", "gen_204", "csi_204", "/ptracking", "/log_event", "/log_interaction", "/api/stats/",
    "/beacon", "/pixel", "/g/collect", "/j/collect", "/r/collect", "/ping/", "/jserror",
    "/gabo-receiver-service/",
  )

  private val MEDIA_MARKERS = listOf("/videoplayback", "/audio/")

  private val XHR_MARKERS = listOf("/xhr", "/api/", "/youtubei/", "/graphql", "/ajax", "/rpc/", "/rest/")
}
