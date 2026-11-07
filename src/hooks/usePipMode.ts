import { BopboxCore } from '@bopbox/core';

import { createNativeStore, useNativeStore } from './nativeStore';

const pipStore = createNativeStore(
  'onPipModeChanged',
  () => BopboxCore.isInPip(),
  (event) => event.inPip,
);

export function usePipMode(): boolean {
  return useNativeStore(pipStore);
}
