package com.nitinreddy.bopbox.core.adblock

/** Resource types understood by the filter engine (subset of ABP/uBO `$type` options). */
enum class ResourceType {
  DOCUMENT,
  SUBDOCUMENT,
  SCRIPT,
  IMAGE,
  STYLESHEET,
  XHR,
  MEDIA,
  FONT,
  PING,
  WEBSOCKET,
  OTHER,
}

/** A network request as seen from WebViewClient.shouldInterceptRequest. */
data class Request(
  val url: String,
  /** URL of the top-level page that issued the request, if known. */
  val pageUrl: String?,
  val type: ResourceType,
)

enum class Verdict { ALLOW, BLOCK }

/** Outcome of matching. [rule] is the raw filter text that decided it (null = no rule matched). */
data class MatchResult(val verdict: Verdict, val rule: String?) {
  val blocked: Boolean get() = verdict == Verdict.BLOCK

  companion object {
    val NO_MATCH = MatchResult(Verdict.ALLOW, null)
  }
}
