import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * For routes that exist only to receive a deep link: run `handle` against the shell, then get
 * back to the bare `/` route. A link that arrives while the app is running is pushed on top of
 * `/`, so pop it (a replace would stack a second `/` for the router's own back handling to
 * chew through); on cold start it is the only route, so replace it.
 */
export function useDeepLink(handle: () => void): void {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      handle();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }, [handle, router]),
  );
}
