package com.nitinreddy.bopbox.core.settings

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.SiteMode

/**
 * User preferences. Native code is the single source of truth because the WebView, ad blocker,
 * media service and widgets all need them even when the JS runtime is not alive.
 */
data class Settings(
  val theme: String = "system",
  val adblockEnabled: Boolean = true,
  val adblockPerApp: Map<String, Boolean> = AppCatalog.all.associate { it.id to true },
  val backgroundPlay: Boolean = true,
  val autoPip: Boolean = true,
  val sponsorBlock: Boolean = true,
  val launchTarget: String = "home",
  val siteMode: Map<String, SiteMode> = AppCatalog.all.associate { it.id to it.defaultMode },
  val filterAutoUpdate: Boolean = true,
) {
  fun adblockFor(appId: String): Boolean = adblockEnabled && (adblockPerApp[appId] ?: true)

  fun modeFor(appId: String): SiteMode = siteMode[appId] ?: AppCatalog.require(appId).defaultMode

  /** Flat key/value form shared with JS and SharedPreferences. */
  fun toMap(): Map<String, Any> = buildMap {
    put("theme", theme)
    put("adblockEnabled", adblockEnabled)
    put("backgroundPlay", backgroundPlay)
    put("autoPip", autoPip)
    put("sponsorBlock", sponsorBlock)
    put("launchTarget", launchTarget)
    put("filterAutoUpdate", filterAutoUpdate)
    AppCatalog.all.forEach { app ->
      put("adblock.${app.id}", adblockPerApp[app.id] ?: true)
      put("mode.${app.id}", modeFor(app.id).name.lowercase())
    }
  }

  /** Apply a partial update coming from JS. Unknown keys and bad values are rejected loudly. */
  fun patched(patch: Map<String, Any?>): Settings {
    var next = this
    for ((key, value) in patch) {
      next = when {
        key == "theme" -> next.copy(theme = enumString(key, value, THEMES))
        key == "adblockEnabled" -> next.copy(adblockEnabled = bool(key, value))
        key == "backgroundPlay" -> next.copy(backgroundPlay = bool(key, value))
        key == "autoPip" -> next.copy(autoPip = bool(key, value))
        key == "sponsorBlock" -> next.copy(sponsorBlock = bool(key, value))
        key == "filterAutoUpdate" -> next.copy(filterAutoUpdate = bool(key, value))
        key == "launchTarget" -> next.copy(launchTarget = enumString(key, value, LAUNCH_TARGETS))
        key.startsWith("adblock.") -> {
          val id = appId(key)
          next.copy(adblockPerApp = next.adblockPerApp + (id to bool(key, value)))
        }
        key.startsWith("mode.") -> {
          val id = appId(key)
          val mode = enumString(key, value, setOf("mobile", "desktop"))
          next.copy(siteMode = next.siteMode + (id to SiteMode.valueOf(mode.uppercase())))
        }
        else -> throw IllegalArgumentException("Unknown setting '$key'")
      }
    }
    return next
  }

  companion object {
    val THEMES = setOf("system", "dark", "light")
    val LAUNCH_TARGETS = setOf("home") + AppCatalog.all.map { it.id }

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

    private fun appId(key: String): String {
      val id = key.substringAfter('.')
      require(AppCatalog.byId(id) != null) { "Unknown app in setting '$key'" }
      return id
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
