package com.nitinreddy.bopbox.core.adblock

import com.nitinreddy.bopbox.core.adblock.ResourceType.DOCUMENT
import com.nitinreddy.bopbox.core.adblock.ResourceType.IMAGE
import com.nitinreddy.bopbox.core.adblock.ResourceType.MEDIA
import com.nitinreddy.bopbox.core.adblock.ResourceType.PING
import com.nitinreddy.bopbox.core.adblock.ResourceType.SCRIPT
import com.nitinreddy.bopbox.core.adblock.ResourceType.STYLESHEET
import com.nitinreddy.bopbox.core.adblock.ResourceType.XHR
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/** Loads the real bundled lists from `src/main/assets` (Gradle runs unit tests in the module dir). */
class BundledListsIntegrationTest {
  companion object {
    private lateinit var engine: FilterEngine
    /** Wall time of the first (cold) parse and best of three parses, in ms. */
    private var coldParseMs = 0L
    private var bestParseMs = 0L

    private fun assetFile(name: String): File {
      val candidates = listOf(
        File("src/main/assets/bopbox/filters/$name"),
        File("modules/bopbox-core/android/src/main/assets/bopbox/filters/$name"),
      )
      return candidates.firstOrNull { it.isFile } ?: error("missing asset $name (cwd=${File(".").absolutePath})")
    }

    private fun loadTexts(): List<String> = FilterLists.BUNDLED_ASSETS.map { assetFile(it).readText() }

    @BeforeClass @JvmStatic
    fun setUp() {
      val texts = loadTexts()
      val times = LongArray(3) {
        val t0 = System.nanoTime()
        engine = FilterEngine.parse(texts)
        (System.nanoTime() - t0) / 1_000_000
      }
      coldParseMs = times[0]
      // Best-of-N so a busy machine (emulator, parallel builds) does not turn scheduler delays
      // into failures; the cold number is still reported.
      bestParseMs = times.min()
      println(
        "Parsed bundled lists: cold $coldParseMs ms, best $bestParseMs ms (${times.joinToString()}): " +
          "${engine.networkRuleCount} network, ${engine.cosmeticRuleCount} cosmetic rules",
      )
    }
  }

  @Test fun bundledListsLookValid() {
    for (name in FilterLists.BUNDLED_ASSETS.filter { it != FilterLists.EXTRAS_ASSET }) {
      assertTrue(name, FilterLists.looksValid(assetFile(name).readText()))
    }
  }

  @Test fun parsesQuicklyAndCompletely() {
    assertTrue("parse took $bestParseMs ms (cold $coldParseMs ms)", bestParseMs < 3000)
    assertTrue("network rules: ${engine.networkRuleCount}", engine.networkRuleCount > 30_000)
    assertTrue("cosmetic rules: ${engine.cosmeticRuleCount}", engine.cosmeticRuleCount > 5_000)
  }

  @Test fun blocksObviousAds() {
    engine.assertBlocked("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://example.com/", SCRIPT)
    engine.assertBlocked("https://googleads.g.doubleclick.net/pagead/id", "https://example.com/", XHR)
    engine.assertBlocked("https://securepubads.g.doubleclick.net/tag/js/gpt.js", "https://open.spotify.com/", SCRIPT)
    engine.assertBlocked("https://www.googletagservices.com/tag/js/gpt.js", "https://example.com/", SCRIPT)
    engine.assertBlocked("https://www.google-analytics.com/analytics.js", "https://example.com/", SCRIPT)
    engine.assertBlocked("https://m.youtube.com/pagead/viewthroughconversion/123/?x=1", "https://m.youtube.com/watch?v=a", IMAGE)
    engine.assertBlocked("https://m.youtube.com/api/stats/ads?ver=2&ad_cpn=x", "https://m.youtube.com/watch?v=a", PING)
    engine.assertBlocked("https://m.youtube.com/ptracking?pltype=adhost", "https://m.youtube.com/watch?v=a", PING)
    engine.assertBlocked("https://spclient.wg.spotify.com/ads/v2/config", "https://open.spotify.com/", XHR)
    engine.assertBlocked("https://spclient.wg.spotify.com/ad-logic/state/config", "https://open.spotify.com/", XHR)
    engine.assertBlocked("https://adeventtracker.spotify.com/v1/events", "https://open.spotify.com/", XHR)
  }

