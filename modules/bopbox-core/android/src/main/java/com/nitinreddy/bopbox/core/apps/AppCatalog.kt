package com.nitinreddy.bopbox.core.apps

import com.nitinreddy.bopbox.core.util.UrlUtils

/** Which flavour of the site we ask for. */
enum class SiteMode { MOBILE, DESKTOP }

/**
 * Static description of an "app" living inside Bopbox. Everything that differs between
 * YouTube and Spotify is captured here so the browser/adblock/media layers stay generic.
 */
data class AppSpec(
  val id: String,
  val displayName: String,
  val homeUrl: String,
  /** Hosts (and their subdomains) that stay inside this app's WebView. */
  val internalHosts: List<String>,
  /** Default site mode; users can override per app in settings. */
  val defaultMode: SiteMode,
  /** Asset paths (relative to assets/bopbox) injected at document start, in order. */
  val scripts: List<String>,
  /** Build a search URL for a free-text query. */
  val searchUrl: (String) -> String,
  /** Whether the WebView may request protected (DRM) media playback. */
  val needsDrm: Boolean,
  /** Whether video can be shown in Picture-in-Picture. */
  val supportsPip: Boolean,
) {
  fun isInternal(url: String): Boolean {
    val host = UrlUtils.hostOf(url) ?: return false
    return internalHosts.any { UrlUtils.hostMatches(host, it) }
  }
}

object AppCatalog {
  /** Hosts every app needs for sign-in flows. */
  private val authHosts = listOf(
    "accounts.google.com",
    "accounts.youtube.com",
    "myaccount.google.com",
    "google.com",
    "gstatic.com",
    "googleusercontent.com",
    "consent.google.com",
  )

  val YOUTUBE = AppSpec(
    id = "youtube",
    displayName = "YouTube",
    homeUrl = "https://m.youtube.com/",
    internalHosts = listOf("youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com", "consent.youtube.com") + authHosts,
    defaultMode = SiteMode.MOBILE,
    scripts = listOf("bridge.js", "scriptlets.js", "youtube.js"),
    searchUrl = { q -> "https://m.youtube.com/results?search_query=" + UrlUtils.encode(q) },
    needsDrm = false,
    supportsPip = true,
  )

  val all: List<AppSpec> = listOf(YOUTUBE)

  fun byId(id: String): AppSpec? = all.firstOrNull { it.id == id }

  fun require(id: String): AppSpec = byId(id) ?: throw IllegalArgumentException("Unknown app '$id'")

  /** Find which app (if any) a URL belongs to — used for deep links shared into Bopbox. */
  fun forUrl(url: String): AppSpec? {
    val host = UrlUtils.hostOf(url) ?: return null
    return when {
      UrlUtils.hostMatches(host, "youtube.com") || UrlUtils.hostMatches(host, "youtu.be") -> YOUTUBE
      else -> null
    }
  }
}
