import { BopboxCore, type AdblockStats } from '@bopbox/core';

import { createNativeStore, useNativeStore } from './nativeStore';

export const adblockStatsStore = createNativeStore(
  'onAdblockStatsChanged',
  () => BopboxCore.getAdblockStats(),
  (stats) => stats,
);

export function useAdblockStats(): AdblockStats {
  return useNativeStore(adblockStatsStore);
}
