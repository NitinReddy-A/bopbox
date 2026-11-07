package com.nitinreddy.bopbox.core.settings

import android.content.Context
import android.content.SharedPreferences
import java.util.concurrent.CopyOnWriteArraySet

/** Process-wide settings holder backed by SharedPreferences. */
object SettingsStore {
  private const val PREFS = "bopbox.settings"
  private lateinit var prefs: SharedPreferences
  private val listeners = CopyOnWriteArraySet<(Settings) -> Unit>()

  @Volatile
  var current: Settings = Settings()
    private set

  @Synchronized
  fun init(context: Context) {
    if (::prefs.isInitialized) return
    prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    current = Settings.fromMap(prefs.all)
  }

  fun update(patch: Map<String, Any?>): Settings {
    val next = synchronized(this) {
      val n = current.patched(patch)
      current = n
      if (::prefs.isInitialized) {
        prefs.edit().apply {
          n.toMap().forEach { (k, v) ->
            when (v) {
              is Boolean -> putBoolean(k, v)
              is String -> putString(k, v)
            }
          }
        }.apply()
      }
      n
    }
    listeners.forEach { it(next) }
    return next
  }

  fun addListener(l: (Settings) -> Unit) { listeners += l }

  fun removeListener(l: (Settings) -> Unit) { listeners -= l }
}
