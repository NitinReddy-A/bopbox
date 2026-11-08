package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.apps.IncomingLinks
import com.nitinreddy.bopbox.core.browser.SwipeMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val VIEW = "android.intent.action.VIEW"
private const val SEND = "android.intent.action.SEND"

class TubeFeaturesTest {
  @Test fun `opens tapped youtube links`() {
    assertEquals("https://youtu.be/dQw4w9WgXcQ", IncomingLinks.resolve(VIEW, "https://youtu.be/dQw4w9WgXcQ", null))
    assertEquals(
      "https://www.youtube.com/watch?v=abc",
      IncomingLinks.resolve(VIEW, "http://www.youtube.com/watch?v=abc", null),
    )
  }

  @Test fun `pulls the link out of shared text`() {
    val text = "Check this out! https://youtube.com/shorts/xyz123?si=AbC. So good"
    assertEquals("https://youtube.com/shorts/xyz123?si=AbC", IncomingLinks.resolve(SEND, null, text))
  }

  @Test fun `ignores links that are not youtube`() {
    assertNull(IncomingLinks.resolve(VIEW, "https://example.com/watch?v=1", null))
    assertNull(IncomingLinks.resolve(SEND, null, "no links here"))
    assertNull(IncomingLinks.resolve(VIEW, "javascript:alert(1)", null))
    assertNull(IncomingLinks.resolve("android.intent.action.MAIN", "https://youtu.be/x", null))
  }

  @Test fun `swiping up raises the level, down lowers it, clamped`() {
    val height = 1000
    assertEquals(0.5f + 100f / (height * SwipeMath.SWEEP), SwipeMath.level(0.5f, -100f, height), 1e-4f)
    assertEquals(0.5f - 100f / (height * SwipeMath.SWEEP), SwipeMath.level(0.5f, 100f, height), 1e-4f)
    assertEquals(1f, SwipeMath.level(0.9f, -5000f, height))
    assertEquals(0f, SwipeMath.level(0.1f, 5000f, height))
    assertEquals(0.3f, SwipeMath.level(0.3f, 50f, 0))
  }

  @Test fun `only clearly vertical moves past the slop become swipes`() {
    assertTrue(SwipeMath.isVerticalSwipe(dx = 4f, dy = 40f, slop = 16))
    assertFalse(SwipeMath.isVerticalSwipe(dx = 40f, dy = 40f, slop = 16))
    assertFalse(SwipeMath.isVerticalSwipe(dx = 0f, dy = 10f, slop = 16))
  }

  @Test fun `system gesture bands are left alone`() {
    assertTrue(SwipeMath.inGestureBand(10f, 1000))
    assertTrue(SwipeMath.inGestureBand(990f, 1000))
    assertFalse(SwipeMath.inGestureBand(500f, 1000))
  }
}
