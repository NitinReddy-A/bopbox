package com.nitinreddy.bopbox.core.browser

import android.app.Activity
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.media.AudioManager
import android.provider.Settings as SystemSettings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import com.nitinreddy.bopbox.core.R
import com.nitinreddy.bopbox.core.settings.SettingsStore
import kotlin.math.abs
import kotlin.math.roundToInt

/** Pure math for the swipe controls, kept separate so it can be unit tested. */
object SwipeMath {
  /** Fraction of the view height a full 0→1 sweep takes. */
  const val SWEEP = 0.65f

  /** New level after dragging [dy] pixels (positive = down) on a view [height] tall. */
  fun level(start: Float, dy: Float, height: Int): Float {
    if (height <= 0) return start
    return (start - dy / (height * SWEEP)).coerceIn(0f, 1f)
  }

  /** True when a move from the touch-down point should become a vertical swipe. */
  fun isVerticalSwipe(dx: Float, dy: Float, slop: Int): Boolean = abs(dy) > slop && abs(dy) > abs(dx) * 1.5f

  /** Ignore touches that start in the edge bands Android reserves for system gestures. */
  fun inGestureBand(y: Float, height: Int, band: Float = 0.08f): Boolean = y < height * band || y > height * (1 - band)
}

/**
 * Wraps the fullscreen video. A vertical swipe on the left half sets screen brightness, on the
 * right half media volume; taps and horizontal drags fall through to the player untouched.
 */
class SwipeControlsLayout(
  context: Context,
  private val activity: () -> Activity?,
) : FrameLayout(context) {
  private enum class Target { BRIGHTNESS, VOLUME }

  private val slop = ViewConfiguration.get(context).scaledTouchSlop
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val hud = LevelHud(context)
  private var downX = 0f
  private var downY = 0f
  private var target: Target? = null
  private var startLevel = 0f
  private val hideHud = Runnable { hud.animate().alpha(0f).setDuration(200).start() }

  init {
    hud.alpha = 0f
    val size = (context.resources.displayMetrics.density * 152).roundToInt()
    addView(hud, LayoutParams(size, (size * 0.34f).roundToInt(), Gravity.CENTER))
  }

  /** Keep the HUD above the video when the player view is added after construction. */
  override fun onViewAdded(child: View?) {
    super.onViewAdded(child)
    if (child !== hud) hud.bringToFront()
  }

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    if (!SettingsStore.current.swipeControls) return false
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = ev.x
        downY = ev.y
        target = null
      }
      MotionEvent.ACTION_MOVE -> {
        if (target == null && ev.pointerCount == 1 && !SwipeMath.inGestureBand(downY, height) &&
          SwipeMath.isVerticalSwipe(ev.x - downX, ev.y - downY, slop)
        ) {
          target = if (downX < width / 2f) Target.BRIGHTNESS else Target.VOLUME
          startLevel = currentLevel(target!!)
          downY = ev.y
          return true
        }
      }
    }
    return target != null
  }

  override fun onTouchEvent(ev: MotionEvent): Boolean {
    val t = target ?: return super.onTouchEvent(ev)
    when (ev.actionMasked) {
      MotionEvent.ACTION_MOVE -> apply(t, SwipeMath.level(startLevel, ev.y - downY, height))
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        target = null
        removeCallbacks(hideHud)
        postDelayed(hideHud, 700)
      }
    }
    return true
  }

  /** Hand brightness back to the system when fullscreen ends. */
  fun restore() {
    activity()?.window?.let { w ->
      w.attributes = w.attributes.apply { screenBrightness = -1f }
    }
  }

  private fun currentLevel(t: Target): Float = when (t) {
    Target.VOLUME -> audio.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    Target.BRIGHTNESS -> {
      val own = activity()?.window?.attributes?.screenBrightness ?: -1f
      if (own >= 0f) own else runCatching {
        SystemSettings.System.getInt(context.contentResolver, SystemSettings.System.SCREEN_BRIGHTNESS) / 255f
      }.getOrDefault(0.5f)
    }
  }

  private fun apply(t: Target, level: Float) {
    when (t) {
      Target.VOLUME -> {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, (level * max).roundToInt(), 0)
      }
      Target.BRIGHTNESS -> activity()?.window?.let { w ->
        w.attributes = w.attributes.apply { screenBrightness = level.coerceAtLeast(0.01f) }
      }
    }
    removeCallbacks(hideHud)
    hud.animate().cancel()
    hud.alpha = 1f
    hud.show(if (t == Target.BRIGHTNESS) R.drawable.bopbox_ic_brightness else R.drawable.bopbox_ic_volume, level)
  }

  /** A small dark pill with an icon and a level bar, like the system volume HUD. */
  private class LevelHud(context: Context) : View(context) {
    private val density = context.resources.displayMetrics.density
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xB3000000.toInt() }
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x4DFFFFFF }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() }
    private var icon = 0
    private var level = 0f

    fun show(iconRes: Int, value: Float) {
      icon = iconRes
      level = value
      invalidate()
    }

    override fun onDraw(canvas: Canvas) {
      val r = height / 2f
      canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), r, r, bg)
      val pad = 14 * density
      val iconSize = (height * 0.5f).roundToInt()
      if (icon != 0) {
        ContextCompat.getDrawable(context, icon)?.let { d ->
          val top = (height - iconSize) / 2
          d.setBounds(pad.roundToInt(), top, pad.roundToInt() + iconSize, top + iconSize)
          d.setTint(0xFFFFFFFF.toInt())
          d.draw(canvas)
        }
      }
      val left = pad * 1.6f + iconSize
      val right = width - pad * 1.4f
      val barH = 4 * density
      val cy = height / 2f
      canvas.drawRoundRect(RectF(left, cy - barH / 2, right, cy + barH / 2), barH, barH, track)
      canvas.drawRoundRect(RectF(left, cy - barH / 2, left + (right - left) * level, cy + barH / 2), barH, barH, fill)
    }
  }
}
