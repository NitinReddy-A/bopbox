package com.nitinreddy.bopbox.core.adblock

import java.util.regex.Pattern
import java.util.regex.PatternSyntaxException

/**
 * Parses EasyList / AdGuard / uBO / hosts-file style lists into the indexes used by
 * [FilterEngine]. Anything not understood is dropped: a misparsed rule must never block.
 *
 * Not thread-safe; create one per [FilterEngine.parse] call.
 */
internal class FilterParser {
  private class Entry(val filter: NetworkFilter, val tokens: IntArray, val badfilterKey: String)

  private val entries = ArrayList<Entry>(1 shl 17)
  private val badfilters = HashSet<String>()
  /** Scratch buffer for token extraction (the parser is single-threaded). */
  private val tokenScratch = IntArray(256)

  val hide = HostRuleIndex()
  val hideExceptions = HostRuleIndex()
  val scriptlets = HostRuleIndex()
  val scriptletExceptions = HostRuleIndex()

  fun parseList(text: String) {
    var start = 0
    val n = text.length
    while (start < n) {
      var end = text.indexOf('\n', start)
      if (end < 0) end = n
      parseLine(text.substring(start, end))
      start = end + 1
    }
  }

  fun parseLine(rawLine: String) {
    val line = rawLine.trim()
    if (line.isEmpty()) return
    val c0 = line[0]
    if (c0 == '!' || c0 == '[') return
    if (tryCosmetic(line)) return
    if (c0 == '#') return // hosts-file comment, or cosmetic syntax we skipped
    if (tryHostsLine(line)) return
    if (isBareDomain(line)) {
      addHostBlock(line.lowercase())
      return
    }
    parseNetwork(line)
  }

  // ---------------------------------------------------------------- cosmetic

  /** Returns true when [line] is cosmetic syntax (whether or not it was accepted). */
  private fun tryCosmetic(line: String): Boolean {
    var i = line.indexOf('#')
    while (i >= 0) {
      val kind = cosmeticKindAt(line, i)
      if (kind != null) {
        val domainsPart = line.substring(0, i)
        if (!looksLikeDomainList(domainsPart)) return false
        if (kind.supported) addCosmetic(domainsPart, kind, line.substring(i + kind.separator.length).trim())
        return true
      }
      i = line.indexOf('#', i + 1)
    }
    return false
  }

  private enum class CosmeticKind(val separator: String, val supported: Boolean) {
    HIDE("##", true),
    HIDE_EXCEPTION("#@#", true),
    UNSUPPORTED_EXT("#?#", false),
    UNSUPPORTED_EXT_EXCEPTION("#@?#", false),
    UNSUPPORTED_CSS("#$#", false),
    UNSUPPORTED_CSS_EXCEPTION("#@$#", false),
    UNSUPPORTED_CSS_EXT("#$?#", false),
    UNSUPPORTED_CSS_EXT_EXCEPTION("#@$?#", false),
    UNSUPPORTED_JS("#%#", false),
    UNSUPPORTED_JS_EXCEPTION("#@%#", false),
  }

  private fun cosmeticKindAt(line: String, i: Int): CosmeticKind? {
    // Longest separators first so "#@$?#" is not mistaken for something shorter.
    for (k in COSMETIC_KINDS_BY_LENGTH) if (line.startsWith(k.separator, i)) return k
    return null
  }

  private fun looksLikeDomainList(s: String): Boolean {
    for (c in s) {
      val ok = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' ||
        c == '.' || c == '-' || c == '_' || c == ',' || c == '~' || c == '*' || c == ':' || c.code >= 0x80
      if (!ok) return false
    }
    return true
  }

  private fun addCosmetic(domainsPart: String, kind: CosmeticKind, body: String) {
    if (body.isEmpty()) return
    val includes = ArrayList<String>()
    val excludes = ArrayList<String>()
    for (d in domainsPart.split(',')) {
      val t = d.trim().lowercase()
      if (t.isEmpty()) continue
      if (t.startsWith("~")) {
        if (t.length > 1) excludes.add(t.substring(1))
      } else {
        includes.add(t)
      }
    }
    val exception = kind == CosmeticKind.HIDE_EXCEPTION
    if (body.startsWith("+js(")) {
      if (!body.endsWith(")")) return
      val inner = body.substring(4, body.length - 1).trim()
      (if (exception) scriptletExceptions else scriptlets).add(inner, includes, excludes)
      return
    }
    if (!isPlainCssSelector(body)) return
    (if (exception) hideExceptions else hide).add(body, includes, excludes)
  }

