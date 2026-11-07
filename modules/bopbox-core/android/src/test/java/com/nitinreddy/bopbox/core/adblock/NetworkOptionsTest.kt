package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NetworkOptionsTest {
  // ------------------------------------------------------------ exceptions / important / badfilter

  @Test fun exceptionOverridesBlock() {
    val e = engineOf("||ads.example^", "@@||ads.example/allowed/")
    e.assertBlocked("https://ads.example/x.js")
    val r = e.check("https://ads.example/allowed/x.js")
    assertEquals(Verdict.ALLOW, r.verdict)
    assertEquals("@@||ads.example/allowed/", r.rule)
  }

  @Test fun importantOverridesException() {
    val e = engineOf("||ads.example^\$important", "@@||ads.example^")
    e.assertBlocked("https://ads.example/x.js", rule = "||ads.example^\$important")
  }

  @Test fun importantExceptionOverridesImportant() {
    val e = engineOf("||ads.example^\$important", "@@||ads.example/ok/\$important")
    e.assertBlocked("https://ads.example/x.js")
    val r = e.check("https://ads.example/ok/x.js")
    assertFalse(r.blocked)
    assertEquals("@@||ads.example/ok/\$important", r.rule)
  }

  @Test fun badfilterDisablesMatchingRule() {
    val e = engineOf("||ads.example^\$script", "||ads.example^\$script,badfilter", "||other.example^")
    e.assertAllowed("https://ads.example/x.js")
    e.assertBlocked("https://other.example/x.js")
    assertEquals(1, e.networkRuleCount)
  }

  @Test fun badfilterOnlyDisablesExactRule() {
    val e = engineOf("||ads.example^", "||ads.example^\$image,badfilter")
    e.assertBlocked("https://ads.example/x.js")
  }

  @Test fun badfilterWorksAcrossLists() {
    val e = FilterEngine.parse(listOf("||ads.example^", "||ads.example^\$badfilter"))
    e.assertAllowed("https://ads.example/x.js")
  }

  @Test fun badfilterOnException() {
    val e = engineOf("||ads.example^", "@@||ads.example^", "@@||ads.example^\$badfilter")
    e.assertBlocked("https://ads.example/x.js")
  }

  @Test fun documentExceptionAllowlistsWholePage() {
    val e = engineOf("||ads.example^", "@@||trusted.example^\$document")
    e.assertAllowed("https://ads.example/x.js", page = "https://trusted.example/page")
    e.assertAllowed("https://ads.example/x.js", page = "https://www.trusted.example/page")
    e.assertBlocked("https://ads.example/x.js", page = "https://other.example/page")
  }

  // ------------------------------------------------------------ party

  @Test fun thirdPartyOption() {
    val e = engineOf("||cdn.example^\$third-party", "||tag.example^\$3p")
    e.assertBlocked("https://cdn.example/a.js", page = "https://news.com/")
    e.assertAllowed("https://cdn.example/a.js", page = "https://cdn.example/")
    e.assertAllowed("https://cdn.example/a.js", page = "https://www.cdn.example/")
    e.assertBlocked("https://tag.example/a.js", page = "https://news.com/")
    // Unknown page: party-restricted rules do not apply.
    e.assertAllowed("https://cdn.example/a.js", page = null)
  }

  @Test fun firstPartyOptions() {
    val e = engineOf("/own-ads/\$~third-party", "/pixel1p.\$1p", "/fp-only/\$first-party")
    e.assertBlocked("https://news.com/own-ads/a.js", page = "https://www.news.com/")
    e.assertAllowed("https://cdn.com/own-ads/a.js", page = "https://www.news.com/")
    e.assertBlocked("https://news.com/pixel1p.gif", page = "https://news.com/", type = ResourceType.IMAGE)
    e.assertBlocked("https://news.com/fp-only/x", page = "https://news.com/")
    e.assertAllowed("https://x.com/fp-only/x", page = "https://news.com/")
  }

  @Test fun thirdPartyUsesBaseDomainWithTwoLevelSuffix() {
    val e = engineOf("||static.bbc.co.uk^\$third-party")
    e.assertAllowed("https://static.bbc.co.uk/a.js", page = "https://www.bbc.co.uk/")
    e.assertBlocked("https://static.bbc.co.uk/a.js", page = "https://other.co.uk/")
  }

  // ------------------------------------------------------------ domain=

  @Test fun domainIncludeAndExclude() {
    val e = engineOf("/ads.js\$domain=a.com|b.com", "/track.js\$domain=~safe.com", "/x.js\$from=c.com")
    e.assertBlocked("https://cdn.net/ads.js", page = "https://a.com/")
    e.assertBlocked("https://cdn.net/ads.js", page = "https://sub.b.com/")
    e.assertAllowed("https://cdn.net/ads.js", page = "https://c.com/")
    e.assertAllowed("https://cdn.net/ads.js", page = null)
    e.assertBlocked("https://cdn.net/track.js", page = "https://news.com/")
    e.assertAllowed("https://cdn.net/track.js", page = "https://www.safe.com/")
    e.assertBlocked("https://cdn.net/track.js", page = null)
    e.assertBlocked("https://cdn.net/x.js", page = "https://c.com/")
  }

  @Test fun domainMostSpecificWins() {
    val e = engineOf("/ads.js\$domain=example.com|~shop.example.com")
    e.assertBlocked("https://cdn.net/ads.js", page = "https://example.com/")
    e.assertAllowed("https://cdn.net/ads.js", page = "https://shop.example.com/")
    e.assertAllowed("https://cdn.net/ads.js", page = "https://a.shop.example.com/")
  }

  @Test fun domainEntity() {
    val e = engineOf("/ads.js\$domain=google.*")
    e.assertBlocked("https://cdn.net/ads.js", page = "https://www.google.co.uk/")
    e.assertBlocked("https://cdn.net/ads.js", page = "https://google.de/")
    e.assertAllowed("https://cdn.net/ads.js", page = "https://notgoogle.de/")
  }

  @Test fun documentRequestsUseThemselvesAsContext() {
    val e = engineOf("||landing.example^\$document,domain=landing.example")
    e.assertBlocked("https://landing.example/", page = "https://elsewhere.com/", type = ResourceType.DOCUMENT)
  }

  // ------------------------------------------------------------ types

  @Test fun typeOptionsRestrictMatches() {
    val e = engineOf("||t.example^\$script,image", "||u.example^\$~image", "||v.example^\$xhr", "||w.example^\$css,frame")
    e.assertBlocked("https://t.example/a", type = ResourceType.SCRIPT)
    e.assertBlocked("https://t.example/a", type = ResourceType.IMAGE)
    e.assertAllowed("https://t.example/a", type = ResourceType.XHR)
    e.assertAllowed("https://u.example/a", type = ResourceType.IMAGE)
    e.assertBlocked("https://u.example/a", type = ResourceType.SCRIPT)
    e.assertBlocked("https://v.example/a", type = ResourceType.XHR)
    e.assertAllowed("https://v.example/a", type = ResourceType.PING)
    e.assertBlocked("https://w.example/a", type = ResourceType.STYLESHEET)
    e.assertBlocked("https://w.example/a", type = ResourceType.SUBDOCUMENT)
  }

  @Test fun allTypeNames() {
    val cases = mapOf(
      "xmlhttprequest" to ResourceType.XHR, "media" to ResourceType.MEDIA, "font" to ResourceType.FONT,
      "subdocument" to ResourceType.SUBDOCUMENT, "ping" to ResourceType.PING, "websocket" to ResourceType.WEBSOCKET,
      "other" to ResourceType.OTHER, "stylesheet" to ResourceType.STYLESHEET, "doc" to ResourceType.DOCUMENT,
    )
    for ((opt, type) in cases) {
      val e = engineOf("||t.example^\$$opt")
      e.assertBlocked("https://t.example/a", type = type)
      for (other in ResourceType.values().filter { it != type }) e.assertAllowed("https://t.example/a", type = other)
    }
  }

  @Test fun untypedRulesNeverBlockDocuments() {
    val e = engineOf("||ads.example^", "/landing/*", "||x.example^\$~script")
    e.assertAllowed("https://ads.example/", type = ResourceType.DOCUMENT)
    e.assertAllowed("https://site.com/landing/1", type = ResourceType.DOCUMENT)
    e.assertAllowed("https://x.example/", type = ResourceType.DOCUMENT)
    e.assertBlocked("https://ads.example/", type = ResourceType.SUBDOCUMENT)
  }

  @Test fun explicitDocumentAndAllBlockDocuments() {
    val e = engineOf("||malware.example^\$document", "||everything.example^\$all")
    e.assertBlocked("https://malware.example/", page = null, type = ResourceType.DOCUMENT)
    e.assertAllowed("https://malware.example/a.js", type = ResourceType.SCRIPT)
    e.assertBlocked("https://everything.example/", page = null, type = ResourceType.DOCUMENT)
    e.assertBlocked("https://everything.example/a.js", type = ResourceType.SCRIPT)
  }

  @Test fun otherGuessOnlyHitsUntypedOrOtherRules() {
    val e = engineOf("||s.example^\$script", "||o.example^\$other", "||n.example^")
    e.assertAllowed("https://s.example/a", type = ResourceType.OTHER)
    e.assertBlocked("https://o.example/a", type = ResourceType.OTHER)
    e.assertBlocked("https://n.example/a", type = ResourceType.OTHER)
  }

  @Test fun typedExceptionOnlyCoversItsTypes() {
    val e = engineOf("||ads.example^", "@@||ads.example^\$image")
    e.assertAllowed("https://ads.example/a.png", type = ResourceType.IMAGE)
    e.assertBlocked("https://ads.example/a.js", type = ResourceType.SCRIPT)
  }

  @Test fun popupRulesIgnoredButNegatedPopupIsHarmless() {
    val e = engineOf("||pop.example^\$popup,third-party", "||nopop.example^\$~popup")
    e.assertAllowed("https://pop.example/", page = "https://a.com/", type = ResourceType.SUBDOCUMENT)
    e.assertBlocked("https://nopop.example/a.js")
  }

  @Test fun objectTypeMixedWithMappedTypes() {
    val e = engineOf("||obj.example^\$object,script", "||negobj.example^\$~object")
    e.assertBlocked("https://obj.example/a.js", type = ResourceType.SCRIPT)
    e.assertAllowed("https://obj.example/a.png", type = ResourceType.IMAGE)
    e.assertBlocked("https://negobj.example/a.png", type = ResourceType.IMAGE)
  }
}
