package com.nitinreddy.bopbox.core.util

import java.net.URI
import java.net.URLEncoder

/** Small, dependency-free URL helpers (pure JVM so they are unit-testable). */
object UrlUtils {
  fun hostOf(url: String): String? = try {
    URI(url.trim()).host?.lowercase()?.removeSuffix(".")
  } catch (_: Exception) {
    null
  }

  fun schemeOf(url: String): String? = try {
    URI(url.trim()).scheme?.lowercase()
  } catch (_: Exception) {
    url.substringBefore(':', "").lowercase().ifEmpty { null }
  }

  /** True when [host] equals [domain] or is a subdomain of it. */
  fun hostMatches(host: String, domain: String): Boolean {
    val h = host.lowercase()
    val d = domain.lowercase()
    return h == d || h.endsWith(".$d")
  }

  /**
   * Registrable-ish domain used for third-party checks. We avoid a full public-suffix list and
   * keep the last two labels, or three for common two-level suffixes such as co.uk.
   */
  fun baseDomain(host: String): String {
    val labels = host.lowercase().split('.').filter { it.isNotEmpty() }
    if (labels.size <= 2) return labels.joinToString(".")
    val lastTwo = labels.takeLast(2).joinToString(".")
    val twoLevel = setOf("co.uk", "co.in", "com.au", "co.jp", "com.br", "co.kr", "com.mx", "co.nz", "com.tr", "co.za")
    return if (lastTwo in twoLevel) labels.takeLast(3).joinToString(".") else lastTwo
  }

  fun isThirdParty(requestHost: String, pageHost: String?): Boolean {
    if (pageHost.isNullOrEmpty()) return false
    return baseDomain(requestHost) != baseDomain(pageHost)
  }

  fun encode(q: String): String = URLEncoder.encode(q, "UTF-8")

  fun encodePath(q: String): String = URLEncoder.encode(q, "UTF-8").replace("+", "%20")

  /** Turn what the user typed into a URL, or null when it's clearly a search query. */
  fun asUrlOrNull(input: String): String? {
    val s = input.trim()
    if (s.isEmpty() || s.contains(' ')) return null
    if (s.startsWith("http://") || s.startsWith("https://")) return s
    return if (Regex("^[a-z0-9-]+(\\.[a-z0-9-]+)+(/.*)?$", RegexOption.IGNORE_CASE).matches(s)) "https://$s" else null
  }
}
