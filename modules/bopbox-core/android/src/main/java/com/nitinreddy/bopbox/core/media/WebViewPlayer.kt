package com.nitinreddy.bopbox.core.media

import android.os.Looper
import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * A Media3 [Player] facade over whatever web page is playing. It never decodes media itself:
 * state comes from [PlaybackCoordinator], and transport commands are forwarded to the page.
 *
 * The playlist is faked as [previous?, current, next?] so the system shows prev/next buttons
 * exactly when the page supports them.
 */
@UnstableApi
class WebViewPlayer(looper: Looper = Looper.getMainLooper()) : SimpleBasePlayer(looper) {

  fun refresh() = invalidateState()

  override fun getState(): State {
    val np = PlaybackCoordinator.current
    val commands = Player.Commands.Builder()
      .addAll(
        Player.COMMAND_PLAY_PAUSE,
        Player.COMMAND_STOP,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
        Player.COMMAND_GET_METADATA,
        Player.COMMAND_GET_TIMELINE,
      )
    if (np == null || !np.hasMedia) {
      return State.Builder()
        .setAvailableCommands(commands.build())
        .setPlaybackState(Player.STATE_IDLE)
        .build()
    }
    if (np.canSeek && np.durationMs > 0) commands.add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
    if (np.canNext) commands.addAll(Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
    if (np.canPrevious) commands.addAll(Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)

    val playlist = buildList {
      if (np.canPrevious) add(placeholder("prev"))
      add(currentItem(np))
      if (np.canNext) add(placeholder("next"))
    }
    val index = if (np.canPrevious) 1 else 0
    return State.Builder()
      .setAvailableCommands(commands.build())
      .setPlaylist(playlist)
      .setCurrentMediaItemIndex(index)
      .setPlaybackState(Player.STATE_READY)
      .setPlayWhenReady(np.isPlaying, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setContentPositionMs { np.positionAt(System.currentTimeMillis()) }
      .build()
  }

  private fun currentItem(np: NowPlaying): MediaItemData {
    val metadata = MediaMetadata.Builder()
      .setTitle(np.title.ifBlank { "Something's bopping" })
      .setArtist(np.artist)
      .setAlbumTitle(np.album)
      .setDisplayTitle(np.title)
      .setSubtitle(np.artist)
      .setIsPlayable(true)
      .apply { np.artworkUrl?.let { setArtworkUri(it.toUri()) } }
      .build()
    val item = MediaItem.Builder()
      .setMediaId("${np.appId}:${np.title}")
      .setMediaMetadata(metadata)
      .build()
    return MediaItemData.Builder("${np.appId}:${np.title}:${np.artist}")
      .setMediaItem(item)
      .setDurationUs(if (np.durationMs > 0) np.durationMs * 1000 else C.TIME_UNSET)
      .setIsSeekable(np.canSeek && np.durationMs > 0)
      .build()
  }

  private fun placeholder(id: String): MediaItemData =
    MediaItemData.Builder("placeholder:$id")
      .setMediaItem(MediaItem.Builder().setMediaId("placeholder:$id").build())
      .build()

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    PlaybackCoordinator.command(if (playWhenReady) MediaCommand.PLAY else MediaCommand.PAUSE)
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    PlaybackCoordinator.command(MediaCommand.PAUSE)
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    val np = PlaybackCoordinator.current
    val currentIndex = if (np?.canPrevious == true) 1 else 0
    when {
      seekCommand == Player.COMMAND_SEEK_TO_NEXT || seekCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ->
        PlaybackCoordinator.command(MediaCommand.NEXT)
      seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS || seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ->
        PlaybackCoordinator.command(MediaCommand.PREVIOUS)
      mediaItemIndex > currentIndex -> PlaybackCoordinator.command(MediaCommand.NEXT)
      mediaItemIndex < currentIndex -> PlaybackCoordinator.command(MediaCommand.PREVIOUS)
      positionMs != C.TIME_UNSET -> PlaybackCoordinator.command(MediaCommand.SEEK, positionMs / 1000.0)
    }
    return Futures.immediateVoidFuture()
  }
}