  // ---------------------------------------------------------------- hosts files / bare domains

  private fun tryHostsLine(line: String): Boolean {
    val c0 = line[0]
    if (!(c0 in '0'..'9' || c0 == ':')) return false
    val ws = line.indexOfFirst { it == ' ' || it == '\t' }
    if (ws <= 0) return false
    val ip = line.substring(0, ws)
    if (!ip.all { it in '0'..'9' || it == '.' || it == ':' || it in 'a'..'f' || it in 'A'..'F' }) return false
    val rest = line.substring(ws).substringBefore('#')
    for (h in rest.split(' ', '\t')) {
      val host = h.trim().lowercase().removeSuffix(".")
      if (host.isEmpty() || host in HOSTS_IGNORED || !host.contains('.')) continue
      if (host.all { it in 'a'..'z' || it in '0'..'9' || it == '.' || it == '-' || it == '_' }) addHostBlock(host)
    }
    return true
  }

  private fun isBareDomain(line: String): Boolean {
    if (!line.contains('.')) return false
    val first = line[0]
    val last = line[line.length - 1]
    if (!first.isLetterOrDigit() || !last.isLetterOrDigit()) return false
    for (c in line) {
      if (!(c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '.' || c == '-' || c == '_')) return false
    }
    val tld = line.substringAfterLast('.').lowercase()
    return tld.length >= 2 && tld.all { it in 'a'..'z' } && tld !in FILE_EXTENSIONS
  }

  private fun addHostBlock(host: String) {
    val raw = "||$host^"
    val filter = NetworkFilter(
      raw, host, NetworkFilter.HOST_ANCHOR or NetworkFilter.HOST_ONLY or NetworkFilter.PLAIN,
      NetworkFilter.DEFAULT_TYPES, null, null, null,
    )
    entries.add(Entry(filter, Tokens.safePatternTokens("$host^", true, false, tokenScratch), raw))
  }

  // ---------------------------------------------------------------- network

  private class Options {
    var typesPos = 0
    var typesNeg = 0
    var unmappedPositiveType = false
    var flags = 0
    var includes: ArrayList<String>? = null
    var excludes: ArrayList<String>? = null
    var badfilter = false
    var matchCase = false
  }

