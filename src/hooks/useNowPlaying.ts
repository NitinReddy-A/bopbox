import { BopboxCore, type NowPlaying } from '@bopbox/core';

import { createNativeStore, useNativeStore } from './nativeStore';

const nowPlayingStore = createNativeStore(
  'onNowPlayingChanged',
  () => BopboxCore.getNowPlaying(),
  (event) => event.nowPlaying,
);

export function useNowPlaying(): NowPlaying | null {
  return useNativeStore(nowPlayingStore);
}
