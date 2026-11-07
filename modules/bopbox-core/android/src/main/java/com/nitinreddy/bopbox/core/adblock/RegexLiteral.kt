package com.nitinreddy.bopbox.core.adblock

/** Extracts a literal substring that every match of a regex filter must contain. */
internal object RegexLiteral {
  /**
   * Longest run of literal characters at parenthesis depth 0 (so it is neither optional nor part
   * of an alternative). Returns "" when nothing safe can be derived, e.g. with a top-level `|`.
   */
  fun required(source: String): String {
    var best = ""
    val run = StringBuilder()
    var depth = 0
    var i = 0
    fun endRun() {
      if (run.length > best.length) best = run.toString()
      run.setLength(0)
    }
    while (i < source.length) {
      val c = source[i]
      when {
        c == '\\' && i + 1 < source.length -> {
          val e = source[++i]
          // \d \w \s \b \1 ... are classes, assertions or back-references, not literals.
          if (e.isLetterOrDigit() || depth > 0) endRun() else run.append(e)
        }
        c == '(' -> {
          depth++
          endRun()
        }
        c == ')' -> {
          if (--depth < 0) return ""
          endRun()
        }
        c == '|' -> {
          if (depth == 0) return ""
          endRun()
        }
        c == '[' -> {
          endRun()
          i = skipClass(source, i)
        }
        c == '?' || c == '*' || c == '+' || c == '{' -> {
          // A quantifier makes the preceding literal optional or repeated: drop it from the run.
          if (run.isNotEmpty()) run.setLength(run.length - 1)
          endRun()
          if (c == '{') i = source.indexOf('}', i).let { if (it < 0) source.length else it }
        }
        c == '.' || c == '^' || c == '$' || c == '}' || c == ']' -> endRun()
        depth == 0 -> run.append(c)
        else -> endRun()
      }
      i++
    }
    endRun()
    return best
  }

  /** Index of the `]` closing the class that starts at [start]. */
  private fun skipClass(source: String, start: Int): Int {
    var i = start + 1
    if (i < source.length && source[i] == '^') i++
    if (i < source.length && source[i] == ']') i++
    while (i < source.length && source[i] != ']') {
      if (source[i] == '\\') i++
      i++
    }
    return i
  }
}
