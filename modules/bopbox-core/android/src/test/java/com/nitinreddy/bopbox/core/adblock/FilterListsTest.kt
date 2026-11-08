package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FilterListsTest {
  @Test fun constants() {
    assertEquals("https://easylist.to/easylist/easylist.txt", FilterLists.EASYLIST_URL)
    assertEquals("https://easylist.to/easylist/easyprivacy.txt", FilterLists.EASYPRIVACY_URL)
    assertEquals("bopbox/filters/easylist.txt", FilterLists.assetPath(FilterLists.EASYLIST_ASSET))
    assertEquals(
      listOf(
        "easylist.txt",
        "easyprivacy.txt",
        "ubo-filters.txt",
        "ubo-quick-fixes.txt",
        "ubo-privacy.txt",
        "ubo-unbreak.txt",
        "bopbox-extras.txt",
      ),
      FilterLists.BUNDLED_ASSETS,
    )
    assertEquals(FilterLists.EASYPRIVACY_URL, FilterLists.UPDATE_URLS[FilterLists.EASYPRIVACY_ASSET])
    assertEquals(
      "https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt",
      FilterLists.UPDATE_URLS[FilterLists.UBO_QUICK_FIXES_ASSET],
    )
    // Every list except our own hand-made extras refreshes from its publisher.
    assertEquals(FilterLists.BUNDLED_ASSETS - FilterLists.EXTRAS_ASSET, FilterLists.UPDATE_URLS.keys.toList())
  }

  @Test fun acceptsAdblockHeader() {
    assertTrue(FilterLists.looksValid("[Adblock Plus 2.0]\n! Title: x\n||ads.example^\n"))
  }

  @Test fun acceptsLargeHeaderlessLists() {
    val hosts = (1..1500).joinToString("\n") { "0.0.0.0 ads$it.example.com" }
    assertTrue(FilterLists.looksValid("# hosts\n$hosts"))
    val abp = (1..1200).joinToString("\n") { "||t$it.example^" }
    assertTrue(FilterLists.looksValid(abp))
  }

  @Test fun rejectsHtmlEmptyAndTiny() {
    assertFalse(FilterLists.looksValid(""))
    assertFalse(FilterLists.looksValid("   \n"))
    assertFalse(FilterLists.looksValid("<!DOCTYPE html><html><body>Login to Wi-Fi</body></html>"))
    assertFalse(FilterLists.looksValid("\n<html><head><title>502</title></head></html>"))
    assertFalse(FilterLists.looksValid("[Adblock Plus 2.0]\n<html><body>oops</body></html>"))
    assertFalse(FilterLists.looksValid("||a.example^\n||b.example^"))
    assertFalse(FilterLists.looksValid("[Adblock Plus 2.0]\n! only comments"))
  }
}
