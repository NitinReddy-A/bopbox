package com.nitinreddy.bopbox.core.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.view.View
import android.widget.RemoteViews
import androidx.core.net.toUri
import com.nitinreddy.bopbox.core.R
import com.nitinreddy.bopbox.core.media.MediaCommand
import com.nitinreddy.bopbox.core.media.NowPlaying
import com.nitinreddy.bopbox.core.media.PlaybackCoordinator

/** Home-screen widget: big now-playing card with artwork and transport buttons. */
class NowPlayingWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    WidgetUpdater.renderNowPlaying(context, manager, ids)
  }
}

/** Home-screen widget: slim one-row mini player. */
class MiniPlayerWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    WidgetUpdater.renderMini(context, manager, ids)
  }
}

/** Home-screen widget: launcher tiles for YouTube, Spotify, search and home. */
class QuickAccessWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    WidgetUpdater.renderQuick(context, manager, ids)
  }
}

/** Receives widget button taps. Falls back to opening the app if nothing is loaded yet. */
class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val cmd = when (intent.action) {
      WidgetUpdater.ACTION_TOGGLE -> if (PlaybackCoordinator.isPlaying) MediaCommand.PAUSE else MediaCommand.PLAY
      WidgetUpdater.ACTION_NEXT -> MediaCommand.NEXT
      WidgetUpdater.ACTION_PREVIOUS -> MediaCommand.PREVIOUS
      else -> return
    }
    if (PlaybackCoordinator.activeAppId == null) {
      // Cold process: WebViews don't exist yet, so jump into the app instead.
      context.startActivity(WidgetUpdater.deepLink(context, "bopbox://open/home").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      return
    }
    PlaybackCoordinator.command(cmd)
  }
}

object WidgetUpdater {
  const val ACTION_TOGGLE = "com.nitinreddy.bopbox.widget.TOGGLE"
  const val ACTION_NEXT = "com.nitinreddy.bopbox.widget.NEXT"
  const val ACTION_PREVIOUS = "com.nitinreddy.bopbox.widget.PREVIOUS"

  private var lastKey: String? = null

  /** Push the latest state to every placed player widget. Cheap no-op when nothing changed. */
  fun onNowPlaying(context: Context, np: NowPlaying?) {
    val key = listOf(np?.appId, np?.title, np?.artist, np?.artworkUrl, np?.isPlaying, np?.canNext, np?.canPrevious).joinToString("|")
    if (key == lastKey) return
    lastKey = key
    val manager = AppWidgetManager.getInstance(context)
    renderNowPlaying(context, manager, ids(context, manager, NowPlayingWidgetProvider::class.java))
    renderMini(context, manager, ids(context, manager, MiniPlayerWidgetProvider::class.java))
    val art = np?.artworkUrl
    if (art != null && ArtworkLoader.cached(art) == null) {
      ArtworkLoader.load(art) { bmp ->
        if (bmp != null && PlaybackCoordinator.current?.artworkUrl == art) {
          renderNowPlaying(context, manager, ids(context, manager, NowPlayingWidgetProvider::class.java))
          renderMini(context, manager, ids(context, manager, MiniPlayerWidgetProvider::class.java))
        }
      }
    }
  }

  private fun ids(context: Context, manager: AppWidgetManager, cls: Class<*>): IntArray =
    manager.getAppWidgetIds(ComponentName(context, cls))

  fun renderNowPlaying(context: Context, manager: AppWidgetManager, ids: IntArray) {
    if (ids.isEmpty()) return
    val np = PlaybackCoordinator.current
    val views = RemoteViews(context.packageName, R.layout.bopbox_widget_now_playing)
    bindCommon(context, views, np)
    views.setTextViewText(R.id.bopbox_w_artist, np?.artist?.ifBlank { appLabel(np.appId) } ?: "tap a tile to start the party")
    views.setViewVisibility(R.id.bopbox_w_prev, if (np?.canPrevious == true) View.VISIBLE else View.INVISIBLE)
    views.setViewVisibility(R.id.bopbox_w_next, if (np?.canNext == true) View.VISIBLE else View.INVISIBLE)
    views.setOnClickPendingIntent(R.id.bopbox_w_prev, broadcast(context, ACTION_PREVIOUS))
    views.setOnClickPendingIntent(R.id.bopbox_w_next, broadcast(context, ACTION_NEXT))
    val art: Bitmap? = np?.artworkUrl?.let(ArtworkLoader::cached)
    if (art != null) views.setImageViewBitmap(R.id.bopbox_w_art, art) else views.setImageViewResource(R.id.bopbox_w_art, R.drawable.bopbox_art_placeholder)
    manager.updateAppWidget(ids, views)
  }

  fun renderMini(context: Context, manager: AppWidgetManager, ids: IntArray) {
    if (ids.isEmpty()) return
    val np = PlaybackCoordinator.current
    val views = RemoteViews(context.packageName, R.layout.bopbox_widget_mini)
    bindCommon(context, views, np)
    views.setTextViewText(
      R.id.bopbox_w_status,
      when {
        np == null || !np.hasMedia -> "idle • vibes pending"
        np.isAd -> "ad detected • yeeting it"
        np.isPlaying -> "now bopping • ${appLabel(np.appId)}"
        else -> "paused • ${appLabel(np.appId)}"
      },
    )
    val art: Bitmap? = np?.artworkUrl?.let(ArtworkLoader::cached)
    if (art != null) views.setImageViewBitmap(R.id.bopbox_w_art, art) else views.setImageViewResource(R.id.bopbox_w_art, R.drawable.bopbox_art_placeholder)
    manager.updateAppWidget(ids, views)
  }

  fun renderQuick(context: Context, manager: AppWidgetManager, ids: IntArray) {
    if (ids.isEmpty()) return
    val views = RemoteViews(context.packageName, R.layout.bopbox_widget_quick)
    views.setOnClickPendingIntent(R.id.bopbox_q_youtube, activity(context, "bopbox://open/youtube", 10))
    views.setOnClickPendingIntent(R.id.bopbox_q_spotify, activity(context, "bopbox://open/spotify", 11))
    views.setOnClickPendingIntent(R.id.bopbox_q_search, activity(context, "bopbox://search", 12))
    views.setOnClickPendingIntent(R.id.bopbox_q_home, activity(context, "bopbox://open/home", 13))
    manager.updateAppWidget(ids, views)
  }

  private fun bindCommon(context: Context, views: RemoteViews, np: NowPlaying?) {
    val title = np?.title?.takeIf { it.isNotBlank() } ?: "Nothing's bopping"
    views.setTextViewText(R.id.bopbox_w_title, title)
    views.setImageViewResource(R.id.bopbox_w_toggle, if (np?.isPlaying == true) R.drawable.bopbox_ic_pause else R.drawable.bopbox_ic_play)
    views.setOnClickPendingIntent(R.id.bopbox_w_toggle, broadcast(context, ACTION_TOGGLE))
    val target = np?.appId ?: "home"
    views.setOnClickPendingIntent(R.id.bopbox_w_root, activity(context, "bopbox://open/$target", 20))
  }

  private fun appLabel(appId: String) = when (appId) {
    "youtube" -> "YouTube"
    "spotify" -> "Spotify"
    else -> appId
  }

  fun deepLink(context: Context, uri: String): Intent =
    (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent())
      .setAction(Intent.ACTION_VIEW)
      .setData(uri.toUri())
      .setPackage(context.packageName)

  private fun activity(context: Context, uri: String, requestCode: Int): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      deepLink(context, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun broadcast(context: Context, action: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      action.hashCode(),
      Intent(action).setClass(context, WidgetActionReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
