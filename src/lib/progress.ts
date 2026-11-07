import type { NowPlaying } from '@bopbox/core';

type Timing = Pick<NowPlaying, 'isPlaying' | 'positionMs' | 'durationMs' | 'updatedAtMs'>;

/** Position the player has most likely reached by `nowMs`, clamped to the track length. */
export function extrapolatePosition(np: Timing, nowMs: number): number {
  const elapsed = np.isPlaying ? Math.max(0, nowMs - np.updatedAtMs) : 0;
  const position = Math.max(0, np.positionMs + elapsed);
  return np.durationMs > 0 ? Math.min(position, np.durationMs) : position;
}

/** 0..1 completion ratio, or 0 when the duration is unknown (live streams, ads loading). */
export function progressRatio(positionMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, positionMs / durationMs));
}
