package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CosmeticFilterTest {
  @Test fun genericSelectorsOnlyWhenRequested() {
    val e = engineOf("##.ad-banner", "###sponsored")
    assertEquals(emptyList<String>(), e.cosmeticSelectors("news.com"))
    assertEquals(listOf(".ad-banner", "#sponsored"), e.cosmeticSelectors("news.com", includeGeneric = true))
  }

  @Test fun hostSpecificMatchesSubdomains() {
    val e = engineOf("example.com##.promo", "other.com##.x")
    assertEquals(listOf(".promo"), e.cosmeticSelectors("example.com"))
    assertEquals(listOf(".promo"), e.cosmeticSelectors("m.example.com"))
    assertEquals(emptyList<String>(), e.cosmeticSelectors("notexample.com"))
  }

  @Test fun multipleDomainsAndExclusions() {
    val e = engineOf("a.com,b.com,~sub.b.com##.ad", "~quiet.com##.generic-ad")
    assertEquals(listOf(".ad"), e.cosmeticSelectors("a.com"))
    assertEquals(listOf(".ad"), e.cosmeticSelectors("www.b.com"))
    assertEquals(emptyList<String>(), e.cosmeticSelectors("sub.b.com"))
    assertEquals(listOf(".generic-ad"), e.cosmeticSelectors("loud.com", includeGeneric = true))
    assertEquals(emptyList<String>(), e.cosmeticSelectors("quiet.com", includeGeneric = true))
  }

  @Test fun entityDomains() {
    val e = engineOf("google.*##.ads")
    assertEquals(listOf(".ads"), e.cosmeticSelectors("www.google.co.uk"))
    assertEquals(listOf(".ads"), e.cosmeticSelectors("google.de"))
  }

  @Test fun exceptionsRemoveSelectors() {
    val e = engineOf("##.ad", "##.banner", "example.com##.box", "example.com#@#.ad", "#@#.banner", "shop.example.com#@#.box")
    assertEquals(listOf(".box"), e.cosmeticSelectors("example.com", includeGeneric = true))
    assertEquals(listOf(".ad"), e.cosmeticSelectors("other.com", includeGeneric = true))
    assertEquals(emptyList<String>(), e.cosmeticSelectors("shop.example.com", includeGeneric = true))
  }

  @Test fun generichideDisablesGenericOnly() {
    for (opt in listOf("generichide", "ghide")) {
      val e = engineOf("##.ad", "example.com##.specific", "@@||example.com^\$$opt")
      assertEquals(listOf(".specific"), e.cosmeticSelectors("example.com", includeGeneric = true))
      assertEquals(listOf(".specific"), e.cosmeticSelectors("www.example.com", includeGeneric = true))
      assertEquals(listOf(".ad"), e.cosmeticSelectors("other.com", includeGeneric = true))
    }
  }

  @Test fun generichideViaDomainOption() {
    val e = engineOf("##.ad", "@@\$generichide,domain=a.com|b.com")
    assertEquals(emptyList<String>(), e.cosmeticSelectors("a.com", includeGeneric = true))
    assertEquals(listOf(".ad"), e.cosmeticSelectors("c.com", includeGeneric = true))
  }

  @Test fun elemhideAndDocumentDisableEverything() {
    val e = engineOf(
      "##.ad", "a.com##.x", "b.com##.y", "c.com##.z",
      "@@||a.com^\$elemhide", "@@||b.com^\$ehide", "@@||c.com^\$document",
    )
    for (h in listOf("a.com", "b.com", "c.com")) assertEquals(emptyList<String>(), e.cosmeticSelectors(h, true))
  }

  @Test fun specifichideDisablesSpecificOnly() {
    val e = engineOf("##.ad", "a.com##.x", "@@||a.com^\$specifichide")
    assertEquals(listOf(".ad"), e.cosmeticSelectors("a.com", includeGeneric = true))
  }

  @Test fun cosmeticControlRulesDoNotAffectNetwork() {
    val e = engineOf("||a.com^", "@@||a.com^\$generichide")
    e.assertBlocked("https://a.com/x.js")
  }

  @Test fun proceduralAndExtendedSyntaxSkipped() {
    val e = engineOf(
      "a.com#?#div:-abp-has(.ad)",
      "a.com#\$#.ad { display: none !important; }",
      "a.com#%#window.x = 1",
      "a.com##div:has-text(Sponsored)",
      "a.com##.x:upward(2)",
      "a.com##.x:xpath(//div)",
      "a.com##.x:matches-css(color: red)",
      "a.com##.x:remove()",
      "a.com##.x:style(color: red)",
      "a.com##^script:has-text(ad)",
      "a.com##.ok:has(> .ad)",
      "a.com##.plain",
      "a.com#@?#.x",
      "[\$path=/page]a.com##.adguard-path",
    )
    assertEquals(listOf(".ok:has(> .ad)", ".plain"), e.cosmeticSelectors("a.com"))
    assertEquals(2, e.cosmeticRuleCount)
  }

  @Test fun deduplicatesAcrossRules() {
    val e = engineOf("##.ad", "a.com##.ad", "a.com,b.com##.ad", "www.a.com##.ad")
    assertEquals(listOf(".ad"), e.cosmeticSelectors("www.a.com", includeGeneric = true))
  }

  @Test fun acceptsUrlsAndOddHostInput() {
    val e = engineOf("a.com##.x")
    assertEquals(listOf(".x"), e.cosmeticSelectors("https://www.A.com/path"))
    assertEquals(listOf(".x"), e.cosmeticSelectors("A.COM."))
    assertEquals(emptyList<String>(), e.cosmeticSelectors(""))
  }

  @Test fun scriptletsParsedAndIndexed() {
    val e = engineOf(
      "youtube.com##+js(json-prune, playerResponse.adPlacements)",
      "youtube.com##+js(set, a.b, false)",
      "music.youtube.com#@#+js(set, a.b, false)",
      "##+js(generic-scriptlet)",
      "nojs.com#@#+js()",
      "other.com##+js(abort-on-property-read, x)",
    )
    assertEquals(
      listOf("json-prune, playerResponse.adPlacements", "set, a.b, false", "generic-scriptlet"),
      e.scriptletsFor("m.youtube.com"),
    )
    assertEquals(listOf("json-prune, playerResponse.adPlacements", "generic-scriptlet"), e.scriptletsFor("music.youtube.com"))
    assertEquals(emptyList<String>(), e.scriptletsFor("nojs.com"))
    // Scriptlets are never returned as CSS selectors.
    assertTrue(e.cosmeticSelectors("m.youtube.com", true).isEmpty())
  }

  @Test fun networkRuleWithHashIsNotCosmetic() {
    val e = engineOf("||a.com/page#frag")
    assertEquals(1, e.networkRuleCount)
    assertFalse(e.cosmeticRuleCount > 0)
  }
}
