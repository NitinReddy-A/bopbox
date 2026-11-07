package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.SiteMode
import com.nitinreddy.bopbox.core.browser.PageScripts
import com.nitinreddy.bopbox.core.browser.UserAgents
import com.nitinreddy.bopbox.core.media.BridgeMessage
import com.nitinreddy.bopbox.core.media.BridgeProtocol
import com.nitinreddy.bopbox.core.media.MediaCommand
import com.nitinreddy.bopbox.core.media.NowPlaying
import com.nitinreddy.bopbox.core.settings.Settings
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class BridgeAndScriptsTest {
  @Test fun `parses media state from the page`() {
    val raw = """{"t":"media","title":"Song","artist":"Band","album":"LP","artwork":"https://i.scdn.co/a.jpg",
      "playing":true,"pos":12.5,"dur":200,"video":false,"ad":false,"actions":["play","pause","nexttrack","seekto"]}"""
    val msg = BridgeProtocol.parse("spotify", raw, 1000) as BridgeMessage.Media
    val s = msg.state
    assertEquals("Song", s.title)
    assertEquals(12_500, s.positionMs)
    assertEquals(200_000, s.durationMs)
    assertTrue(s.canNext)
    assertFalse(s.canPrevious)
    assertTrue(s.canSeek)
    assertEquals("https://i.scdn.co/a.jpg", s.artworkUrl)
  }

  @Test fun `rejects non https artwork, garbage and oversize payloads`() {
    val s = (BridgeProtocol.parse("youtube", """{"t":"media","title":"x","artwork":"javascript:1"}""", 0) as BridgeMessage.Media).state
    assertNull(s.artworkUrl)
    assertNull(BridgeProtocol.parse("youtube", "not json", 0))
    assertNull(BridgeProtocol.parse("youtube", """{"t":"nope"}""", 0))
    assertNull(BridgeProtocol.parse("youtube", "x".repeat(70_000), 0))
  }

  @Test fun `clamps nonsense numbers`() {
    val s = (BridgeProtocol.parse("youtube", """{"t":"media","title":"x","pos":-5,"dur":1e20}""", 0) as BridgeMessage.Media).state
    assertEquals(0, s.positionMs)
    assertEquals(48L * 3600 * 1000, s.durationMs)
    val b = BridgeProtocol.parse("youtube", """{"t":"blocked","n":99999}""", 0) as BridgeMessage.Blocked
    assertEquals(1000, b.count)
  }

  @Test fun `extrapolates position while playing`() {
    val np = NowPlaying(appId = "youtube", title = "t", isPlaying = true, positionMs = 1000, durationMs = 5000, updatedAtMs = 10_000)
    assertEquals(3000, np.positionAt(12_000))
    assertEquals(5000, np.positionAt(99_000))
    assertEquals(1000, np.copy(isPlaying = false).positionAt(12_000))
  }

  @Test fun `media commands parse case insensitively`() {
    assertEquals(MediaCommand.NEXT, MediaCommand.from("Next"))
    assertEquals("pause", MediaCommand.STOP.js)
  }

  @Test(expected = IllegalArgumentException::class)
  fun `unknown media command throws`() {
    MediaCommand.from("explode")
  }

  @Test fun `user agents drop webview markers`() {
    val wv = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36"
    val mobile = UserAgents.mobile(wv)
    assertFalse(mobile.contains("; wv"))
    assertFalse(mobile.contains("Version/4.0"))
    assertTrue(mobile.contains("Chrome/131.0.6778.135 Mobile Safari/537.36"))
    val desktop = UserAgents.forMode(SiteMode.DESKTOP, wv)
    assertTrue(desktop.contains("Windows NT 10.0"))
    assertTrue(desktop.contains("Chrome/131.0.0.0"))
    assertFalse(desktop.contains("Mobile"))
    assertEquals("131", UserAgents.majorVersion(wv))
  }

  @Test fun `page script carries config and site scripts in order`() {
    val script = PageScripts.build(
      AppCatalog.YOUTUBE,
      Settings().patched(mapOf("sponsorBlock" to false)),
      mapOf("m.youtube.com" to listOf(".ad")),
    ) { name -> "/*$name*/" }
    val configJson = script.substringAfter("window.__bopboxConfig=").substringBefore(";})();")
    val cfg = JSONObject(configJson)
    assertEquals("youtube", cfg.getString("app"))
    assertTrue(cfg.getBoolean("adblock"))
    assertFalse(cfg.getBoolean("sponsorBlock"))
    assertEquals(".ad", cfg.getJSONObject("cosmetic").getJSONArray("m.youtube.com").getString(0))
    assertTrue(script.indexOf("/*bridge.js*/") < script.indexOf("/*youtube.js*/"))
  }

  @Test fun `cosmetic rules are dropped when adblock is off for the app`() {
    val script = PageScripts.build(
      AppCatalog.SPOTIFY,
      Settings().patched(mapOf("adblock.spotify" to false)),
      mapOf("open.spotify.com" to listOf(".ad")),
    ) { "" }
    val cfg = JSONObject(script.substringAfter("window.__bopboxConfig=").substringBefore(";})();"))
    assertFalse(cfg.getBoolean("adblock"))
    assertEquals(0, cfg.getJSONObject("cosmetic").length())
    assertTrue(cfg.getBoolean("desktop"))
  }

  @Test fun `commands are json encoded`() {
    assertEquals("window.__bopbox&&window.__bopbox.command(\"seek\",12.0);", PageScripts.command("seek", 12.0))
    assertEquals("window.__bopbox&&window.__bopbox.command(\"a\\\"b\",null);", PageScripts.command("a\"b"))
  }

  @Test fun `scripts are restricted to the app origins`() {
    assertTrue(PageScripts.originsFor(AppCatalog.YOUTUBE).all { it.startsWith("https://") && it.contains("youtube.com") })
    assertEquals(setOf("https://open.spotify.com"), PageScripts.originsFor(AppCatalog.SPOTIFY))
  }

  @Test fun `every script referenced by the catalog exists as an asset`() {
    val dir = File("src/main/assets/bopbox")
    AppCatalog.all.flatMap { it.scripts }.toSet().forEach { name ->
      assertTrue("missing asset $name", File(dir, name).isFile)
    }
  }
}