  @Test fun neverBreaksYouTubePlayback() {
    val page = "https://m.youtube.com/watch?v=dQw4w9WgXcQ"
    val video = "https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&itag=18&source=youtube&mime=video%2Fmp4"
    for (t in listOf(MEDIA, XHR, ResourceType.OTHER)) engine.assertAllowed(video, page, t)
    engine.assertAllowed("https://m.youtube.com/", null, DOCUMENT)
    engine.assertAllowed(page, page, DOCUMENT)
    engine.assertAllowed("https://m.youtube.com/youtubei/v1/player?key=x&prettyPrint=false", page, XHR)
    engine.assertAllowed("https://m.youtube.com/youtubei/v1/next?key=x", page, XHR)
    engine.assertAllowed("https://m.youtube.com/youtubei/v1/browse?key=x", page, XHR)
    engine.assertAllowed("https://m.youtube.com/youtubei/v1/search?key=x", page, XHR)
    engine.assertAllowed("https://i.ytimg.com/vi/abc/hqdefault.jpg", page, IMAGE)
    engine.assertAllowed("https://i.ytimg.com/vi_webp/abc/mqdefault.webp", page, IMAGE)
    engine.assertAllowed("https://m.youtube.com/s/player/abc123/player-plasma-ias-phone-en_US.vflset/base.js", page, SCRIPT)
    engine.assertAllowed("https://m.youtube.com/s/_/ytmweb/_/js/k=ytmweb.base_m.en_US.abc/m=base", page, SCRIPT)
    engine.assertAllowed("https://m.youtube.com/s/_/ytmweb/_/ss/k=ytmweb.base.abc/m=base", page, STYLESHEET)
    engine.assertAllowed("https://yt3.ggpht.com/ytc/abc=s88-c-k-c0x00ffffff-no-rj", page, IMAGE)
    engine.assertAllowed("https://fonts.gstatic.com/s/roboto/v30/abc.woff2", page, ResourceType.FONT)
    engine.assertAllowed("https://www.youtube.com/iframe_api", page, SCRIPT)
  }

  @Test fun neverBreaksSpotifyPlayback() {
    val page = "https://open.spotify.com/"
    engine.assertAllowed("https://open.spotify.com/", null, DOCUMENT)
    engine.assertAllowed("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", page, DOCUMENT)
    engine.assertAllowed("https://spclient.wg.spotify.com/melody/v1/msg/batch", page, XHR)
    engine.assertAllowed("https://spclient.wg.spotify.com/metadata/4/track/abc?market=from_token", page, XHR)
    engine.assertAllowed("https://spclient.wg.spotify.com/storage-resolve/v2/files/audio/interactive/10/abc?alt=json", page, XHR)
    engine.assertAllowed("https://spclient.wg.spotify.com/track-playback/v1/devices", page, XHR)
    engine.assertAllowed("https://spclient.wg.spotify.com/playlist/v2/playlist/abc", page, XHR)
    engine.assertAllowed("https://api-partner.spotify.com/pathfinder/v1/query?operationName=home", page, XHR)
    engine.assertAllowed("https://audio4-ak-spotify-com.akamaized.net/audio/abc", page, MEDIA)
    engine.assertAllowed("https://audio4-ak-spotify-com.akamaized.net/audio/abc?__token__=x", page, XHR)
    engine.assertAllowed("https://audio-fa.scdn.co/audio/abc", page, MEDIA)
    engine.assertAllowed("https://open.spotifycdn.com/cdn/build/web-player/web-player.abc.js", page, SCRIPT)
    engine.assertAllowed("https://i.scdn.co/image/ab67616d0000b273abc", page, IMAGE)
    engine.assertAllowed("https://apresolve.spotify.com/?type=dealer&type=spclient", page, XHR)
    engine.assertAllowed("wss://dealer.spotify.com/?access_token=x", page, ResourceType.WEBSOCKET)
    engine.assertAllowed("https://accounts.spotify.com/login", null, DOCUMENT)
  }

