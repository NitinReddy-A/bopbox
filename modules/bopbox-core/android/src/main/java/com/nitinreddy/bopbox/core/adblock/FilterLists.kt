package com.nitinreddy.bopbox.core.adblock

/** Names and sources of the filter lists bundled with Bopbox (assets under [ASSET_DIR]). */
object FilterLists {
  const val EASYLIST_URL = "https://easylist.to/easylist/easylist.txt"
  const val EASYPRIVACY_URL = "https://easylist.to/easylist/easyprivacy.txt"

  /** Asset directory (relative to the APK assets root). */
  const val ASSET_DIR = "bopbox/filters"
  const val EASYLIST_ASSET = "easylist.txt"
  const val EASYPRIVACY_ASSET = "easyprivacy.txt"
  /** Hand-curated YouTube / Spotify rules; not updated remotely. */
  const val EXTRAS_ASSET = "bopbox-extras.txt"

  /** All bundled list asset names, in load order. */
  val BUNDLED_ASSETS: List<String> = listOf(EASYLIST_ASSET, EASYPRIVACY_ASSET, EXTRAS_ASSET)

  /** Bundled lists that can be refreshed from the network: asset name -> update URL. */
  val UPDATE_URLS: Map<String, String> = mapOf(
    EASYLIST_ASSET to EASYLIST_URL,
    EASYPRIVACY_ASSET to EASYPRIVACY_URL,
  )

  /** Asset path for [name], e.g. `bopbox/filters/easylist.txt`. */
  fun assetPath(name: String): String = "$ASSET_DIR/$name"

  /**
   * Sanity check for a downloaded list before it replaces a bundled one: rejects HTML (captive
   * portals, error pages) and near-empty bodies; accepts an `[Adblock ...]` header or more than
   * 1000 rule-like lines.
   */
  fun looksValid(text: String): Boolean {
    if (text.isBlank()) return false
    val head = text.take(4096).trimStart().lowercase()
    if (head.startsWith("<!doctype") || head.startsWith("<html") || head.contains("<html") ||
      head.contains("<head>") || head.contains("<body")
    ) return false
    val ruleLines = countRuleLines(text, limit = 1001)
    if (head.take(512).contains("[adblock")) return ruleLines > 0
    return ruleLines > 1000
  }

  private fun countRuleLines(text: String, limit: Int): Int {
    var count = 0
    for (raw in text.lineSequence()) {
      val line = raw.trim()
      if (line.isEmpty() || line.startsWith("!") || line.startsWith("[") || line.startsWith("# ")) continue
      if (line.startsWith("<")) continue
      val ruleLike = line.startsWith("||") || line.startsWith("@@") || line.contains("##") ||
        line.contains("#@#") || line.startsWith("0.0.0.0 ") || line.startsWith("127.0.0.1 ") ||
        line.startsWith("|") || line.startsWith("/") || line.contains('$') ||
        (line.contains('.') && line.none { it.isWhitespace() })
      if (ruleLike && ++count >= limit) return count
    }
    return count
  }
}
