package com.nitinreddy.bopbox.core.adblock

import com.nitinreddy.bopbox.core.adblock.ResourceType.DOCUMENT
import com.nitinreddy.bopbox.core.adblock.ResourceType.FONT
import com.nitinreddy.bopbox.core.adblock.ResourceType.IMAGE
import com.nitinreddy.bopbox.core.adblock.ResourceType.MEDIA
import com.nitinreddy.bopbox.core.adblock.ResourceType.OTHER
import com.nitinreddy.bopbox.core.adblock.ResourceType.PING
import com.nitinreddy.bopbox.core.adblock.ResourceType.SCRIPT
import com.nitinreddy.bopbox.core.adblock.ResourceType.STYLESHEET
import com.nitinreddy.bopbox.core.adblock.ResourceType.SUBDOCUMENT
import com.nitinreddy.bopbox.core.adblock.ResourceType.WEBSOCKET
import com.nitinreddy.bopbox.core.adblock.ResourceType.XHR
import org.junit.Assert.assertEquals
import org.junit.Test

class ResourceTypeGuesserTest {
  private fun g(url: String, accept: String? = null, main: Boolean = false, sub: Boolean = false) =
    ResourceTypeGuesser.guess(url, accept, main, sub)

  @Test fun frameFlagsWin() {
    assertEquals(DOCUMENT, g("https://a.com/x.js", "text/html", main = true))
    assertEquals(SUBDOCUMENT, g("https://a.com/frame", null, sub = true))
  }

  @Test fun acceptHeader() {
    assertEquals(SUBDOCUMENT, g("https://a.com/page", "text/html,application/xhtml+xml,*/*;q=0.8"))
    assertEquals(STYLESHEET, g("https://a.com/s", "text/css,*/*;q=0.1"))
    assertEquals(IMAGE, g("https://a.com/i", "image/avif,image/webp,*/*"))
    assertEquals(MEDIA, g("https://a.com/v", "video/webm"))
    assertEquals(MEDIA, g("https://a.com/v", "audio/*"))
    assertEquals(FONT, g("https://a.com/f", "font/woff2"))
    assertEquals(XHR, g("https://a.com/data", "application/json, text/plain, */*"))
    assertEquals(SCRIPT, g("https://a.com/s", "application/javascript"))
  }

  @Test fun wildcardAcceptFallsBackToUrl() {
    assertEquals(SCRIPT, g("https://a.com/app.js?v=1", "*/*"))
    assertEquals(OTHER, g("https://a.com/thing", "*/*"))
  }

  @Test fun extensions() {
    assertEquals(SCRIPT, g("https://a.com/x.js"))
    assertEquals(SCRIPT, g("https://a.com/x.mjs#hash"))
    assertEquals(STYLESHEET, g("https://a.com/x.CSS"))
    for (ext in listOf("png", "jpg", "jpeg", "gif", "webp", "svg", "ico")) assertEquals(ext, IMAGE, g("https://a.com/p/x.$ext?q"))
    for (ext in listOf("woff", "woff2", "ttf", "otf")) assertEquals(ext, FONT, g("https://a.com/x.$ext"))
    for (ext in listOf("mp4", "webm", "m3u8", "mpd", "mp3", "m4a")) assertEquals(ext, MEDIA, g("https://a.com/x.$ext"))
    assertEquals(XHR, g("https://a.com/data.json"))
  }

  @Test fun extensionOnlyFromPathNotQueryOrHost() {
    assertEquals(OTHER, g("https://cdn.js/x"))
    assertEquals(OTHER, g("https://a.com/x?file=a.js"))
  }

  @Test fun pingHeuristics() {
    assertEquals(PING, g("https://rr3---sn-abc.googlevideo.com/generate_204"))
    assertEquals(PING, g("https://m.youtube.com/ptracking?pltype=content"))
    assertEquals(PING, g("https://m.youtube.com/youtubei/v1/log_event?alt=json"))
    assertEquals(PING, g("https://m.youtube.com/api/stats/watchtime?ns=yt"))
    assertEquals(PING, g("https://www.google-analytics.com/g/collect?v=2"))
    assertEquals(PING, g("https://m.youtube.com/csi_204?v=3"))
  }

  @Test fun xhrHeuristics() {
    assertEquals(XHR, g("https://m.youtube.com/youtubei/v1/player?key=x"))
    assertEquals(XHR, g("https://api.example.com/api/v2/items"))
    assertEquals(XHR, g("https://example.com/graphql"))
    assertEquals(XHR, g("https://example.com/feed?alt=json"))
  }

  @Test fun mediaHeuristics() {
    assertEquals(MEDIA, g("https://rr3---sn-abc.googlevideo.com/videoplayback?expire=1&itag=18"))
    assertEquals(MEDIA, g("https://audio4-ak-spotify-com.akamaized.net/audio/abc"))
  }

  @Test fun websocket() {
    assertEquals(WEBSOCKET, g("wss://dealer.spotify.com/?access_token=x"))
  }

  @Test fun unknownIsOther() {
    assertEquals(OTHER, g("https://a.com/"))
    assertEquals(OTHER, g("https://a.com/some/path"))
    assertEquals(OTHER, g("not a url"))
  }
}