  private fun parseNetwork(line: String) {
    val exception = line.startsWith("@@")
    val s = if (exception) line.substring(2) else line
    val dollar = findOptionsStart(s)
    val patternRaw = if (dollar >= 0) s.substring(0, dollar) else s
    val optionList = if (dollar >= 0) s.substring(dollar + 1).split(',') else emptyList()
    val opts = parseOptions(optionList, exception) ?: return

    var flags = opts.flags
    if (exception) flags = flags or NetworkFilter.EXCEPTION
    if (opts.matchCase) flags = flags or NetworkFilter.MATCH_CASE

    var typeMask = when {
      opts.typesPos != 0 -> opts.typesPos and opts.typesNeg.inv()
      opts.unmappedPositiveType -> 0
      else -> NetworkFilter.DEFAULT_TYPES and opts.typesNeg.inv()
    }
    val cosmeticOnly = flags and NetworkFilter.COSMETIC_MASK != 0 && opts.typesPos == 0
    if (cosmeticOnly) typeMask = 0
    if (exception && typeMask and NetworkFilter.DOCUMENT_BIT != 0) {
      // `@@...$document` also turns off element hiding on the page (ABP semantics).
      flags = flags or NetworkFilter.ELEMHIDE
    }
    if (typeMask == 0 && flags and NetworkFilter.COSMETIC_MASK == 0) return

    var regex: Pattern? = null
    var pattern = patternRaw
    var tokens = Tokens.EMPTY
    if (pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
      val source = pattern.substring(1, pattern.length - 1)
      regex = try {
        Pattern.compile(source, if (opts.matchCase) 0 else Pattern.CASE_INSENSITIVE)
      } catch (_: PatternSyntaxException) {
        return
      }
      pattern = RegexLiteral.required(source).let { if (opts.matchCase) it else it.lowercase() }
    } else {
      if (pattern.startsWith("||")) {
        flags = flags or NetworkFilter.HOST_ANCHOR
        pattern = pattern.substring(2)
      } else if (pattern.startsWith("|")) {
        flags = flags or NetworkFilter.LEFT_ANCHOR
        pattern = pattern.substring(1)
      }
      if (pattern.endsWith("|")) {
        flags = flags or NetworkFilter.RIGHT_ANCHOR
        pattern = pattern.substring(0, pattern.length - 1)
      }
      if (pattern.startsWith("*")) {
        pattern = pattern.trimStart('*')
        flags = flags and (NetworkFilter.HOST_ANCHOR or NetworkFilter.LEFT_ANCHOR).inv()
      }
      if (pattern.endsWith("*")) {
        pattern = pattern.trimEnd('*')
        flags = flags and NetworkFilter.RIGHT_ANCHOR.inv()
      }
      if (pattern.any { it == '$' || it == ' ' || it == '\t' || it == '|' }) return
      // A match-everything rule is only accepted when scoped to specific sites.
      if (pattern.isEmpty() && opts.includes == null) return
      if (!opts.matchCase) pattern = pattern.lowercase()
      if (pattern.indexOf('*') < 0 && pattern.indexOf('^') < 0) flags = flags or NetworkFilter.PLAIN
      val leftAnchored = flags and (NetworkFilter.HOST_ANCHOR or NetworkFilter.LEFT_ANCHOR) != 0
      tokens = Tokens.safePatternTokens(
        if (opts.matchCase) pattern.lowercase() else pattern,
        leftAnchored,
        flags and NetworkFilter.RIGHT_ANCHOR != 0,
        tokenScratch,
      )
      if (flags and NetworkFilter.HOST_ANCHOR != 0 && flags and NetworkFilter.RIGHT_ANCHOR == 0 &&
        pattern.length > 1 && pattern.endsWith("^") && isHostname(pattern, pattern.length - 1)
      ) {
        flags = flags or NetworkFilter.HOST_ONLY
        pattern = pattern.substring(0, pattern.length - 1)
      }
    }

    val filter = NetworkFilter(
      raw = line,
      pattern = pattern,
      flags = flags,
      typeMask = typeMask,
      includeDomains = opts.includes?.toTypedArray(),
      excludeDomains = opts.excludes?.toTypedArray(),
      regex = regex,
    )
    if (opts.badfilter) {
      val prefix = if (exception) "@@" else ""
      val rest = optionList.filter { it.trim() != "badfilter" }
      badfilters.add(prefix + patternRaw + if (rest.isEmpty()) "" else "$" + rest.joinToString(","))
      return
    }
    entries.add(Entry(filter, tokens, line))
  }

  /** Index of the `$` that starts the options, or -1. Tolerates `$` inside regexes. */
  private fun findOptionsStart(s: String): Int {
    var i = s.lastIndexOf('$')
    while (i >= 0) {
      if (looksLikeOptionName(s, i + 1)) return i
      if (i == 0) break
      i = s.lastIndexOf('$', i - 1)
    }
    return -1
  }

  private fun looksLikeOptionName(s: String, from: Int): Boolean {
    var i = from
    if (i < s.length && s[i] == '~') i++
    val start = i
    while (i < s.length && s[i] != ',' && s[i] != '=') {
      val c = s[i]
      if (!(c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '-' || c == '_')) return false
      i++
    }
    return i > start
  }

