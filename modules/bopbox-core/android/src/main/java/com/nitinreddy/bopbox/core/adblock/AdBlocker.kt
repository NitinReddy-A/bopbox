package com.nitinreddy.bopbox.core.adblock

import android.content.Context
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/**
 * Process-wide ad blocker. Loads bundled filter lists (or fresher downloaded copies), builds the
 * [FilterEngine] off the main thread and answers WebView interception calls from any thread.
 */
object AdBlocker {
  private const val TAG = "BopboxAdBlocker"
  private const val ASSET_DIR = "bopbox/filters"
  private const val PREFS = "bopbox.adblock"
  private const val UPDATE_INTERVAL_MS = 4L * 24 * 3600 * 1000

  data class Stats(
    val ready: Boolean,
    val networkRules: Int,
    val cosmeticRules: Int,
    val blockedTotal: Long,
    val blockedSession: Long,
    val lastUpdatedMs: Long,
    val updating: Boolean,
  ) {
    fun toMap(): Map<String, Any> = mapOf(
      "ready" to ready,
      "networkRules" to networkRules,
      "cosmeticRules" to cosmeticRules,
      "blockedTotal" to blockedTotal.toDouble(),
      "blockedSession" to blockedSession.toDouble(),
      "lastUpdatedMs" to lastUpdatedMs.toDouble(),
      "updating" to updating,
    )
  }

  private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "bopbox-adblock").apply { priority = Thread.NORM_PRIORITY - 1 } }
  private val listeners = CopyOnWriteArraySet<(Stats) -> Unit>()
  private val blockedSession = AtomicLong()
  private val blockedTotal = AtomicLong()
  private lateinit var appContext: Context

  @Volatile private var engine: FilterEngine? = null
  @Volatile private var updating = false
  @Volatile private var lastUpdatedMs = 0L
  @Volatile private var lastNotify = 0L

  private val emptyBody = ByteArray(0)

  @Synchronized
  fun init(context: Context, autoUpdate: Boolean) {
    if (::appContext.isInitialized) return
    appContext = context.applicationContext
    val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    blockedTotal.set(prefs.getLong("blockedTotal", 0))
    lastUpdatedMs = prefs.getLong("lastUpdated", 0)
    executor.execute {
      rebuild()
      if (autoUpdate && System.currentTimeMillis() - lastUpdatedMs > UPDATE_INTERVAL_MS) downloadLists()
    }
  }

  val isReady: Boolean get() = engine != null

  fun stats(): Stats {
    val e = engine
    return Stats(
      ready = e != null,
      networkRules = e?.networkRuleCount ?: 0,
      cosmeticRules = e?.cosmeticRuleCount ?: 0,
      blockedTotal = blockedTotal.get(),
      blockedSession = blockedSession.get(),
      lastUpdatedMs = lastUpdatedMs,
      updating = updating,
    )
  }

  fun addListener(l: (Stats) -> Unit) { listeners += l }
  fun removeListener(l: (Stats) -> Unit) { listeners -= l }

  /** Called from WebViewClient.shouldInterceptRequest (background thread). */
  fun intercept(request: WebResourceRequest, pageUrl: String?): WebResourceResponse? {
    val e = engine ?: return null
    val url = request.url?.toString() ?: return null
    if (!url.startsWith("http")) return null
    val type = ResourceTypeGuesser.guess(
      url = url,
      accept = request.requestHeaders?.entries?.firstOrNull { it.key.equals("Accept", true) }?.value,
      isMainFrame = request.isForMainFrame,
    )
    val result = try { e.match(Request(url, pageUrl, type)) } catch (t: Throwable) {
      Log.w(TAG, "match failed for $url", t)
      return null
    }
    if (!result.blocked) return null
    recordBlocked(1)
    return WebResourceResponse("text/plain", "utf-8", 200, "OK", mapOf("Access-Control-Allow-Origin" to "*"), ByteArrayInputStream(emptyBody))
  }

  /** Element-hiding CSS selectors for a host (host-specific rules only, generic ones are too heavy). */
  fun cosmeticSelectors(host: String): List<String> = engine?.cosmeticSelectors(host, includeGeneric = false).orEmpty()

  fun recordBlocked(n: Int) {
    if (n <= 0) return
    blockedSession.addAndGet(n.toLong())
    val total = blockedTotal.addAndGet(n.toLong())
    val now = System.currentTimeMillis()
    if (now - lastNotify > 1500) {
      lastNotify = now
      if (::appContext.isInitialized) {
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("blockedTotal", total).apply()
      }
      notifyListeners()
    }
  }

  /** Force a filter list refresh. [onDone] runs on the adblock thread. */
  fun updateNow(onDone: (Stats) -> Unit) {
    executor.execute {
      downloadLists()
      onDone(stats())
    }
  }

  private fun listFiles(): List<String> = listOf(FilterLists.EASYLIST_ASSET, FilterLists.EASYPRIVACY_ASSET, FilterLists.EXTRAS_ASSET)

  private fun cacheDir(): File = File(appContext.filesDir, "filters").apply { mkdirs() }

  private fun readList(name: String): String? {
    val cached = File(cacheDir(), name)
    if (cached.isFile && cached.length() > 0) {
      runCatching { return cached.readText() }
    }
    return runCatching { appContext.assets.open("$ASSET_DIR/$name").bufferedReader().use { it.readText() } }
      .onFailure { Log.w(TAG, "missing filter asset $name", it) }
      .getOrNull()
  }

  private fun rebuild() {
    val started = System.currentTimeMillis()
    val lists = listFiles().mapNotNull(::readList)
    engine = try {
      FilterEngine.parse(lists)
    } catch (t: Throwable) {
      Log.e(TAG, "failed to build filter engine", t)
      engine
    }
    Log.i(TAG, "engine ready in ${System.currentTimeMillis() - started}ms (${engine?.networkRuleCount} network rules)")
    notifyListeners()
  }

  private fun downloadLists() {
    updating = true
    notifyListeners()
    var changed = false
    val remote = mapOf(
      FilterLists.EASYLIST_ASSET to FilterLists.EASYLIST_URL,
      FilterLists.EASYPRIVACY_ASSET to FilterLists.EASYPRIVACY_URL,
    )
    for ((name, url) in remote) {
      val text = fetch(url) ?: continue
      if (!FilterLists.looksValid(text)) {
        Log.w(TAG, "rejected suspicious list from $url")
        continue
      }
      val tmp = File(cacheDir(), "$name.tmp")
      tmp.writeText(text)
      if (tmp.renameTo(File(cacheDir(), name)) || run { File(cacheDir(), name).delete(); tmp.renameTo(File(cacheDir(), name)) }) {
        changed = true
      }
    }
    if (changed) {
      lastUpdatedMs = System.currentTimeMillis()
      appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastUpdated", lastUpdatedMs).apply()
      rebuild()
    }
    updating = false
    notifyListeners()
  }

  private fun fetch(url: String): String? = try {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20_000
      readTimeout = 60_000
      setRequestProperty("User-Agent", "Bopbox/1.0 (filter updater)")
    }
    try {
      if (conn.responseCode == 200) conn.inputStream.bufferedReader().use { it.readText() } else null
    } finally {
      conn.disconnect()
    }
  } catch (t: Throwable) {
    Log.w(TAG, "download failed: $url", t)
    null
  }

  private fun notifyListeners() {
    val s = stats()
    listeners.forEach { runCatching { it(s) } }
  }
}
