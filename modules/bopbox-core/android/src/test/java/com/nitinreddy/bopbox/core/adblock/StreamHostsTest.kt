package com.nitinreddy.bopbox.core.adblock

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class StreamHostsTest {
  @Test fun `video stream, thumbnail and avatar hosts skip the filter engine`() {
    assertTrue(StreamHosts.isStream("https://rr3---sn-a5mekn6s.googlevideo.com/videoplayback?expire=1&itag=248&range=0-1000"))
    assertTrue(StreamHosts.isStream("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"))
    assertTrue(StreamHosts.isStream("https://yt3.ggpht.com/abc=s88"))
    assertTrue(StreamHosts.isStream("https://RR1.GoogleVideo.com:443/videoplayback"))
    assertTrue(StreamHosts.isStream("https://googlevideo.com/x"))
  }

  @Test fun `everything else is still filtered`() {
    assertFalse(StreamHosts.isStream("https://m.youtube.com/youtubei/v1/player"))
    assertFalse(StreamHosts.isStream("https://googleads.g.doubleclick.net/pagead/id"))
    assertFalse(StreamHosts.isStream("https://www.youtube.com/pagead/adview"))
    // Look-alikes: the host must end at a label boundary, and only the host counts.
    assertFalse(StreamHosts.isStream("https://notgooglevideo.com/videoplayback"))
    assertFalse(StreamHosts.isStream("https://googlevideo.com.evil.example/videoplayback"))
    assertFalse(StreamHosts.isStream("https://evil.example/?u=https://x.googlevideo.com/"))
    assertFalse(StreamHosts.isStream("https://evil.example/i.ytimg.com"))
    assertFalse(StreamHosts.isStream("not a url"))
  }

  @Test fun `no bundled list blocks a stream host for a YouTube page`() {
    // The fast path is only sound while this holds; a list update that changes it fails here.
    val dir = listOf("src/main/assets/bopbox/filters", "modules/bopbox-core/android/src/main/assets/bopbox/filters")
      .map(::File).first { it.isDirectory }
    val engine = FilterEngine.parse(FilterLists.BUNDLED_ASSETS.map { File(dir, it).readText() })
    val page = "https://m.youtube.com/watch?v=dQw4w9WgXcQ"
    val samples = listOf(
      "https://rr3---sn-a5mekn6s.googlevideo.com/videoplayback?expire=1999999999&ei=x&itag=248&mime=video%2Fwebm&range=0-1000" to ResourceType.XHR,
      "https://rr3---sn-a5mekn6s.googlevideo.com/videoplayback?expire=1999999999&itag=251&mime=audio%2Fwebm" to ResourceType.MEDIA,
      "https://rr3---sn-a5mekn6s.googlevideo.com/generate_204" to ResourceType.PING,
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" to ResourceType.IMAGE,
      "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/mqdefault.webp" to ResourceType.IMAGE,
      "https://yt3.ggpht.com/ytc/abc=s88-c-k-c0x00ffffff-no-rj" to ResourceType.IMAGE,
    )
    for ((url, type) in samples) {
      assertFalse(url, engine.match(Request(url, page, type)).blocked)
    }
  }
}