  /** Returns null when the rule must be skipped entirely. */
  private fun parseOptions(list: List<String>, exception: Boolean): Options? {
    val o = Options()
    for (rawOpt in list) {
      val opt = rawOpt.trim()
      if (opt.isEmpty()) continue
      val neg = opt.startsWith("~")
      val body = if (neg) opt.substring(1) else opt
      val eq = body.indexOf('=')
      val name = (if (eq >= 0) body.substring(0, eq) else body).lowercase()
      val value = if (eq >= 0) body.substring(eq + 1) else null
      val typeBit = TYPE_OPTIONS[name]
      when {
        typeBit != null -> if (neg) o.typesNeg = o.typesNeg or typeBit else o.typesPos = o.typesPos or typeBit
        name == "third-party" || name == "3p" || name == "strict3p" ->
          o.flags = o.flags or if (neg) NetworkFilter.FIRST_PARTY else NetworkFilter.THIRD_PARTY
        name == "first-party" || name == "1p" || name == "strict1p" ->
          o.flags = o.flags or if (neg) NetworkFilter.THIRD_PARTY else NetworkFilter.FIRST_PARTY
        name == "domain" || name == "from" -> {
          if (neg || value.isNullOrEmpty() || !parseDomainOption(value, o)) return null
        }
        name == "all" -> if (neg) return null else o.typesPos = o.typesPos or NetworkFilter.ALL_TYPES
        name == "popup" -> if (!neg) return null
        name == "object" || name == "object-subrequest" -> if (!neg) o.unmappedPositiveType = true
        name == "important" -> if (neg) return null else o.flags = o.flags or NetworkFilter.IMPORTANT
        name == "badfilter" -> if (neg) return null else o.badfilter = true
        name == "match-case" -> o.matchCase = !neg
        name == "redirect" || name == "empty" -> if (neg) return null // plain block
        name == "mp4" -> if (neg) return null else o.typesPos = o.typesPos or (1 shl ResourceType.MEDIA.ordinal)
        name == "elemhide" || name == "ehide" -> if (!exception || neg) return null else o.flags = o.flags or NetworkFilter.ELEMHIDE
        name == "generichide" || name == "ghide" ->
          if (!exception || neg) return null else o.flags = o.flags or NetworkFilter.GENERICHIDE
        name == "specifichide" || name == "shide" ->
          if (!exception || neg) return null else o.flags = o.flags or NetworkFilter.SPECIFICHIDE
        name == "reason" || name.all { it == '_' } -> Unit // informational / no-op
        else -> return null // redirect-rule, removeparam, csp, header, replace, unknown...
      }
    }
    return o
  }

  private fun parseDomainOption(value: String, o: Options): Boolean {
    for (d in value.split('|')) {
      val t = d.trim().lowercase()
      if (t.isEmpty()) continue
      val neg = t.startsWith("~")
      val dom = if (neg) t.substring(1) else t
      if (dom.isEmpty() || dom.startsWith("/") || dom.contains('/')) return false // regex domains unsupported
      if (neg) {
        (o.excludes ?: ArrayList<String>().also { o.excludes = it }).add(dom)
      } else {
        (o.includes ?: ArrayList<String>().also { o.includes = it }).add(dom)
      }
    }
    return o.includes != null || o.excludes != null
  }

  private fun isHostname(s: String, end: Int): Boolean {
    for (i in 0 until end) {
      val c = s[i]
      if (!(c in 'a'..'z' || c in '0'..'9' || c == '.' || c == '-' || c == '_')) return false
    }
    return end > 0
  }

  // ---------------------------------------------------------------- build

  fun build(): FilterEngine {
    // Duplicate lines (e.g. shared by two lists) are harmless and not worth hashing every line for.
    val badLengths = badfilters.mapTo(HashSet()) { it.length }
    val live = if (badfilters.isEmpty()) entries else entries.filter {
      it.badfilterKey.length !in badLengths || it.badfilterKey !in badfilters
    }

    // Pick for each filter its least common safe token so buckets stay small.
    val freq = IntIntMap(live.size * 2)
    for (e in live) for (t in e.tokens) freq.increment(t)
    for (t in BAD_TOKENS) freq.put(t, freq.get(t, 0) + 1_000_000)

    val blocks = TokenIndex.Builder()
    val important = TokenIndex.Builder()
    val exceptions = TokenIndex.Builder()
    val importantExceptions = TokenIndex.Builder()
    val documentExceptions = TokenIndex.Builder()
    val cosmeticControl = ArrayList<NetworkFilter>()
    for (e in live) {
      val f = e.filter
      if (f.flags and NetworkFilter.COSMETIC_MASK != 0) cosmeticControl.add(f)
      if (f.typeMask == 0) continue
      var best = 0
      var bestCount = Int.MAX_VALUE
      for (t in e.tokens) {
        val c = freq.get(t, 0)
        if (c < bestCount) {
          bestCount = c
          best = t
        }
      }
      if (f.isException && f.hasType(ResourceType.DOCUMENT)) documentExceptions.add(f, best)
      when {
        f.isException && f.isImportant -> importantExceptions
        f.isException -> exceptions
        f.isImportant -> important
        else -> blocks
      }.add(f, best)
    }
    return FilterEngine(
      blocks = blocks.build(),
      important = important.build(),
      exceptions = exceptions.build(),
      importantExceptions = importantExceptions.build(),
      documentExceptions = documentExceptions.build(),
      cosmeticControl = cosmeticControl,
      hide = hide,
      hideExceptions = hideExceptions,
      scriptlets = scriptlets,
      scriptletExceptions = scriptletExceptions,
      networkRuleCount = live.size,
    )
  }

