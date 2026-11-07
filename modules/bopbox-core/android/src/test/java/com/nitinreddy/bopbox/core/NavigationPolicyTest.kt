package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.apps.AppCatalog
import com.nitinreddy.bopbox.core.browser.NavDecision
import com.nitinreddy.bopbox.core.browser.NavigationPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NavigationPolicyTest {
  private val yt = AppCatalog.YOUTUBE
  private val sp = AppCatalog.SPOTIFY

  @Test fun `own pages load inside`() {
    assertEquals(NavDecision.Inside, NavigationPolicy.decide(yt, "https://m.youtube.com/watch?v=abc", true))
    assertEquals(NavDecision.Inside, NavigationPolicy.decide(sp, "https://accounts.spotify.com/login", true))
  }

  @Test fun `google sign in stays inside both apps`() {
    assertEquals(NavDecision.Inside, NavigationPolicy.decide(yt, "https://accounts.google.com/ServiceLogin", true))
    assertEquals(NavDecision.Inside, NavigationPolicy.decide(sp, "https://accounts.google.com/o/oauth2/auth", true))
  }

  @Test fun `links to the other app switch apps`() {
    assertEquals(
      NavDecision.SwitchApp("spotify", "https://open.spotify.com/track/1"),
      NavigationPolicy.decide(yt, "https://open.spotify.com/track/1", true),
    )
    assertEquals(
      NavDecision.SwitchApp("youtube", "https://youtu.be/xyz"),
      NavigationPolicy.decide(sp, "https://youtu.be/xyz", true),
    )
  }

  @Test fun `unknown sites open externally`() {
    assertEquals(NavDecision.External("https://example.com/"), NavigationPolicy.decide(yt, "https://example.com/", true))
  }

  @Test fun `app nags and store links are swallowed`() {
    assertEquals(NavDecision.Block, NavigationPolicy.decide(yt, "vnd.youtube://watch?v=abc", true))
    assertEquals(NavDecision.Block, NavigationPolicy.decide(sp, "spotify:track:123", true))
    assertEquals(NavDecision.Block, NavigationPolicy.decide(sp, "market://details?id=com.spotify.music", true))
    assertEquals(NavDecision.Block, NavigationPolicy.decide(yt, "intent://watch#Intent;package=com.google.android.youtube;end", true))
  }

  @Test fun `intent fallback urls are honoured`() {
    val intent = "intent://m.youtube.com/watch?v=1#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fm.youtube.com%2Fwatch%3Fv%3D1;end"
    assertEquals(NavDecision.Redirect("https://m.youtube.com/watch?v=1"), NavigationPolicy.decide(yt, intent, true))
    assertNull(NavigationPolicy.intentFallback("intent://x#Intent;S.browser_fallback_url=javascript%3Aalert(1);end"))
  }

  @Test fun `mail and phone links go to the system`() {
    assertEquals(NavDecision.External("mailto:a@b.c"), NavigationPolicy.decide(yt, "mailto:a@b.c", true))
  }

  @Test fun `subframes are never intercepted`() {
    assertEquals(NavDecision.Inside, NavigationPolicy.decide(yt, "https://doubleclick.net/frame", false))
  }

  @Test fun `javascript urls are blocked`() {
    assertEquals(NavDecision.Block, NavigationPolicy.decide(yt, "javascript:alert(1)", true))
  }
}
