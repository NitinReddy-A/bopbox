package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.SiteMode
import com.nitinreddy.bopbox.core.settings.Settings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsTest {
  @Test fun `defaults are sane`() {
    val s = Settings()
    assertTrue(s.adblockFor("youtube"))
    assertEquals(SiteMode.MOBILE, s.modeFor("youtube"))
    assertEquals("auto", s.defaultQuality)
    assertEquals("1", s.defaultSpeed)
    assertTrue(s.returnDislike)
    assertTrue(s.swipeControls)
    assertFalse(s.hideShorts)
    assertFalse(s.alwaysRepeat)
  }

  @Test fun `round trips through flat map`() {
    val s = Settings().patched(
      mapOf(
        "theme" to "dark",
        "siteMode" to "desktop",
        "autoPip" to false,
        "defaultQuality" to "1080",
        "defaultSpeed" to "1.5",
        "hideShorts" to true,
        "alwaysRepeat" to true,
        "returnDislike" to false,
      ),
    )
    assertEquals(s, Settings.fromMap(s.toMap()))
    assertEquals(SiteMode.DESKTOP, s.modeFor("youtube"))
  }

  @Test fun `every setting key round trips`() {
    val keys = Settings().toMap().keys
    for (key in keys) {
      val value = Settings().toMap()[key]
      assertEquals(key, Settings().patched(mapOf(key to value)).toMap()[key], value)
    }
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects unknown keys`() {
    Settings().patched(mapOf("nope" to true))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects a speed that is not on the list`() {
    Settings().patched(mapOf("defaultSpeed" to "4"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects a quality that is not on the list`() {
    Settings().patched(mapOf("defaultQuality" to "999"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects wrong types`() {
    Settings().patched(mapOf("autoPip" to "yes"))
  }

  @Test fun `corrupt persisted values fall back to defaults`() {
    val s = Settings.fromMap(mapOf("theme" to 42, "autoPip" to false, "garbage" to "x", "launchTarget" to "home"))
    assertEquals("system", s.theme)
    assertFalse(s.autoPip)
  }

  @Test fun `catalog is youtube only and resolves its urls`() {
    assertEquals(listOf("youtube"), AppCatalog.all.map { it.id })
    assertEquals("youtube", AppCatalog.forUrl("https://youtu.be/abc")?.id)
    assertEquals("youtube", AppCatalog.forUrl("https://music.youtube.com/watch?v=1")?.id)
    assertNull(AppCatalog.forUrl("https://open.spotify.com/track/1"))
    assertTrue(AppCatalog.YOUTUBE.isInternal("https://accounts.google.com/signin"))
    assertFalse(AppCatalog.YOUTUBE.isInternal("https://example.com"))
  }
}
