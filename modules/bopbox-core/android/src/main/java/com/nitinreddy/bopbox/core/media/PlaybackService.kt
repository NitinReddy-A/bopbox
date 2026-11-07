package com.nitinreddy.bopbox.core.media

import android.app.PendingIntent
import android.content.Intent
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.nitinreddy.bopbox.core.Bopbox
import com.nitinreddy.bopbox.core.R

/**
 * Hosts the MediaSession: system media notification, lock screen controls, Bluetooth/headset
 * buttons and Android Auto/Wear surfaces all talk to [WebViewPlayer] through it. Media3 moves
 * this service to the foreground while something is playing, which keeps the process (and the
 * WebViews) alive in the background.
 */
@UnstableApi
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    Bopbox.init(this)
    setMediaNotificationProvider(
      DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(R.drawable.bopbox_ic_notification) },
    )
    val player = WebViewPlayer()
    PlaybackCoordinator.attachPlayer(player)
    session = MediaSession.Builder(this, player)
      .setId("bopbox")
      .setSessionActivity(openAppIntent())
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  /** Swiping Bopbox away keeps the music going (like a real music app) unless nothing plays. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!PlaybackCoordinator.isPlaying) {
      pauseAllPlayersAndStopSelf()
    }
  }

  override fun onDestroy() {
    session?.run {
      (player as? WebViewPlayer)?.let { PlaybackCoordinator.detachPlayer(it) }
      player.release()
      release()
    }
    session = null
    super.onDestroy()
  }

  private fun openAppIntent(): PendingIntent {
    // "now" resolves to whichever app owns playback when the intent fires.
    val intent = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent())
      .setAction(Intent.ACTION_VIEW)
      .setData("bopbox://open/now".toUri())
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(this, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}
