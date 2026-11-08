import { BrowserView, type BrowserViewProps, type BrowserViewRef } from '@bopbox/core';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadErrorOverlay } from '@/components/chrome/LoadErrorOverlay';

import { useShell, useShellState } from './ShellContext';

type Props = {
  /** Space kept clear for the status and navigation bars; 0 when immersive. */
  top: number;
  bottom: number;
};

/**
 * The YouTube view, mounted once for the app's lifetime. It is never unmounted or hidden, so
 * the native WebView stays attached to the window and keeps playing in the background.
 */
export function Stage({ top, bottom }: Props) {
  const { loadError } = useShellState();
  const { attachBrowser, dispatch, run, openUrl } = useShell();
  const ref = useCallback((browser: BrowserViewRef | null) => attachBrowser(browser), [attachBrowser]);

  const handlers = useMemo<Omit<BrowserViewProps, 'appId' | 'style'>>(
    () => ({
      onNavigationStateChange: (e) => dispatch({ type: 'SET_NAV', nav: e.nativeEvent }),
      onFullscreenChange: (e) => dispatch({ type: 'SET_FULLSCREEN', fullscreen: e.nativeEvent.fullscreen }),
      onLoadError: (e) => dispatch({ type: 'SET_LOAD_ERROR', error: e.nativeEvent }),
      onSwitchApp: (e) => openUrl(e.nativeEvent.url),
    }),
    [dispatch, openUrl],
  );

  return (
    <View style={[styles.stage, { top, bottom }]} testID="stage">
      <BrowserView ref={ref} appId="youtube" style={StyleSheet.absoluteFill} {...handlers} />
      {loadError && (
        <LoadErrorOverlay
          error={loadError}
          onRetry={() => {
            dispatch({ type: 'SET_LOAD_ERROR', error: null });
            run((b) => b.reload());
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', left: 0, right: 0 },
});
