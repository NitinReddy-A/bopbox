package com.nitinreddy.bopbox.core.media

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

/**
 * Pauses playback when audio would suddenly blast from the speaker (headphones unplugged,
 * Bluetooth disconnected).
 *
 * Audio focus is deliberately NOT requested here: Chromium's WebView already requests focus for
 * unmuted media and pauses/resumes itself on calls or other music apps. A second focus request
 * from the app would make the WebView and Bopbox steal focus from each other.
 */
class AudioOutputGuard(
  private val context: Context,
  private val send: (MediaCommand) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())
  private var registered = false

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) main.post { send(MediaCommand.PAUSE) }
    }
  }

  fun onPlaying() {
    if (registered) return
    ContextCompat.registerReceiver(
      context,
      noisyReceiver,
      IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    registered = true
  }

  fun onPaused() {
    if (!registered) return
    runCatching { context.unregisterReceiver(noisyReceiver) }
    registered = false
  }
}
