package com.nitinreddy.bopbox.core.adblock

import java.util.regex.Pattern

/**
 * One compiled network filter (block or `@@` exception). Immutable and thread-safe.
 *
 * [pattern] has its anchors stripped and is lowercased unless [MATCH_CASE] is set; for
 * [HOST_ONLY] filters (`||host^`) it is just the hostname. For regex filters it holds a literal
 * that every match must contain (possibly empty), used as a cheap prefilter.
 */
internal class NetworkFilter(
  /** Filter text as reported in [MatchResult.rule]. */
  val raw: String,
  private val pattern: String,
  val flags: Int,
  val typeMask: Int,
  private val includeDomains: Array<String>?,
  private val excludeDomains: Array<String>?,
  private val regex: Pattern?,
) {
  val isException: Boolean get() = flags and EXCEPTION != 0
  val isImportant: Boolean get() = flags and IMPORTANT != 0
  fun hasType(type: ResourceType): Boolean = typeMask and (1 shl type.ordinal) != 0

  /** Full check: resource type, party, `$domain=` and URL pattern (cheapest first). */
  fun matches(ctx: RequestContext, checkType: Boolean = true): Boolean {
    if (checkType && (typeMask and ctx.typeBit) == 0) return false
    if (flags and THIRD_PARTY != 0 && ctx.thirdParty != true) return false
    if (flags and FIRST_PARTY != 0 && ctx.thirdParty != false) return false
    if ((includeDomains != null || excludeDomains != null) && !domainAllowed(ctx.pageHost)) return false
    return patternMatches(ctx)
  }

  private fun domainAllowed(pageHost: String?): Boolean {
    if (pageHost == null) return includeDomains == null
    var inc = -1
    includeDomains?.forEach { if (it.length > inc && Domains.matchesEntry(pageHost, it)) inc = it.length }
    if (includeDomains != null && inc < 0) return false
    var exc = -1
    excludeDomains?.forEach { if (it.length > exc && Domains.matchesEntry(pageHost, it)) exc = it.length }
    // The most specific entry wins (`domain=a.com|~b.a.com`).
    return exc < 0 || inc > exc
  }

  private fun patternMatches(ctx: RequestContext): Boolean {
    val s = if (flags and MATCH_CASE != 0) ctx.rawUrl else ctx.url
    if (regex != null) return (pattern.isEmpty() || s.contains(pattern)) && regex.matcher(ctx.rawUrl).find()
    if (pattern.isEmpty()) return true
    val right = flags and RIGHT_ANCHOR != 0
    val plain = flags and PLAIN != 0
    return when {
      flags and HOST_ONLY != 0 -> Domains.hostMatches(ctx.host, pattern)
      flags and HOST_ANCHOR != 0 -> matchHostAnchored(ctx, s, plain, right)
      flags and LEFT_ANCHOR != 0 ->
        if (plain) s.startsWith(pattern) && (!right || s.length == pattern.length)
        else Glob.match(pattern, s, 0, true, right)
      plain -> if (right) s.endsWith(pattern) else s.contains(pattern)
      else -> Glob.match(pattern, s, 0, false, right)
    }
  }

  /** `||`: the pattern must start at the beginning of the hostname or of one of its labels. */
  private fun matchHostAnchored(ctx: RequestContext, s: String, plain: Boolean, right: Boolean): Boolean {
    var p = ctx.hostStart
    while (p < ctx.hostEnd) {
      val ok = if (plain && !right) s.startsWith(pattern, p) else Glob.match(pattern, s, p, true, right)
      if (ok) return true
      val dot = s.indexOf('.', p)
      if (dot < 0 || dot >= ctx.hostEnd - 1) return false
      p = dot + 1
    }
    return false
  }

  override fun toString(): String = raw

  companion object {
    const val EXCEPTION = 1
    const val IMPORTANT = 1 shl 1
    const val HOST_ANCHOR = 1 shl 2
    const val LEFT_ANCHOR = 1 shl 3
    const val RIGHT_ANCHOR = 1 shl 4
    const val MATCH_CASE = 1 shl 5
    const val THIRD_PARTY = 1 shl 6
    const val FIRST_PARTY = 1 shl 7
    /** Pattern has no `*` or `^`. */
    const val PLAIN = 1 shl 8
    /** `||hostname^` with nothing else: a pure hostname-suffix check. */
    const val HOST_ONLY = 1 shl 9
    const val ELEMHIDE = 1 shl 10
    const val GENERICHIDE = 1 shl 11
    const val SPECIFICHIDE = 1 shl 12
    const val COSMETIC_MASK = ELEMHIDE or GENERICHIDE or SPECIFICHIDE

    val ALL_TYPES: Int = (1 shl ResourceType.values().size) - 1
    val DOCUMENT_BIT: Int = 1 shl ResourceType.DOCUMENT.ordinal
    /** Filters without type options never apply to main-frame navigations. */
    val DEFAULT_TYPES: Int = ALL_TYPES and DOCUMENT_BIT.inv()
  }
}

/**
 * Token-bucketed collection of filters. Buckets live in one flat array ([filters] sliced by
 * [offsets]) to keep memory and build time low with ~100k filters.
 */
internal class TokenIndex private constructor(
  private val map: IntIntMap,
  private val offsets: IntArray,
  private val filters: Array<NetworkFilter>,
  private val untokenized: Array<NetworkFilter>,
) {
  val size: Int get() = filters.size + untokenized.size

  /** First filter matching [ctx], or null. [urlTokens] comes from [Tokens.tokenizeUrl]. */
  fun find(ctx: RequestContext, urlTokens: IntArray): NetworkFilter? {
    for (t in urlTokens) {
      val b = map.get(t)
      if (b < 0) continue
      for (i in offsets[b] until offsets[b + 1]) if (filters[i].matches(ctx)) return filters[i]
    }
    for (f in untokenized) if (f.matches(ctx)) return f
    return null
  }

  class Builder {
    private val tokened = ArrayList<NetworkFilter>()
    private var tokens = IntArray(64)
    private val untokenized = ArrayList<NetworkFilter>()

    /** [token] 0 means "no safe token": the filter is tested for every request. */
    fun add(filter: NetworkFilter, token: Int) {
      if (token == 0) {
        untokenized.add(filter)
        return
      }
      if (tokened.size == tokens.size) tokens = tokens.copyOf(tokens.size * 2)
      tokens[tokened.size] = token
      tokened.add(filter)
    }

    fun build(): TokenIndex {
      val n = tokened.size
      val map = IntIntMap(n)
      val bucketOf = IntArray(n)
      var counts = IntArray(64)
      var buckets = 0
      for (i in 0 until n) {
        var b = map.get(tokens[i])
        if (b < 0) {
          b = buckets++
          map.put(tokens[i], b)
          if (b == counts.size) counts = counts.copyOf(counts.size * 2)
        }
        bucketOf[i] = b
        counts[b]++
      }
      val offsets = IntArray(buckets + 1)
      for (b in 0 until buckets) offsets[b + 1] = offsets[b] + counts[b]
      val cursor = offsets.copyOf(buckets)
      val flat = arrayOfNulls<NetworkFilter>(n)
      for (i in 0 until n) flat[cursor[bucketOf[i]]++] = tokened[i]
      @Suppress("UNCHECKED_CAST")
      return TokenIndex(map, offsets, flat as Array<NetworkFilter>, untokenized.toTypedArray())
    }
  }
}
