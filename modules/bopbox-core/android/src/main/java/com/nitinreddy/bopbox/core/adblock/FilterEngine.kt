package com.nitinreddy.bopbox.core.adblock

/**
 * Ad-block filter engine for EasyList / EasyPrivacy / AdGuard / uBO / hosts-file lists.
 *
 * Build with [parse] (expensive, do it off the main thread); afterwards the engine is immutable
 * and [match], [cosmeticSelectors] and [scriptletsFor] may be called from any thread.
 *
 * Network semantics: `@@` exceptions override blocks; `$important` blocks override exceptions
 * unless the exception is itself `$important`; `@@...$document` exempts every request made by a
 * matching page. Filters without type options never block main-frame (DOCUMENT) requests.
 * Unsupported modifiers make the whole rule be ignored rather than half-applied.
 */
class FilterEngine internal constructor(
  private val blocks: TokenIndex,
  private val important: TokenIndex,
  private val exceptions: TokenIndex,
  private val importantExceptions: TokenIndex,
  private val documentExceptions: TokenIndex,
  private val cosmeticControl: List<NetworkFilter>,
  private val hide: HostRuleIndex,
  private val hideExceptions: HostRuleIndex,
  private val scriptlets: HostRuleIndex,
  private val scriptletExceptions: HostRuleIndex,
  /** Number of accepted network rules (blocking, exceptions and `$generichide`-style rules). */
  val networkRuleCount: Int,
) {
  /** Number of accepted element-hiding rules (`##` and `#@#`, scriptlets excluded). */
  val cosmeticRuleCount: Int = hide.size + hideExceptions.size

  /**
   * Decides whether [req] should be blocked. [MatchResult.rule] is the deciding filter: the block
   * rule for BLOCK, the exception for an ALLOW that overrode a block, or null when nothing matched.
   */
  fun match(req: Request): MatchResult {
    val ctx = RequestContext.create(req.url, req.type, req.pageUrl) ?: return MatchResult.NO_MATCH
    val tokens = Tokens.tokenizeUrl(ctx.url)

    if (important.size > 0) important.find(ctx, tokens)?.let { imp ->
      val override = importantExceptions.find(ctx, tokens)
      return if (override != null) allow(override) else block(imp)
    }
    val blocked = blocks.find(ctx, tokens) ?: return MatchResult.NO_MATCH
    val exception = importantExceptions.find(ctx, tokens) ?: exceptions.find(ctx, tokens)
    if (exception != null) return allow(exception)
    pageAllowlistRule(req)?.let { return allow(it) }
    return block(blocked)
  }

  /** `@@...$document` rule exempting the page that issued [req], if any. */
  private fun pageAllowlistRule(req: Request): NetworkFilter? {
    if (documentExceptions.size == 0 || req.type == ResourceType.DOCUMENT) return null
    val page = req.pageUrl ?: return null
    val pageCtx = RequestContext.create(page, ResourceType.DOCUMENT, page) ?: return null
    return documentExceptions.find(pageCtx, Tokens.tokenizeUrl(pageCtx.url))
  }

  /**
   * CSS selectors to hide on [pageHost], de-duplicated, in list order. Host-specific rules are
   * always included; generic `##sel` rules only when [includeGeneric] is true. `#@#` exceptions and
   * `$elemhide` / `$generichide` / `$specifichide` exceptions are honoured. Procedural / extended
   * selectors are never returned.
   */
  fun cosmeticSelectors(pageHost: String, includeGeneric: Boolean = false): List<String> {
    val host = normalizeHost(pageHost) ?: return emptyList()
    val control = cosmeticControlFlags(host)
    if (control and NetworkFilter.ELEMHIDE != 0) return emptyList()
    val keys = Domains.lookupKeys(host)
    val out = LinkedHashSet<String>()
    if (control and NetworkFilter.SPECIFICHIDE == 0) hide.collectSpecific(host, keys, out)
    if (includeGeneric && control and NetworkFilter.GENERICHIDE == 0) hide.collectGeneric(host, out)
    if (out.isEmpty()) return emptyList()
    val disabled = HashSet<String>()
    hideExceptions.collectSpecific(host, keys, disabled)
    hideExceptions.collectGeneric(host, disabled)
    if (disabled.isNotEmpty()) out.removeAll(disabled)
    return out.toList()
  }

  /**
   * Raw uBO scriptlet bodies (`##+js(...)` contents, e.g. `json-prune, playerResponse.adPlacements`)
   * applying to [pageHost]. Parsed and indexed only; nothing is executed here.
   */
  fun scriptletsFor(pageHost: String): List<String> {
    val host = normalizeHost(pageHost) ?: return emptyList()
    val keys = Domains.lookupKeys(host)
    val out = LinkedHashSet<String>()
    scriptlets.collectSpecific(host, keys, out)
    scriptlets.collectGeneric(host, out)
    if (out.isEmpty()) return emptyList()
    val disabled = HashSet<String>()
    scriptletExceptions.collectSpecific(host, keys, disabled)
    scriptletExceptions.collectGeneric(host, disabled)
    if ("" in disabled) return emptyList() // `#@#+js()` disables all scriptlets
    out.removeAll(disabled)
    return out.toList()
  }

  private fun cosmeticControlFlags(host: String): Int {
    if (cosmeticControl.isEmpty()) return 0
    val url = "https://$host/"
    val ctx = RequestContext.create(url, ResourceType.DOCUMENT, url) ?: return 0
    var flags = 0
    for (f in cosmeticControl) {
      if (f.matches(ctx, checkType = false)) flags = flags or (f.flags and NetworkFilter.COSMETIC_MASK)
    }
    return flags
  }

  private fun normalizeHost(pageHost: String): String? {
    val h = pageHost.trim().lowercase().removeSuffix(".")
    val host = if (h.contains("://")) UrlHost.hostOf(h) else h.substringBefore('/').substringBefore(':')
    return host?.ifEmpty { null }
  }

  private fun allow(f: NetworkFilter) = MatchResult(Verdict.ALLOW, f.raw)
  private fun block(f: NetworkFilter) = MatchResult(Verdict.BLOCK, f.raw)

  companion object {
    /**
     * Parses filter lists, each given as the full text of one list. Unknown or unsupported lines
     * are ignored. Takes a few hundred milliseconds for EasyList + EasyPrivacy.
     */
    fun parse(lists: List<String>): FilterEngine {
      val parser = FilterParser()
      for (text in lists) parser.parseList(text)
      return parser.build()
    }
  }
}
