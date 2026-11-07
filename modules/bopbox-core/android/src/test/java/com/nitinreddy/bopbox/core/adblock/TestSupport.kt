package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

internal fun engineOf(vararg rules: String): FilterEngine = FilterEngine.parse(listOf(rules.joinToString("\n")))

internal fun FilterEngine.check(
  url: String,
  page: String? = "https://example.com/",
  type: ResourceType = ResourceType.SCRIPT,
): MatchResult = match(Request(url, page, type))

internal fun FilterEngine.assertBlocked(
  url: String,
  page: String? = "https://example.com/",
  type: ResourceType = ResourceType.SCRIPT,
  rule: String? = null,
) {
  val r = check(url, page, type)
  assertTrue("expected BLOCK for $url ($type on $page) but got $r", r.blocked)
  if (rule != null) assertEquals(rule, r.rule)
}

internal fun FilterEngine.assertAllowed(
  url: String,
  page: String? = "https://example.com/",
  type: ResourceType = ResourceType.SCRIPT,
) {
  val r = check(url, page, type)
  assertFalse("expected ALLOW for $url ($type on $page) but got $r", r.blocked)
}
