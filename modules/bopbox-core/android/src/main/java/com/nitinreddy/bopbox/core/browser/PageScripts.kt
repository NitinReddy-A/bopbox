package com.nitinreddy.bopbox.core.browser

import com.nitinreddy.bopbox.core.apps.AppSpec
import com.nitinreddy.bopbox.core.settings.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * Assembles the single document-start script injected into an app's pages:
 * a config object, host-specific cosmetic selectors, then the app's asset scripts.
 */
object PageScripts {
  /** Origins scripts and the native bridge are restricted to. */
  fun originsFor(app: AppSpec): Set<String> = when (app.id) {
    "youtube" -> setOf("https://m.youtube.com", "https://www.youtube.com", "https://youtube.com")
    "spotify" -> setOf("https://open.spotify.com")
    else -> emptySet()
  }

  fun build(
    app: AppSpec,
    settings: Settings,
    cosmeticByHost: Map<String, List<String>>,
    readAsset: (String) -> String,
  ): String {
    val config = JSONObject().apply {
      put("app", app.id)
      put("adblock", settings.adblockFor(app.id))
      put("backgroundPlay", settings.backgroundPlay)
      put("sponsorBlock", settings.sponsorBlock && app.id == "youtube")
      put("desktop", settings.modeFor(app.id).name == "DESKTOP")
      val css = JSONObject()
      if (settings.adblockFor(app.id)) {
        cosmeticByHost.forEach { (host, selectors) -> if (selectors.isNotEmpty()) css.put(host, JSONArray(selectors)) }
      }
      put("cosmetic", css)
    }
    return buildString {
      append("(function(){if(window.__bopboxConfig)return;window.__bopboxConfig=")
      append(config.toString())
      append(";})();\n")
      for (script in app.scripts) {
        append(readAsset(script))
        append("\n")
      }
    }
  }

  /** JS snippet that delivers a command to bridge.js. Arguments are JSON-encoded, never concatenated raw. */
  fun command(name: String, arg: Double? = null): String {
    val n = JSONObject.quote(name)
    val a = if (arg == null || arg.isNaN()) "null" else arg.toString()
    return "window.__bopbox&&window.__bopbox.command($n,$a);"
  }
}
