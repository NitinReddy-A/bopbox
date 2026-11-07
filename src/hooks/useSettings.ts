import { BopboxCore, type Settings } from '@bopbox/core';
import { useCallback } from 'react';

import { createNativeStore, useNativeStore } from './nativeStore';

export const settingsStore = createNativeStore(
  'onSettingsChanged',
  () => BopboxCore.getSettings(),
  (settings) => settings,
);

export type UpdateSettings = (patch: Partial<Settings>) => void;

/** Native owns settings; this hook mirrors them and writes patches straight through. */
export function useSettings(): [Settings, UpdateSettings] {
  const settings = useNativeStore(settingsStore);
  const update = useCallback<UpdateSettings>((patch) => {
    settingsStore.set(BopboxCore.updateSettings(patch));
  }, []);
  return [settings, update];
}
