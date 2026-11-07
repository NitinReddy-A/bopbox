package com.nitinreddy.bopbox.core.media

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Plays nice with other audio: pauses on calls / other music apps, resumes after transient
 * interruptions, and pauses when headphones are unplugged ("becoming noisy").
 */
class AudioFocusController(
  private val context: Context,
  private val send: (MediaCommand) -> Unit,
) {
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var hasFocus = false
  private var resumeOnGain = false
  private var noisyRegistered = false

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_GAIN -> {
        hasFocus = true
        if (resumeOnGain) send(MediaCommand.PLAY)
        resumeOnGain = false
      }
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasFocus = false
        resumeOnGain = false
        send(MediaCommand.PAUSE)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        resumeOnGain = true
        send(MediaCommand.PAUSE)
      }
      // LOSS_TRANSIENT_CAN_DUCK: the system ducks us automatically on O+.
    }
  }

  private val request: AudioFocusRequest? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build(),
      )
      .setOnAudioFocusChangeListener(focusListener)
      .setWillPauseWhenDucked(false)
      .build()
  } else {
    null
  }

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) send(MediaCommand.PAUSE)
    }
  }

  fun request() {
    if (hasFocus) return
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioManager.requestAudioFocus(request!!)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  fun onPlaying() {
    if (!noisyRegistered) {
      ContextCompat.registerReceiver(
        context,
        noisyReceiver,
        IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      noisyRegistered = true
    }
  }

  fun onPaused() {
    if (noisyRegistered) {
      runCatching { context.unregisterReceiver(noisyReceiver) }
      noisyRegistered = false
    }
  }
}
