import type { AppId, NowPlaying } from '@bopbox/core';

import { isAppId } from './apps';

export type DeepLinkTarget = { surface: 'home' } | { surface: 'app'; app: AppId };

/**
 * Maps the `[target]` segment of `bopbox://open/<target>` to a surface. `now` follows whichever
 * app currently owns playback; anything unknown lands on home.
 */
export function resolveOpenTarget(target: string | undefined, nowPlaying: NowPlaying | null): DeepLinkTarget {
  if (isAppId(target)) return { surface: 'app', app: target };
  if (target === 'now' && nowPlaying) return { surface: 'app', app: nowPlaying.appId };
  return { surface: 'home' };
}
