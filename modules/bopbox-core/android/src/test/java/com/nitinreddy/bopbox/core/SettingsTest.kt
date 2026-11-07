package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.apps.SiteMode
import com.nitinreddy.bopbox.core.settings.Settings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsTest {
  @Test fun `defaults are sane`() {
    val s = Settings()
    assertTrue(s.adblockFor("youtube"))
    assertEquals(SiteMode.MOBILE, s.modeFor("youtube"))
    assertEquals(SiteMode.DESKTOP, s.modeFor("spotify"))
    assertEquals("home", s.launchTarget)
  }

  @Test fun `global switch overrides per app`() {
    val s = Settings().patched(mapOf("adblockEnabled" to false))
    assertFalse(s.adblockFor("youtube"))
    val t = Settings().patched(mapOf("adblock.spotify" to false))
    assertFalse(t.adblockFor("spotify"))
    assertTrue(t.adblockFor("youtube"))
  }

  @Test fun `round trips through flat map`() {
    val s = Settings().patched(
      mapOf("theme" to "dark", "mode.youtube" to "desktop", "autoPip" to false, "launchTarget" to "spotify"),
    )
    assertEquals(s, Settings.fromMap(s.toMap()))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects unknown keys`() {
    Settings().patched(mapOf("nope" to true))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects bad enum values`() {
    Settings().patched(mapOf("theme" to "neon"))
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects wrong types`() {
    Settings().patched(mapOf("autoPip" to "yes"))
  }

  @Test fun `corrupt persisted values fall back to defaults`() {
    val s = Settings.fromMap(mapOf("theme" to 42, "autoPip" to false, "garbage" to "x"))
    assertEquals("system", s.theme)
    assertFalse(s.autoPip)
  }

  @Test fun `catalog resolves urls to apps`() {
    assertEquals("youtube", AppCatalog.forUrl("https://youtu.be/abc")?.id)
    assertEquals("spotify", AppCatalog.forUrl("https://open.spotify.com/track/1")?.id)
    assertEquals(null, AppCatalog.forUrl("https://example.com"))
    assertTrue(AppCatalog.YOUTUBE.isInternal("https://accounts.google.com/signin"))
    assertFalse(AppCatalog.YOUTUBE.isInternal("https://example.com"))
  }
}
