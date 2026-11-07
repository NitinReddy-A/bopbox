import { BrowserView, type AppId, type BrowserViewProps, type BrowserViewRef } from '@bopbox/core';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadErrorOverlay } from '@/components/chrome/LoadErrorOverlay';
import { APP_IDS } from '@/lib/apps';

import { useShell, useShellState } from './ShellContext';
import { isAppSurface } from './shellReducer';

type Props = {
  /** Space reserved for chrome above and below the page; 0 when immersive. */
  top: number;
  bottom: number;
};

/**
 * Permanent home of the app WebViews. Each BrowserView mounts the first time its app opens
 * and is never unmounted afterwards: inactive ones are only made invisible and untouchable,
 * so the native WebView stays attached to the window and keeps playing.
 */
export function Stage({ top, bottom }: Props) {
  const { opened, surface, loadError } = useShellState();
  const { run, goHome, dispatch } = useShell();
  const active = isAppSurface(surface) ? surface : null;
  const error = active ? loadError[active] : null;

  return (
    <View style={[styles.stage, { top, bottom }]} pointerEvents="box-none" testID="stage">
      {APP_IDS.filter((app) => opened.includes(app)).map((app) => (
        <AppBrowser key={app} app={app} visible={app === active} />
      ))}
      {active && error && (
        <LoadErrorOverlay
          app={active}
          error={error}
          onHome={goHome}
          onRetry={() => {
            dispatch({ type: 'SET_LOAD_ERROR', app: active, error: null });
            run(active, (b) => b.reload());
          }}
        />
      )}
    </View>
  );
}

const AppBrowser = memo(function AppBrowser({ app, visible }: { app: AppId; visible: boolean }) {
  const { attachBrowser, dispatch, openApp } = useShell();

  const ref = useCallback((browser: BrowserViewRef | null) => attachBrowser(app, browser), [app, attachBrowser]);

  const handlers = useMemo<Omit<BrowserViewProps, 'appId' | 'style'>>(
    () => ({
      onNavigationStateChange: (e) => dispatch({ type: 'SET_NAV', app, nav: e.nativeEvent }),
      onFullscreenChange: (e) => dispatch({ type: 'SET_FULLSCREEN', fullscreen: e.nativeEvent.fullscreen }),
      onLoadError: (e) => dispatch({ type: 'SET_LOAD_ERROR', app, error: e.nativeEvent }),
      onSwitchApp: (e) => {
        const { appId, url } = e.nativeEvent;
        openApp(appId, (b) => b.loadUrl(url));
      },
    }),
    [app, dispatch, openApp],
  );

  // The wrapper owns visibility so it relies only on core View semantics (opacity, zIndex,
  // pointerEvents); the BrowserView itself never changes props when switching apps.
  return (
    <View
      testID={`browser-${app}`}
      collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, visible ? styles.visible : styles.hidden]}
    >
      <BrowserView ref={ref} appId={app} style={StyleSheet.absoluteFill} {...handlers} />
    </View>
  );
});

const styles = StyleSheet.create({
  stage: { position: 'absolute', left: 0, right: 0 },
  // Never display:none or unmount: the native WebView must stay attached to the window.
  visible: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
});
