package com.nitinreddy.bopbox.core.adblock

import com.nitinreddy.bopbox.core.util.UrlUtils

/**
 * Pre-computed facts about one request, shared by every filter tested against it.
 * Immutable, created per [FilterEngine.match] call (so matching is thread-safe).
 */
internal class RequestContext private constructor(
  /** Lowercased URL. */
  val url: String,
  /** Original-case URL (same length as [url]) for `$match-case` filters and regexes. */
  val rawUrl: String,
  /** Lowercased request hostname ("" when the URL has no authority). */
  val host: String,
  /** Offsets of [host] inside [url]. */
  val hostStart: Int,
  val hostEnd: Int,
  /** `1 shl ResourceType.ordinal`. */
  val typeBit: Int,
  /** Host of the page that issued the request (the request itself for DOCUMENT), if known. */
  val pageHost: String?,
  /** null when the page is unknown; party-restricted filters then never match. */
  val thirdParty: Boolean?,
) {
  companion object {
    /** Returns null for URLs the engine never filters (non http/ws schemes, no host). */
    fun create(rawUrl: String, type: ResourceType, pageUrl: String?): RequestContext? {
      val lower = rawUrl.lowercase()
      if (!lower.startsWith("http:") && !lower.startsWith("https:") &&
        !lower.startsWith("ws:") && !lower.startsWith("wss:")
      ) return null
      val bounds = UrlHost.bounds(lower)
      if (bounds < 0) return null
      val hs = (bounds ushr 32).toInt()
      val he = bounds.toInt()
      if (he <= hs) return null
      val host = lower.substring(hs, he)
      val pageHost = if (type == ResourceType.DOCUMENT) host else pageUrl?.let(UrlHost::hostOf)
      val thirdParty = when {
        pageHost.isNullOrEmpty() -> null
        pageHost == host -> false
        else -> !Domains.sameSite(host, pageHost)
      }
      return RequestContext(
        url = lower,
        rawUrl = if (rawUrl.length == lower.length) rawUrl else lower,
        host = host,
        hostStart = hs,
        hostEnd = he,
        typeBit = 1 shl type.ordinal,
        pageHost = pageHost?.ifEmpty { null },
        thirdParty = thirdParty,
      )
    }
  }
}

/** Allocation-light hostname extraction (java.net.URI is slow and rejects many real URLs). */
internal object UrlHost {
  /** Packed `(start shl 32) or end` of the host inside [url], or -1 when there is no authority. */
  fun bounds(url: String): Long {
    val sep = url.indexOf("://")
    if (sep <= 0) return -1
    var start = sep + 3
    var end = start
    val n = url.length
    while (end < n) {
      val c = url[end]
      if (c == '/' || c == '?' || c == '#' || c == '\\') break
      end++
    }
    val at = url.lastIndexOf('@', end - 1)
    if (at >= start) start = at + 1
    if (start < end && url[start] == '[') {
      val close = url.indexOf(']', start)
      if (close in start until end) end = close + 1
    } else {
      val colon = url.indexOf(':', start)
      if (colon in start until end) end = colon
    }
    if (end > start && url[end - 1] == '.') end--
    return (start.toLong() shl 32) or end.toLong()
  }

  /** Lowercased host of [url], or null. */
  fun hostOf(url: String): String? {
    val b = bounds(url)
    if (b < 0) return null
    val s = (b ushr 32).toInt()
    val e = b.toInt()
    return if (e > s) url.substring(s, e).lowercase() else null
  }
}

/** Domain-list helpers shared by `$domain=` and cosmetic domain lists. */
internal object Domains {
  /** [host] equals [domain] or is a subdomain of it (both lowercase). */
  fun hostMatches(host: String, domain: String): Boolean {
    val hl = host.length
    val dl = domain.length
    if (hl == dl) return host == domain
    return hl > dl && host.endsWith(domain) && host[hl - dl - 1] == '.'
  }

  /** Like [hostMatches] but also supports uBO entities (`google.*` matches `www.google.co.uk`). */
  fun matchesEntry(host: String, entry: String): Boolean {
    if (!entry.endsWith(".*")) return hostMatches(host, entry)
    val base = entry.substring(0, entry.length - 2)
    var p = 0
    while (p < host.length) {
      if (host.startsWith(base, p) && host.length > p + base.length && host[p + base.length] == '.') return true
      val dot = host.indexOf('.', p)
      if (dot < 0) break
      p = dot + 1
    }
    return false
  }

  /**
   * Same registrable domain, using the same approximation as [UrlUtils.baseDomain] (last two
   * labels, three for common two-level suffixes) but without allocating.
   */
  fun sameSite(a: String, b: String): Boolean {
    val sa = baseDomainStart(a)
    val sb = baseDomainStart(b)
    val la = a.length - sa
    return la == b.length - sb && a.regionMatches(sa, b, sb, la)
  }

