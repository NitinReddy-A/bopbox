package com.nitinreddy.bopbox.core.adblock

/**
 * Tokenisation shared by filters and URLs.
 *
 * A token is a maximal run of `[a-z0-9%]` (callers lowercase first). A filter is indexed under one
 * of its tokens that is guaranteed to appear as a *whole* token in every URL it can match, so at
 * match time only the buckets for the URL's own tokens need to be consulted.
 */
internal object Tokens {
  /** Tokens shorter than this are never indexed (too common to be selective). */
  const val MIN_TOKEN_LENGTH = 2

  fun isTokenChar(c: Char): Boolean = (c in 'a'..'z') || (c in '0'..'9') || c == '%'

  /** Hash of `s[from, to)`; never 0 because 0 marks empty slots in [IntIntMap]. */
  fun hash(s: CharSequence, from: Int, to: Int): Int {
    var h = 7
    for (i in from until to) h = 31 * h + s[i].code
    return if (h == 0) 1 else h
  }

  /** Distinct token hashes of an already-lowercased URL (order unspecified). */
  fun tokenizeUrl(url: String): IntArray {
    var out = IntArray(32)
    var n = 0
    var start = -1
    val len = url.length
    for (i in 0..len) {
      val tokenChar = i < len && isTokenChar(url[i])
      if (tokenChar) {
        if (start < 0) start = i
      } else if (start >= 0) {
        if (i - start >= MIN_TOKEN_LENGTH) {
          if (n == out.size) out = out.copyOf(n * 2)
          out[n++] = hash(url, start, i)
        }
        start = -1
      }
    }
    if (n == 0) return EMPTY
    out.sort(0, n)
    var w = 1
    for (r in 1 until n) if (out[r] != out[w - 1]) out[w++] = out[r]
    return out.copyOf(w)
  }

  /**
   * Hashes of the tokens of a (lowercased, anchor-stripped) filter pattern that must appear as a
   * whole URL token whenever the pattern matches. A token touching a `*`, or an unanchored pattern
   * edge, may be only part of a longer URL token and is therefore not safe. [scratch] is a reusable
   * buffer; the result is a fresh array.
   */
  fun safePatternTokens(
    pattern: String,
    leftAnchored: Boolean,
    rightAnchored: Boolean,
    scratch: IntArray = IntArray(64),
  ): IntArray {
    var n = 0
    var start = -1
    var h = 7
    val len = pattern.length
    for (i in 0..len) {
      val c = if (i < len) pattern[i] else ' '
      if (isTokenChar(c)) {
        if (start < 0) {
          start = i
          h = 7
        }
        h = 31 * h + c.code
        continue
      }
      if (start < 0) continue
      val leftOk = if (start == 0) leftAnchored else pattern[start - 1] != '*'
      val rightOk = if (i == len) rightAnchored else c != '*'
      if (leftOk && rightOk && i - start >= MIN_TOKEN_LENGTH && n < scratch.size) {
        scratch[n++] = if (h == 0) 1 else h
      }
      start = -1
    }
    return if (n == 0) EMPTY else scratch.copyOf(n)
  }

  val EMPTY = IntArray(0)
}

/** Minimal open-addressing Int -> Int map (key 0 is reserved) to avoid boxing in hot paths. */
internal class IntIntMap(expectedSize: Int = 16) {
  private var keys: IntArray
  private var values: IntArray
  private var mask: Int
  var size = 0
    private set

  init {
    var cap = 16
    while (cap < expectedSize * 2) cap = cap shl 1
    keys = IntArray(cap)
    values = IntArray(cap)
    mask = cap - 1
  }

  fun get(key: Int, default: Int = -1): Int {
    var i = mix(key) and mask
    while (true) {
      val k = keys[i]
      if (k == key) return values[i]
      if (k == 0) return default
      i = (i + 1) and mask
    }
  }

  fun put(key: Int, value: Int) {
    require(key != 0) { "key 0 is reserved" }
    var i = mix(key) and mask
    while (true) {
      val k = keys[i]
      if (k == key) {
        values[i] = value
        return
      }
      if (k == 0) {
        keys[i] = key
        values[i] = value
        if (++size * 2 > keys.size) grow()
        return
      }
      i = (i + 1) and mask
    }
  }

  fun increment(key: Int) = put(key, get(key, 0) + 1)

  private fun grow() {
    val oldKeys = keys
    val oldValues = values
    keys = IntArray(oldKeys.size * 2)
    values = IntArray(oldKeys.size * 2)
    mask = keys.size - 1
    size = 0
    for (i in oldKeys.indices) if (oldKeys[i] != 0) put(oldKeys[i], oldValues[i])
  }

  private fun mix(key: Int): Int {
    val h = key * -0x61c88647
    return h xor (h ushr 16)
  }
}
