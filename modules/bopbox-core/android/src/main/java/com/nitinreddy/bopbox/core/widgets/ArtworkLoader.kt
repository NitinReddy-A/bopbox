package com.nitinreddy.bopbox.core.widgets

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Tiny artwork fetcher for widgets (RemoteViews need real bitmaps, not URLs). */
object ArtworkLoader {
  private const val MAX_PX = 320

  /** Corner radius as a fraction of the side: 12dp on the 76dp Now Playing artwork. */
  const val CORNER_NOW_PLAYING = 12f / 76f

  /** Corner radius as a fraction of the side: 10dp on the 40dp mini player artwork. */
  const val CORNER_MINI = 10f / 40f

  private val cache = LruCache<String, Bitmap>(8)
  private val rounded = LruCache<String, Bitmap>(8)
  private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "bopbox-artwork") }
  private val main = Handler(Looper.getMainLooper())
  private val inFlight = mutableSetOf<String>()

  /** The square, center-cropped artwork, or null if it hasn't been loaded yet. */
  fun cached(url: String): Bitmap? = cache.get(url)

  /**
   * The cached artwork with rounded corners ([cornerFraction] of the side). RemoteViews can't clip
   * images to an outline before API 31, so the rounding is baked into the bitmap.
   */
  fun cached(url: String, cornerFraction: Float): Bitmap? {
    val square = cache.get(url) ?: return null
    val key = "$cornerFraction|$url"
    rounded.get(key)?.let { return it }
    return roundCorners(square, square.width * cornerFraction).also { rounded.put(key, it) }
  }

  fun load(url: String, callback: (Bitmap?) -> Unit) {
    if (!url.startsWith("https://")) return callback(null)
    cache.get(url)?.let { return callback(it) }
    synchronized(inFlight) { if (!inFlight.add(url)) return }
    executor.execute {
      val bmp = runCatching { fetch(url) }.getOrNull()
      synchronized(inFlight) { inFlight.remove(url) }
      if (bmp != null) cache.put(url, bmp)
      main.post { callback(bmp) }
    }
  }

  private fun roundCorners(src: Bitmap, radius: Float): Bitmap {
    val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    Canvas(out).drawRoundRect(RectF(0f, 0f, src.width.toFloat(), src.height.toFloat()), radius, radius, paint)
    return out
  }

  private fun fetch(url: String): Bitmap? {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 10_000
      readTimeout = 15_000
    }
    try {
      if (conn.responseCode != 200 || conn.contentLength > 5_000_000) return null
      val bytes = conn.inputStream.use { it.readBytes() }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= MAX_PX && bounds.outHeight / (sample * 2) >= MAX_PX) sample *= 2
      val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
      // Center-crop to a square so 16:9 YouTube thumbnails look like album art.
      val side = minOf(decoded.width, decoded.height)
      val square = Bitmap.createBitmap(decoded, (decoded.width - side) / 2, (decoded.height - side) / 2, side, side)
      return if (side > MAX_PX) Bitmap.createScaledBitmap(square, MAX_PX, MAX_PX, true) else square
    } finally {
      conn.disconnect()
    }
  }
}
