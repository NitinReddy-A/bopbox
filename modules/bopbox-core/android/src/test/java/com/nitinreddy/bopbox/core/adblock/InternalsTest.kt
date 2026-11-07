package com.nitinreddy.bopbox.core.adblock

import com.nitinreddy.bopbox.core.util.UrlUtils
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InternalsTest {
  @Test fun globSegments() {
    assertTrue(Glob.match("a*b*c", "xxaxxbxxc", 0, false, false))
    assertFalse(Glob.match("a*b*c", "xxaxxcxxb", 0, false, false))
    assertTrue(Glob.match("a*b", "ab", 0, true, true))
    assertTrue(Glob.match("a*b", "axxbxxb", 0, true, true))
    assertFalse(Glob.match("a*b", "axxbxxc", 0, true, true))
    assertTrue(Glob.match("ab^", "xab", 0, false, false)) // ^ matches end of URL
    assertTrue(Glob.match("ab^", "xab/", 0, false, true))
    assertFalse(Glob.match("ab^", "xabc", 0, false, false))
    assertTrue(Glob.match("^ad^", "/x/ad/", 0, false, false))
    assertTrue(Glob.match("^ad^*x", "/ad-/ad?x", 0, false, false))
    assertFalse(Glob.match("x", "abc", 0, true, false))
    assertTrue(Glob.match("", "abc", 0, false, false))
    assertTrue(Glob.match("b*", "abc", 1, true, false))
  }

  @Test fun regexRequiredLiteral() {
    assertEquals("104.154.", RegexLiteral.required("(https?:\\/\\/)104\\.154\\..{100,}"))
    assertEquals("/invoke.js", RegexLiteral.required("\\/[0-9a-f]{32}\\/invoke\\.js"))
    assertEquals("", RegexLiteral.required("foo|barbaz"))
    assertEquals("ab", RegexLiteral.required("abc?ba"))
    assertEquals(".amazonaws.com/", RegexLiteral.required("^https?:\\/\\/s3\\.*\\.amazonaws\\.com\\/[a-f0-9]{45,}"))
    assertEquals("", RegexLiteral.required("(foo|bar)"))
    assertEquals("ad", RegexLiteral.required("\\dad\\w"))
  }

  @Test fun sameSiteMatchesUrlUtils() {
    val hosts = listOf(
      "a.com", "www.a.com", "x.y.a.com", "b.com", "bbc.co.uk", "www.bbc.co.uk", "other.co.uk", "co.uk", "localhost",
      "m.youtube.com", "youtube.com", "i.ytimg.com", "open.spotify.com", "spclient.wg.spotify.com", "a.b.com.au",
    )
    for (a in hosts) for (b in hosts) {
      assertEquals("$a vs $b", !UrlUtils.isThirdParty(a, b), Domains.sameSite(a, b))
    }
  }

  @Test fun urlHostBounds() {
    assertEquals("a.b.com", UrlHost.hostOf("https://user:pw@A.B.com:8080/p?q#f"))
    assertEquals("x.com", UrlHost.hostOf("http://x.com"))
    assertEquals("x.com", UrlHost.hostOf("http://x.com.?a"))
    assertEquals("[::1]", UrlHost.hostOf("http://[::1]:80/"))
    assertEquals(null, UrlHost.hostOf("data:text/plain,hi"))
  }

  @Test fun urlTokensAreDistinct() {
    val t = Tokens.tokenizeUrl("https://ads.ads.com/ads?x=1")
    assertEquals(t.toSet().size, t.size)
    assertEquals(3, t.size) // https, ads, com (single-char tokens are skipped)
  }

  @Test fun safePatternTokens() {
    fun h(s: String) = Tokens.hash(s, 0, s.length)
    assertArrayEquals(intArrayOf(h("ads"), h("example"), h("com")), Tokens.safePatternTokens("ads.example.com^", true, false))
    assertArrayEquals(intArrayOf(h("example")), Tokens.safePatternTokens("ads.example.com", false, false))
    assertArrayEquals(intArrayOf(), Tokens.safePatternTokens("ads*", true, false))
    assertArrayEquals(intArrayOf(h("banner")), Tokens.safePatternTokens("/banner/*/img", false, false))
  }

  @Test fun lookupKeysIncludeSuffixesAndEntities() {
    val keys = Domains.lookupKeys("www.google.co.uk")
    assertTrue(keys.containsAll(listOf("www.google.co.uk", "google.co.uk", "co.uk", "uk", "google.*", "www.google.*")))
  }
}
