package com.nitinreddy.bopbox.core

import com.nitinreddy.bopbox.core.util.UrlUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlUtilsTest {
  @Test fun `extracts lowercase host`() {
    assertEquals("m.youtube.com", UrlUtils.hostOf("https://M.YouTube.com/watch?v=1"))
    assertNull(UrlUtils.hostOf("not a url"))
  }

  @Test fun `host matching covers subdomains but not lookalikes`() {
    assertTrue(UrlUtils.hostMatches("m.youtube.com", "youtube.com"))
    assertTrue(UrlUtils.hostMatches("youtube.com", "youtube.com"))
    assertFalse(UrlUtils.hostMatches("notyoutube.com", "youtube.com"))
    assertFalse(UrlUtils.hostMatches("youtube.com.evil.io", "youtube.com"))
  }

  @Test fun `base domain handles two level suffixes`() {
    assertEquals("youtube.com", UrlUtils.baseDomain("www.m.youtube.com"))
    assertEquals("bbc.co.uk", UrlUtils.baseDomain("news.bbc.co.uk"))
    assertEquals("localhost", UrlUtils.baseDomain("localhost"))
  }

  @Test fun `third party compares base domains`() {
    assertFalse(UrlUtils.isThirdParty("i.ytimg.com".let { "www.youtube.com" }, "m.youtube.com"))
    assertTrue(UrlUtils.isThirdParty("doubleclick.net", "m.youtube.com"))
    assertFalse(UrlUtils.isThirdParty("doubleclick.net", null))
  }

  @Test fun `typed input becomes url only when it looks like one`() {
    assertEquals("https://example.com/a", UrlUtils.asUrlOrNull("example.com/a"))
    assertEquals("http://x.io", UrlUtils.asUrlOrNull("http://x.io"))
    assertNull(UrlUtils.asUrlOrNull("lofi beats"))
    assertNull(UrlUtils.asUrlOrNull("taylorswift"))
  }

  @Test fun `encodes path segments with %20`() {
    assertEquals("lofi%20beats", UrlUtils.encodePath("lofi beats"))
    assertEquals("lofi+beats", UrlUtils.encode("lofi beats"))
  }
}