  /** Index in [host] where its base domain (see [UrlUtils.baseDomain]) starts. */
  fun baseDomainStart(host: String): Int {
    var end = host.length
    while (end > 0 && host[end - 1] == '.') end--
    val d1 = host.lastIndexOf('.', end - 1)
    if (d1 <= 0) return 0
    val d2 = host.lastIndexOf('.', d1 - 1)
    if (d2 < 0) return 0
    if (!isTwoLevelSuffix(host, d2 + 1, end)) return d2 + 1
    val d3 = host.lastIndexOf('.', d2 - 1)
    return if (d3 < 0) 0 else d3 + 1
  }

  private fun isTwoLevelSuffix(host: String, from: Int, to: Int): Boolean =
    TWO_LEVEL_SUFFIXES.any { it.length == to - from && host.regionMatches(from, it, 0, it.length) }

  private val TWO_LEVEL_SUFFIXES =
    arrayOf("co.uk", "co.in", "com.au", "co.jp", "com.br", "co.kr", "com.mx", "co.nz", "com.tr", "co.za")

  /**
   * Keys under which host-specific rules for [host] may be stored: every label suffix
   * (`a.b.example.com`, `b.example.com`, `example.com`, `com`) plus entity forms (`example.*`).
   */
  fun lookupKeys(host: String): List<String> {
    val keys = ArrayList<String>(8)
    var p = 0
    while (p < host.length) {
      keys.add(host.substring(p))
      val dot = host.indexOf('.', p)
      if (dot < 0) break
      p = dot + 1
    }
    val base = UrlUtils.baseDomain(host)
    val firstDot = base.indexOf('.')
    if (firstDot > 0) {
      val suffix = base.substring(firstDot + 1)
      for (k in keys.toList()) {
        if (k.length > suffix.length + 1 && k.endsWith(".$suffix")) {
          keys.add(k.substring(0, k.length - suffix.length) + "*")
        }
      }
    }
    return keys
  }
}

/** ABP glob matching: `*` = any run, `^` = separator char or end of URL. */
internal object Glob {
  /** ABP separator: anything except letters, digits and `_ - . %`. */
  fun isSeparator(c: Char): Boolean {
    if (c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9') return false
    if (c == '_' || c == '-' || c == '.' || c == '%') return false
    return c.code < 0x80
  }

  /**
   * Matches [p] against [s] starting at [start]. When [anchoredLeft] is false the pattern may begin
   * anywhere at or after [start]; when [anchoredRight] is false it may end before the end of [s].
   *
   * The pattern is processed as `*`-separated segments, each placed at its earliest possible
   * position (optimal because segments are fixed-width, `^` only being zero-width at the very end
   * of the URL). Candidate positions are found with `indexOf` on the segment's first character,
   * so long URLs are not scanned character by character.
   */
  fun match(p: String, s: String, start: Int, anchoredLeft: Boolean, anchoredRight: Boolean): Boolean {
    val m = p.length
    var pos = start
    var segStart = 0
    while (true) {
      var segEnd = p.indexOf('*', segStart)
      val last = segEnd < 0
      if (last) segEnd = m
      when {
        segStart == 0 && anchoredLeft -> {
          val e = matchSegmentAt(p, segStart, segEnd, s, pos)
          if (e < 0 || (last && anchoredRight && e != s.length)) return false
          pos = e
        }
        last && anchoredRight -> return matchSegmentAtEnd(p, segStart, segEnd, s, pos)
        segEnd > segStart -> {
          pos = findSegment(p, segStart, segEnd, s, pos)
          if (pos < 0) return false
        }
      }
      if (last) return true
      segStart = segEnd + 1
    }
  }

  /** End index in [s] when `p[a, b)` matches at [pos], else -1. */
  private fun matchSegmentAt(p: String, a: Int, b: Int, s: String, pos: Int): Int {
    val n = s.length
    var i = pos
    for (k in a until b) {
      val c = p[k]
      if (c == '^') {
        if (i == n) continue // `^` also matches the end of the URL
        if (!isSeparator(s[i])) return -1
      } else if (i >= n || s[i] != c) {
        return -1
      }
      i++
    }
    return i
  }

  /** End index of the earliest match of `p[a, b)` at or after [from], or -1. */
  private fun findSegment(p: String, a: Int, b: Int, s: String, from: Int): Int {
    val first = p[a]
    var q = from
    while (q <= s.length) {
      if (first != '^') {
        q = s.indexOf(first, q)
        if (q < 0) return -1
      }
      val e = matchSegmentAt(p, a, b, s, q)
      if (e >= 0) return e
      q++
    }
    return -1
  }

  /** Whether `p[a, b)` matches somewhere at or after [from] and ends exactly at the end of [s]. */
  private fun matchSegmentAtEnd(p: String, a: Int, b: Int, s: String, from: Int): Boolean {
    val n = s.length
    var trailingCarets = 0
    while (trailingCarets < b - a && p[b - 1 - trailingCarets] == '^') trailingCarets++
    val len = b - a
    for (q in maxOf(from, n - len)..minOf(n, n - len + trailingCarets)) {
      if (matchSegmentAt(p, a, b, s, q) == n) return true
    }
    return false
  }
}
