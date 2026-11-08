package com.nitinreddy.bopbox.core.settings

import com.nitinreddy.bopbox.core.apps.SiteMode

/**
 * User preferences. Native code is the single source of truth because the WebView, ad blocker,
 * media service and widgets all need them even when the JS runtime is not alive.
 */
data class Settings(
  val theme: String = "system",
  val adblockEnabled: Boolean = true,
  val sponsorBlock: Boolean = true,
  val backgroundPlay: Boolean = true,
  val autoPip: Boolean = true,
  val siteMode: SiteMode = SiteMode.MOBILE,
  val filterAutoUpdate: Boolean = true,
  /**
   * Preferred resolution for every video ("auto" leaves YouTube's choice alone). YouTube's mobile
   * site otherwise starts each video at 240p and climbs slowly, so the default is 1080p, which
   * the player then starts at directly (falling back to the best level a video has below it).
   */
  val defaultQuality: String = "1080",
  /** Playback rate applied to every video, as a string from [SPEEDS]. */
  val defaultSpeed: String = "1",
  val returnDislike: Boolean = true,
  val hideShorts: Boolean = false,
  val hideCards: Boolean = true,
  val swipeControls: Boolean = true,
  val alwaysRepeat: Boolean = false,
) {
  @Suppress("UNUSED_PARAMETER")
  fun adblockFor(appId: String): Boolean = adblockEnabled

  @Suppress("UNUSED_PARAMETER")
  fun modeFor(appId: String): SiteMode = siteMode

  /** Flat key/value form shared with JS and SharedPreferences. */
  fun toMap(): Map<String, Any> = mapOf(
    "theme" to theme,
    "adblockEnabled" to adblockEnabled,
    "sponsorBlock" to sponsorBlock,
    "backgroundPlay" to backgroundPlay,
    "autoPip" to autoPip,
    "siteMode" to siteMode.name.lowercase(),
    "filterAutoUpdate" to filterAutoUpdate,
    "defaultQuality" to defaultQuality,
    "defaultSpeed" to defaultSpeed,
    "returnDislike" to returnDislike,
    "hideShorts" to hideShorts,
    "hideCards" to hideCards,
    "swipeControls" to swipeControls,
    "alwaysRepeat" to alwaysRepeat,
  )

  /** Apply a partial update coming from JS. Unknown keys and bad values are rejected loudly. */
  fun patched(patch: Map<String, Any?>): Settings {
    var next = this
    for ((key, value) in patch) {
      next = when (key) {
        "theme" -> next.copy(theme = enumString(key, value, THEMES))
        "adblockEnabled" -> next.copy(adblockEnabled = bool(key, value))
        "sponsorBlock" -> next.copy(sponsorBlock = bool(key, value))
        "backgroundPlay" -> next.copy(backgroundPlay = bool(key, value))
        "autoPip" -> next.copy(autoPip = bool(key, value))
        "siteMode" -> next.copy(siteMode = SiteMode.valueOf(enumString(key, value, setOf("mobile", "desktop")).uppercase()))
        "filterAutoUpdate" -> next.copy(filterAutoUpdate = bool(key, value))
        "defaultQuality" -> next.copy(defaultQuality = enumString(key, value, QUALITIES))
        "defaultSpeed" -> next.copy(defaultSpeed = enumString(key, value, SPEEDS))
        "returnDislike" -> next.copy(returnDislike = bool(key, value))
        "hideShorts" -> next.copy(hideShorts = bool(key, value))
        "hideCards" -> next.copy(hideCards = bool(key, value))
        "swipeControls" -> next.copy(swipeControls = bool(key, value))
        "alwaysRepeat" -> next.copy(alwaysRepeat = bool(key, value))
        else -> throw IllegalArgumentException("Unknown setting '$key'")
      }
    }
    return next
  }

  companion object {
    val THEMES = setOf("system", "dark", "light")
    val QUALITIES = setOf("auto", "2160", "1440", "1080", "720", "480", "360", "240", "144")
    val SPEEDS = setOf("0.5", "0.75", "1", "1.25", "1.5", "1.75", "2", "2.5", "3")

    /** Layout version of persisted settings; bump it together with a step in [migrate]. */
    const val VERSION = 2
    const val VERSION_KEY = "settingsVersion"

    /**
     * Upgrade values saved by an older version. Version 1 defaulted quality to "auto" (YouTube's
     * slow 240p start), and saved every field on any change, so "auto" there was not a choice.
     */
    fun migrate(stored: Map<String, Any?>): Map<String, Any?> {
      val version = stored[VERSION_KEY] as? Int ?: 1
      if (version >= VERSION) return stored
      val out = stored.toMutableMap()
      if (out["defaultQuality"] == "auto") out["defaultQuality"] = Settings().defaultQuality
      out[VERSION_KEY] = VERSION
      return out
    }

    /** Rebuild from persisted values, falling back to defaults for anything missing or corrupt. */
    fun fromMap(map: Map<String, Any?>): Settings {
      val defaults = Settings()
      return map.entries.fold(defaults) { acc, (k, v) ->
        try {
          acc.patched(mapOf(k to v))
        } catch (_: IllegalArgumentException) {
          acc
        }
      }
    }

    private fun bool(key: String, value: Any?): Boolean =
      value as? Boolean ?: throw IllegalArgumentException("Setting '$key' expects a boolean")

    private fun enumString(key: String, value: Any?, allowed: Set<String>): String {
      val s = value as? String ?: throw IllegalArgumentException("Setting '$key' expects a string")
      require(s in allowed) { "Setting '$key' must be one of $allowed" }
      return s
    }
  }
}
