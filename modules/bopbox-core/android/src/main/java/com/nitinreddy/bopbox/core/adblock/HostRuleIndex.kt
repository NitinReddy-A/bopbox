package com.nitinreddy.bopbox.core.adblock

/**
 * String values (CSS selectors or scriptlet bodies) indexed by the hostnames they apply to.
 *
 * Host-specific rules are stored under each included domain (or `entity.*`), so a lookup is a
 * handful of hash probes for the page host's label suffixes. Rules without included domains are
 * "generic" (they may still carry `~excluded` domains).
 */
internal class HostRuleIndex {
  private class Rule(val value: String, val excludes: Array<String>?) {
    fun excluded(host: String): Boolean = excludes?.any { Domains.matchesEntry(host, it) } == true
  }

  private val byHost = HashMap<String, ArrayList<Rule>>(1 shl 14)
  private val generic = ArrayList<Rule>()

  /** Number of rules added (one per source line). */
  var size = 0
    private set

  fun add(value: String, includes: List<String>, excludes: List<String>) {
    val rule = Rule(value, if (excludes.isEmpty()) null else excludes.toTypedArray())
    if (includes.isEmpty()) {
      generic.add(rule)
    } else {
      for (d in includes) byHost.getOrPut(d) { ArrayList(2) }.add(rule)
    }
    size++
  }

  /** Adds host-specific values for [host] ([keys] from [Domains.lookupKeys]) to [out]. */
  fun collectSpecific(host: String, keys: List<String>, out: MutableCollection<String>) {
    for (k in keys) byHost[k]?.forEach { if (!it.excluded(host)) out.add(it.value) }
  }

  /** Adds generic values that are not excluded for [host] to [out]. */
  fun collectGeneric(host: String, out: MutableCollection<String>) {
    for (r in generic) if (!r.excluded(host)) out.add(r.value)
  }
}