  @Test fun cosmeticsForTargetSites() {
    val yt = engine.cosmeticSelectors("m.youtube.com")
    assertTrue(yt.toString(), "ytm-promoted-sparkles-web-renderer" in yt)
    assertTrue(yt.toString(), "ad-slot-renderer" in yt)
    assertTrue(engine.cosmeticSelectors("open.spotify.com").contains("[data-testid=\"upsell-banner\"]"))
    // EasyList disables generic hiding on open.spotify.com via $generichide.
    val spotifyAll = engine.cosmeticSelectors("open.spotify.com", includeGeneric = true)
    assertFalse(spotifyAll.size > 1000)
    val generic = engine.cosmeticSelectors("some-news-site.example", includeGeneric = true)
    assertTrue(generic.size > 1000)
    for (sel in generic) assertFalse(sel, sel.contains(":has-text(") || sel.contains(":-abp-") || sel.startsWith("+js("))
    assertTrue(engine.scriptletsFor("m.youtube.com").any { it.startsWith("json-prune") })
  }

  @Test fun averageMatchTimeIsSmall() {
    val urls = syntheticUrls(10_000)
    val pages = listOf("https://m.youtube.com/watch?v=x", "https://open.spotify.com/", "https://news.example.com/a")
    val types = ResourceType.values()
    var blocked = 0
    // Warm up the JIT, then report the best of several rounds so a busy machine does not turn
    // scheduler noise into a failure.
    for (i in urls.indices) engine.match(Request(urls[i], pages[i % pages.size], types[i % types.size]))
    var bestUs = Double.MAX_VALUE
    for (round in 0 until 5) {
      val t0 = System.nanoTime()
      for (i in urls.indices) {
        if (engine.match(Request(urls[i], pages[i % pages.size], types[(i + round) % types.size])).blocked) blocked++
      }
      bestUs = minOf(bestUs, (System.nanoTime() - t0) / 1000.0 / urls.size)
    }
    println("Average match time: ${"%.2f".format(bestUs)} us per request (best of 5 rounds x ${urls.size}, $blocked blocked)")
    assertTrue("average match $bestUs us", bestUs < 50.0)
    assertTrue(blocked > 0)
  }

  private fun syntheticUrls(n: Int): List<String> {
    val rnd = java.util.Random(42)
    val hosts = listOf(
      "m.youtube.com", "rr3---sn-abc.googlevideo.com", "i.ytimg.com", "open.spotify.com", "spclient.wg.spotify.com",
      "googleads.g.doubleclick.net", "pagead2.googlesyndication.com", "www.google-analytics.com",
      "cdn.jsdelivr.net", "news.example.com", "static.example.org", "ads.example.net", "tracker.io",
      "audio4-ak-spotify-com.akamaized.net", "fonts.gstatic.com", "connect.facebook.net",
    )
    val paths = listOf(
      "/videoplayback?expire=%d&ei=abc&ip=1.2.3.4&id=o-ab&itag=243&aitags=133%%2C134&source=youtube&requiressl=yes&mime=video%%2Fwebm&dur=212.1&lmt=%d",
      "/youtubei/v1/player?key=%d", "/vi/%d/hqdefault.jpg", "/assets/app.%d.js", "/pagead/js/adsbygoogle.js?client=ca-pub-%d",
      "/analytics.js?v=%d", "/tr?id=%d&ev=PageView", "/audio/%d", "/banner/ad-%d.gif", "/api/stats/ads?cpn=%d",
      "/s/player/%d/base.js", "/melody/v1/msg/batch?%d", "/css/site.%d.css", "/collect?v=1&tid=UA-%d",
    )
    return List(n) { "https://" + hosts[rnd.nextInt(hosts.size)] + paths[rnd.nextInt(paths.size)].format(rnd.nextInt(1_000_000), rnd.nextInt(1_000_000)) }
  }
}