  companion object {
    private val COSMETIC_KINDS_BY_LENGTH = CosmeticKind.values().sortedByDescending { it.separator.length }

    private fun bit(t: ResourceType) = 1 shl t.ordinal

    private val TYPE_OPTIONS: Map<String, Int> = mapOf(
      "script" to bit(ResourceType.SCRIPT),
      "image" to bit(ResourceType.IMAGE),
      "stylesheet" to bit(ResourceType.STYLESHEET),
      "css" to bit(ResourceType.STYLESHEET),
      "xmlhttprequest" to bit(ResourceType.XHR),
      "xhr" to bit(ResourceType.XHR),
      "media" to bit(ResourceType.MEDIA),
      "font" to bit(ResourceType.FONT),
      "subdocument" to bit(ResourceType.SUBDOCUMENT),
      "frame" to bit(ResourceType.SUBDOCUMENT),
      "ping" to bit(ResourceType.PING),
      "beacon" to bit(ResourceType.PING),
      "websocket" to bit(ResourceType.WEBSOCKET),
      "other" to bit(ResourceType.OTHER),
      "document" to bit(ResourceType.DOCUMENT),
      "doc" to bit(ResourceType.DOCUMENT),
    )

    private val HOSTS_IGNORED = setOf(
      "localhost", "localhost.localdomain", "local", "broadcasthost", "0.0.0.0", "ip6-localhost",
      "ip6-loopback", "ip6-localnet", "ip6-mcastprefix", "ip6-allnodes", "ip6-allrouters",
    )

    /** "Domains" ending in these are really file-name substring rules (`_chartbeat.js`). */
    private val FILE_EXTENSIONS = setOf(
      "js", "mjs", "css", "php", "html", "htm", "gif", "png", "jpg", "jpeg", "svg", "webp", "ico", "swf",
      "json", "xml", "txt", "aspx", "asp", "jsp", "cgi", "mp4", "webm", "mp3", "woff", "woff2", "ttf",
    )

    /** Tokens present in nearly every URL; never chosen while a better candidate exists. */
    private val BAD_TOKENS = listOf("http", "https", "www", "com", "net", "org", "js", "html", "php")
      .map { Tokens.hash(it, 0, it.length) }

    private val PROCEDURAL_MARKERS = listOf(
      ":has-text(", ":-abp-", ":upward(", ":xpath(", ":matches-css", ":remove(", ":style(", ":contains(",
      ":if(", ":if-not(", ":min-text-length(", ":watch-attr", ":matches-attr(", ":matches-path(",
      ":matches-media(", ":matches-prop", ":others(", ":remove-attr(", ":remove-class(", ":nth-ancestor(",
      ":shadow(", ":spath(", ":properties(", ":-ext-",
    )

    /** True for selectors a plain `display:none` stylesheet can apply. */
    fun isPlainCssSelector(sel: String): Boolean {
      if (sel.isEmpty()) return false
      val c0 = sel[0]
      if (c0 == '^' || c0 == '+') return false // uBO HTML filtering / scriptlets
      if (sel.indexOf('{') >= 0 || sel.indexOf('}') >= 0) return false
      for (m in PROCEDURAL_MARKERS) if (sel.contains(m)) return false
      return true
    }
  }
}
