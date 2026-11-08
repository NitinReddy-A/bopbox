package com.nitinreddy.bopbox.core.media

import org.json.JSONObject

/** Snapshot of what one app's web page is playing, as reported by bridge.js. */
data class NowPlaying(
  val appId: String,
  val title: String = "",
  val artist: String = "",
  val album: String = "",
  val artworkUrl: String? = null,
  val isPlaying: Boolean = false,
  val positionMs: Long = 0,
  val durationMs: Long = 0,
  val hasVideo: Boolean = false,
  val isAd: Boolean = false,
  val canNext: Boolean = false,
  val canPrevious: Boolean = false,
  val canSeek: Boolean = false,
  /** Wall-clock time the snapshot was taken, used to extrapolate position. */
  val updatedAtMs: Long = 0,
) {
  val hasMedia: Boolean get() = title.isNotBlank() || durationMs > 0

  /** Position extrapolated to [nowMs] while playing. */
  fun positionAt(nowMs: Long): Long {
    if (!isPlaying || updatedAtMs == 0L) return positionMs
    val p = positionMs + (nowMs - updatedAtMs).coerceAtLeast(0)
    return if (durationMs > 0) p.coerceAtMost(durationMs) else p
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "appId" to appId,
    "title" to title,
    "artist" to artist,
    "album" to album,
    "artworkUrl" to artworkUrl,
    "isPlaying" to isPlaying,
    "positionMs" to positionMs.toDouble(),
    "durationMs" to durationMs.toDouble(),
    "hasVideo" to hasVideo,
    "isAd" to isAd,
    "canNext" to canNext,
    "canPrevious" to canPrevious,
    "canSeek" to canSeek,
    "updatedAtMs" to updatedAtMs.toDouble(),
  )
}

/** Messages posted from injected page scripts through the WebMessage bridge. */
sealed interface BridgeMessage {
  data class Media(val state: NowPlaying) : BridgeMessage
  data class Blocked(val count: Int) : BridgeMessage
  data class Log(val text: String) : BridgeMessage

  /** The page's own Settings button (injected into YouTube's top bar) was tapped. */
  data object OpenSettings : BridgeMessage
}

object BridgeProtocol {
  private const val MAX_TEXT = 300

  /**
   * Parse one JSON message from the page. Pages are semi-trusted (we only listen on the app's
   * own origins), but we still clamp sizes and never throw on garbage.
   */
  fun parse(appId: String, raw: String, nowMs: Long): BridgeMessage? {
    if (raw.length > 64_000) return null
    val o = try { JSONObject(raw) } catch (_: Exception) { return null }
    return when (o.optString("t")) {
      "media" -> {
        val actions = o.optJSONArray("actions")
        val names = buildSet { if (actions != null) for (i in 0 until actions.length()) add(actions.optString(i)) }
        BridgeMessage.Media(
          NowPlaying(
            appId = appId,
            title = o.optString("title").take(MAX_TEXT),
            artist = o.optString("artist").take(MAX_TEXT),
            album = o.optString("album").take(MAX_TEXT),
            artworkUrl = o.optString("artwork").takeIf { it.startsWith("https://") }?.take(2048),
            isPlaying = o.optBoolean("playing"),
            positionMs = secondsToMs(o.optDouble("pos", 0.0)),
            durationMs = secondsToMs(o.optDouble("dur", 0.0)),
            hasVideo = o.optBoolean("video"),
            isAd = o.optBoolean("ad"),
            canNext = "nexttrack" in names,
            canPrevious = "previoustrack" in names,
            canSeek = "seekto" in names || o.optDouble("dur", 0.0) > 0,
            updatedAtMs = nowMs,
          ),
        )
      }
      "blocked" -> BridgeMessage.Blocked(o.optInt("n", 0).coerceIn(0, 1000))
      "log" -> BridgeMessage.Log(o.optString("m").take(500))
      "openSettings" -> BridgeMessage.OpenSettings
      else -> null
    }
  }

  private fun secondsToMs(s: Double): Long =
    if (s.isNaN() || s.isInfinite() || s < 0) 0 else (s * 1000).toLong().coerceAtMost(48L * 3600 * 1000)
}

/** Commands native code can send to a page. */
enum class MediaCommand(val js: String) {
  PLAY("play"),
  PAUSE("pause"),
  NEXT("next"),
  PREVIOUS("previous"),
  SEEK("seek"),
  STOP("pause");

  companion object {
    fun from(name: String): MediaCommand =
      entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
        ?: throw IllegalArgumentException("Unknown media command '$name'")
  }
}
