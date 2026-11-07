import type { NowPlaying } from '@bopbox/core';
import { useEffect, useState } from 'react';

import { extrapolatePosition } from '@/lib/progress';

const TICK_MS = 500;

/** Current playback position, ticking locally between native updates while playing. */
export function usePlaybackPosition(nowPlaying: NowPlaying | null): number {
  const [now, setNow] = useState(Date.now);
  const playing = nowPlaying?.isPlaying ?? false;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  return nowPlaying ? extrapolatePosition(nowPlaying, now) : 0;
}
