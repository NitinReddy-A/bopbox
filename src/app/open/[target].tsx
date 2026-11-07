import { BopboxCore } from '@bopbox/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { resolveOpenTarget } from '@/lib/deepLink';
import { useDeepLink } from '@/shell/useDeepLink';
import { useShell } from '@/shell/ShellContext';

/** `bopbox://open/{youtube|spotify|home|now}` from widgets and the media notification. */
export default function OpenLink() {
  const { target } = useLocalSearchParams<{ target: string }>();
  const { openApp, goHome } = useShell();

  useDeepLink(
    useCallback(() => {
      const destination = resolveOpenTarget(target, BopboxCore.getNowPlaying());
      if (destination.surface === 'app') openApp(destination.app);
      else goHome();
    }, [target, openApp, goHome]),
  );

  return null;
}
