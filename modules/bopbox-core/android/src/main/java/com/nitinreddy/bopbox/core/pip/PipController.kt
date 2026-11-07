package com.nitinreddy.bopbox.core.pip

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Log
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import com.nitinreddy.bopbox.core.browser.WebViewPool
import com.nitinreddy.bopbox.core.media.PlaybackCoordinator
import com.nitinreddy.bopbox.core.settings.SettingsStore
import java.lang.ref.WeakReference
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Picture-in-Picture for video apps. When the user leaves Bopbox while a YouTube video is
 * on screen and playing, the activity shrinks into a floating window showing just the video.
 */
object PipController {
  private const val TAG = "BopboxPip"
  private var activityRef: WeakReference<ComponentActivity>? = null
  private val listeners = CopyOnWriteArraySet<(Boolean) -> Unit>()
  private var observingPlayback = false

  /** App currently shown on screen (set by the JS shell), or null on the home/settings screens. */
  var visibleAppId: String? = null
    set(value) {
      field = value
      refreshAutoEnter()
    }

  var isInPip: Boolean = false
    private set

  private val leaveHint = Runnable { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterIfEligible() }

  private val modeListener = Consumer<PictureInPictureModeChangedInfo> { info ->
    isInPip = info.isInPictureInPictureMode
    visibleAppId?.let { WebViewPool.peek(it)?.setPictureInPicture(isInPip) }
    listeners.forEach { it(isInPip) }
  }

  fun addListener(l: (Boolean) -> Unit) { listeners += l }
  fun removeListener(l: (Boolean) -> Unit) { listeners -= l }

  fun attach(activity: ComponentActivity) {
    if (activityRef?.get() === activity) return
    activityRef?.get()?.let(::detach)
    activityRef = WeakReference(activity)
    activity.addOnUserLeaveHintListener(leaveHint)
    activity.addOnPictureInPictureModeChangedListener(modeListener)
    if (!observingPlayback) {
      observingPlayback = true
      PlaybackCoordinator.addListener { refreshAutoEnter() }
    }
    refreshAutoEnter()
  }

  private fun detach(activity: ComponentActivity) {
    activity.removeOnUserLeaveHintListener(leaveHint)
    activity.removeOnPictureInPictureModeChangedListener(modeListener)
  }

  fun isEligible(): Boolean {
    val app = visibleAppId ?: return false
    val np = PlaybackCoordinator.current ?: return false
    return SettingsStore.current.autoPip && app == "youtube" && np.appId == app && np.isPlaying && np.hasVideo
  }

  /** Manual entry (e.g. a PiP button in the toolbar). Returns whether PiP was entered. */
  fun enter(): Boolean {
    val activity = activityRef?.get() ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      activity.enterPictureInPictureMode(params(false))
    } catch (t: Throwable) {
      Log.w(TAG, "enterPictureInPictureMode failed", t)
      false
    }
  }

  private fun enterIfEligible() {
    if (isEligible()) enter()
  }

  /** Android 12+: let the system animate into PiP straight from the home gesture. */
  private fun refreshAutoEnter() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val activity = activityRef?.get() ?: return
    runCatching { activity.setPictureInPictureParams(params(isEligible())) }
      .onFailure { Log.w(TAG, "setPictureInPictureParams failed", it) }
  }

  private fun params(autoEnter: Boolean): PictureInPictureParams {
    val b = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      b.setAutoEnterEnabled(autoEnter)
      b.setSeamlessResizeEnabled(true)
    }
    return b.build()
  }
}
