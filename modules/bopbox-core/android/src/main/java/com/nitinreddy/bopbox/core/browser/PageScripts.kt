package com.nitinreddy.bopbox.core.browser

import com.nitinreddy.bopbox.core.apps.AppSpec
import com.nitinreddy.bopbox.core.settings.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * Assembles the single document-start script injected into an app's pages:
 * a config object (with host-specific cosmetic selectors and uBO scriptlet rules), then the
 * app's asset scripts.
 */
object PageScripts {
  /** Origins scripts and the native bridge are restricted to. */
  fun originsFor(app: AppSpec): Set<String> = when (app.id) {
    "youtube" -> setOf("https://m.youtube.com", "https://www.youtube.com", "https://youtube.com")
    else -> emptySet()
  }

  /** The config object page scripts read (as `window.__bopboxConfig`). */
  fun config(
    app: AppSpec,
    settings: Settings,
    cosmeticByHost: Map<String, List<String>>,
    scriptletsByHost: Map<String, List<String>> = emptyMap(),
  ): JSONObject =
    JSONObject().apply {
      put("app", app.id)
      put("adblock", settings.adblockFor(app.id))
      put("backgroundPlay", settings.backgroundPlay)
      put("sponsorBlock", settings.sponsorBlock)
      put("desktop", settings.modeFor(app.id).name == "DESKTOP")
      put("defaultQuality", settings.defaultQuality)
      put("defaultSpeed", settings.defaultSpeed.toDouble())
      put("returnDislike", settings.returnDislike)
      put("hideShorts", settings.hideShorts)
      put("hideCards", settings.hideCards)
      put("alwaysRepeat", settings.alwaysRepeat)
      put("miniplayer", settings.miniplayer)
      val css = JSONObject()
      if (settings.adblockFor(app.id)) {
        cosmeticByHost.forEach { (host, selectors) -> if (selectors.isNotEmpty()) css.put(host, JSONArray(selectors)) }
      }
      put("cosmetic", css)
      val scriptlets = JSONObject()
      if (settings.adblockFor(app.id)) {
        scriptletsByHost.forEach { (host, rules) -> if (rules.isNotEmpty()) scriptlets.put(host, JSONArray(rules)) }
      }
      put("scriptlets", scriptlets)
    }

  /**
   * Snippet that updates an already-loaded page's config in place, so toggles apply at once,
   * and installs scriptlet rules that arrived after the page started (filter engine warm-up).
   */
  fun liveUpdate(config: JSONObject): String =
    "window.__bopboxConfig&&Object.assign(window.__bopboxConfig,$config);" +
      "window.__bopboxScriptlets&&window.__bopboxScriptlets.sync();"

  fun build(
    app: AppSpec,
    settings: Settings,
    cosmeticByHost: Map<String, List<String>>,
    scriptletsByHost: Map<String, List<String>> = emptyMap(),
    readAsset: (String) -> String,
  ): String {
    val config = config(app, settings, cosmeticByHost, scriptletsByHost)
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

  /**
   * Expression asking the page what Android back should do: "handled" (the page dealt with it,
   * e.g. minimised the player), "background" (leave the app, keep playing) or "none".
   */
  const val BACK_QUERY = "(window.__bopbox&&window.__bopbox.back)?window.__bopbox.back():'none'"

  /** The page's answer to [BACK_QUERY], as evaluateJavascript returns it (a JSON string). */
  fun backAnswer(raw: String?): String = when (raw?.trim()?.trim('"')) {
    "handled" -> "handled"
    "background" -> "background"
    else -> "none"
  }

  /** JS snippet that delivers a command to bridge.js. Arguments are JSON-encoded, never concatenated raw. */
  fun command(name: String, arg: Double? = null): String {
    val n = JSONObject.quote(name)
    val a = if (arg == null || arg.isNaN()) "null" else arg.toString()
    return "window.__bopbox&&window.__bopbox.command($n,$a);"
  }
}
