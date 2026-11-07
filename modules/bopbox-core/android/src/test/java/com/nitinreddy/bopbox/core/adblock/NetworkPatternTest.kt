package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NetworkPatternTest {
  @Test fun hostAnchorMatchesDomainAndSubdomains() {
    val e = engineOf("||ads.example.net^")
    e.assertBlocked("https://ads.example.net/x.js", rule = "||ads.example.net^")
    e.assertBlocked("http://ads.example.net")
    e.assertBlocked("https://cdn.ads.example.net/x.js")
    e.assertBlocked("https://ads.example.net:8443/x.js")
    e.assertAllowed("https://badads.example.net/x.js")
    e.assertAllowed("https://ads.example.net.evil.org/x.js")
    e.assertAllowed("https://example.net/ads.example.net/x.js")
    e.assertAllowed("https://other.com/?u=https://ads.example.net/")
  }

  @Test fun hostAnchorWithPath() {
    val e = engineOf("||youtube.com/pagead/")
    e.assertBlocked("https://www.youtube.com/pagead/conversion?x=1")
    e.assertBlocked("https://youtube.com/pagead/")
    e.assertAllowed("https://www.youtube.com/watch?v=pagead")
    e.assertAllowed("https://notyoutube.com/pagead/")
  }

  @Test fun hostAnchorPrefixWithoutSeparator() {
    val e = engineOf("||adserver.")
    e.assertBlocked("https://adserver.foo.com/a")
    e.assertBlocked("https://x.adserver.foo.com/a")
    e.assertAllowed("https://myadserver.foo.com/a")
  }

  @Test fun startAndEndAnchors() {
    val e = engineOf("|https://track.", "swf|")
    e.assertBlocked("https://track.example.org/p")
    e.assertAllowed("http://track.example.org/p")
    e.assertAllowed("https://example.org/?r=https://track.x")
    e.assertBlocked("https://example.org/movie.swf")
    e.assertAllowed("https://example.org/movie.swf?x=1")
  }

  @Test fun wildcards() {
    val e = engineOf("/banner/*/img^", "||cdn.example.org/*/ads/*.js")
    e.assertBlocked("https://foo.com/banner/123/img/x.png")
    e.assertBlocked("https://foo.com/banner/a/b/img?x")
    e.assertAllowed("https://foo.com/banner/img/x.png")
    e.assertBlocked("https://cdn.example.org/v1/ads/a.js?z=1")
    e.assertAllowed("https://cdn.example.org/ads/a.css")
  }

  @Test fun separatorCharacter() {
    val e = engineOf("^ad.php^", "||sep.example^")
    e.assertBlocked("https://a.com/ad.php?x=1")
    e.assertBlocked("https://a.com/ad.php")
    e.assertBlocked("https://a.com/x/ad.php/y")
    e.assertAllowed("https://a.com/bad.php")
    e.assertAllowed("https://a.com/ad.php5")
    e.assertAllowed("https://a.com/ad.php-x")
    e.assertBlocked("https://sep.example:80/")
    e.assertAllowed("https://sep.examples/")
  }

  @Test fun plainSubstring() {
    val e = engineOf("-ad-banner-", "&ad_type=")
    e.assertBlocked("https://a.com/img/top-ad-banner-1.png", type = ResourceType.IMAGE)
    e.assertBlocked("https://a.com/x?y=1&ad_type=video")
    e.assertAllowed("https://a.com/img/top-banner-1.png", type = ResourceType.IMAGE)
  }

  @Test fun caseInsensitiveByDefaultAndMatchCase() {
    val e = engineOf("/AdFrame/*", "/TrackMe/*\$match-case")
    e.assertBlocked("https://a.com/adframe/x")
    e.assertBlocked("https://A.COM/ADFRAME/x")
    e.assertBlocked("https://a.com/TrackMe/x")
    e.assertAllowed("https://a.com/trackme/x")
  }

  @Test fun regexRules() {
    val e = engineOf("/^https?:\\/\\/[a-z]{8}\\.xyz\\/[0-9]+\\.js/\$script", "/banner\\d+\\.gif\$/")
    e.assertBlocked("https://abcdefgh.xyz/123.js")
    e.assertAllowed("https://abcdefgh.xyz/123.js", type = ResourceType.IMAGE)
    e.assertAllowed("https://abc.xyz/123.js")
    e.assertBlocked("https://a.com/banner42.gif", type = ResourceType.IMAGE)
    e.assertBlocked("https://a.com/BANNER42.GIF", type = ResourceType.IMAGE)
    e.assertAllowed("https://a.com/banner42.gif?x", type = ResourceType.IMAGE)
  }

  @Test fun invalidRegexIsIgnored() {
    val e = engineOf("/ads[(/")
    assertEquals(0, e.networkRuleCount)
  }

  @Test fun hostsFileSyntax() {
    val e = engineOf(
      "# hosts comment",
      "127.0.0.1 localhost",
      "0.0.0.0 ads.tracker.io # trailing comment",
      "127.0.0.1\tmetrics.example.com other.example.com",
      "::1 v6.example.com",
    )
    e.assertBlocked("https://ads.tracker.io/x", rule = "||ads.tracker.io^")
    e.assertBlocked("https://sub.metrics.example.com/x")
    e.assertBlocked("https://other.example.com/x")
    e.assertBlocked("https://v6.example.com/x")
    e.assertAllowed("http://localhost/x")
    assertEquals(4, e.networkRuleCount)
  }

  @Test fun bareDomainLines() {
    val e = engineOf("doubleclick-like.net", "_chartbeat.js")
    e.assertBlocked("https://x.doubleclick-like.net/p", rule = "||doubleclick-like.net^")
    e.assertAllowed("https://a.com/?ref=doubleclick-like.net")
    // `_chartbeat.js` is an ABP substring rule, not a domain.
    e.assertBlocked("https://a.com/js/_chartbeat.js")
  }

  @Test fun ignoresCommentsHeadersAndJunk() {
    val e = engineOf("[Adblock Plus 2.0]", "! Title: x", "", "   ", "#comment", "||ok.example^")
    assertEquals(1, e.networkRuleCount)
  }

  @Test fun noMatchReturnsNullRule() {
    val r = engineOf("||ads.example^").check("https://news.example/")
    assertEquals(Verdict.ALLOW, r.verdict)
    assertNull(r.rule)
  }

  @Test fun nonHttpUrlsAreNeverFiltered() {
    val e = engineOf("data", "blob")
    e.assertAllowed("data:image/png;base64,AAAA")
    e.assertAllowed("blob:https://a.com/1234")
  }

  @Test fun websocketUrls() {
    val e = engineOf("||socket.ads.example^\$websocket")
    e.assertBlocked("wss://socket.ads.example/ws", type = ResourceType.WEBSOCKET)
    e.assertAllowed("wss://socket.ads.example/ws", type = ResourceType.XHR)
  }

  @Test fun unsupportedModifiersSkipTheRule() {
    val rules = listOf(
      "||a.example^\$removeparam=utm_source",
      "||b.example^\$csp=script-src 'none'",
      "||c.example^\$header=x-ad:1",
      "||d.example^\$permissions=geolocation=()",
      "||e.example^\$replace=/ad/x/",
      "||f.example^\$redirect-rule=noopjs",
      "||g.example^\$popup",
      "||h.example^\$rewrite=abp-resource:blank-js",
      "||i.example^\$totallyunknown",
      "||j.example^\$genericblock",
      "||k.example^\$elemhide", // only valid on exceptions
      "||l.example^\$object", // no OBJECT type
      "||m.example^\$domain=/regex/",
    )
    val e = engineOf(*rules.toTypedArray())
    assertEquals(0, e.networkRuleCount)
    for (c in 'a'..'m') {
      for (t in ResourceType.values()) e.assertAllowed("https://$c.example/ad.js", type = t)
    }
  }

  @Test fun redirectIsTreatedAsBlock() {
    val e = engineOf("||ima.example/sdk.js\$script,redirect=google-ima.js", "||vid.example^\$mp4")
    e.assertBlocked("https://ima.example/sdk.js")
    e.assertBlocked("https://vid.example/a", type = ResourceType.MEDIA)
    e.assertAllowed("https://vid.example/a", type = ResourceType.SCRIPT)
  }

  @Test fun dollarInsideRegexIsNotOptions() {
    val e = engineOf("/\\/ad[0-9]+\\.js\$/\$script")
    e.assertBlocked("https://a.com/ad12.js")
    e.assertAllowed("https://a.com/ad12.js?x")
  }

  @Test fun emptyPatternOnlyAcceptedWithDomainScope() {
    val e = engineOf("\$script", "*\$image", "\$websocket,domain=bad.example")
    assertEquals(1, e.networkRuleCount)
    e.assertAllowed("https://anything.com/a.js")
    e.assertBlocked("wss://x.com/s", page = "https://bad.example/", type = ResourceType.WEBSOCKET)
    e.assertAllowed("wss://x.com/s", page = "https://good.example/", type = ResourceType.WEBSOCKET)
  }

  @Test fun duplicatesAreHarmlessAndAllDisabledByBadfilter() {
    val e = FilterEngine.parse(listOf("||dup.example^\n||dup.example^", "||dup.example^"))
    e.assertBlocked("https://dup.example/a.js", rule = "||dup.example^")
    val bad = FilterEngine.parse(listOf("||dup.example^\n||dup.example^", "||dup.example^\$badfilter"))
    bad.assertAllowed("https://dup.example/a.js")
  }

  @Test fun cosmeticLinesAreNotNetworkRules() {
    val e = engineOf("example.com##.ad", "##.banner", "example.com#?#.x:has-text(ad)")
    assertEquals(0, e.networkRuleCount)
    e.assertAllowed("https://example.com/.ad")
  }
}
