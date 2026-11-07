package com.nitinreddy.bopbox.core.media

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.nitinreddy.bopbox.core.browser.WebViewPool
import com.nitinreddy.bopbox.core.widgets.WidgetUpdater
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Central "what's playing" brain. Receives page states from every app, decides which app owns
 * the media session, keeps only one app audible at a time (WebView itself handles audio focus), and fans updates out to the media
 * notification, widgets and the React Native UI. Main-thread only.
 */
object PlaybackCoordinator {
  private const val TAG = "BopboxPlayback"
  private val main = Handler(Looper.getMainLooper())
  private val states = mutableMapOf<String, NowPlaying>()
  private val listeners = CopyOnWriteArraySet<(NowPlaying?) -> Unit>()
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var outputGuard: AudioOutputGuard? = null
  private lateinit var appContext: Context
  private var player: WebViewPlayer? = null

  var activeAppId: String? = null
    private set

  val current: NowPlaying? get() = activeAppId?.let { states[it] }

  val isPlaying: Boolean get() = current?.isPlaying == true

  fun init(context: Context) {
    if (::appContext.isInitialized) return
    appContext = context.applicationContext
    outputGuard = AudioOutputGuard(appContext) { cmd -> command(cmd) }
    listeners += { np -> WidgetUpdater.onNowPlaying(appContext, np) }
  }

  fun addListener(l: (NowPlaying?) -> Unit) { listeners += l }
  fun removeListener(l: (NowPlaying?) -> Unit) { listeners -= l }

  internal fun attachPlayer(p: WebViewPlayer) { player = p }
  internal fun detachPlayer(p: WebViewPlayer) { if (player === p) player = null }

  /** A page reported its media state (main thread, from the WebMessage listener). */
  fun onPageState(state: NowPlaying) {
    if (!onMain { onPageState(state) }) return
    val previous = states[state.appId]
    states[state.appId] = state
    if (state.isPlaying) {
      if (activeAppId != null && activeAppId != state.appId) {
        // Only one app plays at a time, like switching between two real music apps.
        val other = activeAppId!!
        if (states[other]?.isPlaying == true) WebViewPool.command(other, MediaCommand.PAUSE)
      }
      activeAppId = state.appId
      ensureSession()
    } else if (activeAppId == null && state.hasMedia) {
      activeAppId = state.appId
    }
    if (state.appId == activeAppId && previous != state) publish()
  }

  /** Execute a transport command against the app that owns the session. */
  fun command(cmd: MediaCommand, arg: Double? = null) {
    if (!onMain { command(cmd, arg) }) return
    val id = activeAppId ?: return
    WebViewPool.command(id, cmd, arg)
    val s = states[id] ?: return
    // Optimistic update so buttons feel instant; the page confirms moments later.
    val optimistic = when (cmd) {
      MediaCommand.PLAY -> s.copy(isPlaying = true, updatedAtMs = System.currentTimeMillis(), positionMs = s.positionAt(System.currentTimeMillis()))
      MediaCommand.PAUSE, MediaCommand.STOP -> s.copy(isPlaying = false, positionMs = s.positionAt(System.currentTimeMillis()), updatedAtMs = System.currentTimeMillis())
      MediaCommand.SEEK -> if (arg != null) s.copy(positionMs = (arg * 1000).toLong(), updatedAtMs = System.currentTimeMillis()) else s
      else -> s
    }
    if (optimistic != s) {
      states[id] = optimistic
      publish()
    }
  }

  /** The WebView for an app died (renderer crash); forget its state. */
  fun onAppGone(appId: String) {
    if (!onMain { onAppGone(appId) }) return
    states.remove(appId)
    if (activeAppId == appId) {
      activeAppId = states.entries.firstOrNull { it.value.hasMedia }?.key
      publish()
    }
  }

  /** True when already on the main thread; otherwise re-posts [block] there and returns false. */
  private inline fun onMain(crossinline block: () -> Unit): Boolean {
    if (Looper.myLooper() == Looper.getMainLooper()) return true
    main.post { block() }
    return false
  }

  private fun publish() {
    val now = current
    if (now?.isPlaying != true) outputGuard?.onPaused() else outputGuard?.onPlaying()
    player?.refresh()
    listeners.forEach { l -> runCatching { l(now) }.onFailure { Log.w(TAG, "listener failed", it) } }
  }

  /** Connect a MediaController so the MediaSessionService starts and can go foreground. */
  private fun ensureSession() {
    if (controllerFuture != null || !::appContext.isInitialized) return
    val token = SessionToken(appContext, ComponentName(appContext, PlaybackService::class.java))
    controllerFuture = MediaController.Builder(appContext, token).buildAsync().also { f ->
      f.addListener({
        runCatching { f.get() }.onFailure {
          Log.e(TAG, "media controller failed", it)
          controllerFuture = null
        }
      }, { main.post(it) })
    }
  }
}
