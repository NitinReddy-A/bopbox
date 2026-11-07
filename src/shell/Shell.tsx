import { BopboxCore } from '@bopbox/core';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedSurface } from '@/components/common/AnimatedSurface';
import { AppChrome } from '@/components/chrome/AppChrome';
import { HomeScreen } from '@/components/home/HomeScreen';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { usePipMode } from '@/hooks/usePipMode';
import { useTheme } from '@/theme/ThemeProvider';
import { TOP_BAR_HEIGHT } from '@/theme/tokens';

import { Stage } from './Stage';
import { useShell, useShellState } from './ShellContext';
import { isAppSurface, isImmersive } from './shellReducer';
import { useBackHandler } from './useBackHandler';

/**
 * Everything the user sees: the persistent Stage of WebViews at the bottom, app chrome over
 * it, and the opaque Home / Settings surfaces on top.
 */
export function Shell() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const state = useShellState();
  const { dispatch } = useShell();
  const inPip = usePipMode();
  const activeApp = isAppSurface(state.surface) ? state.surface : null;
  const immersive = isImmersive(state);
  const showChrome = activeApp !== null && !immersive;

  useBackHandler(state);

  useEffect(() => {
    dispatch({ type: 'SET_PIP', inPip });
  }, [inPip, dispatch]);

  // Native uses this to decide whether leaving the app should auto-enter PiP.
  useEffect(() => {
    BopboxCore.setVisibleApp(activeApp);
  }, [activeApp]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: immersive ? '#000000' : t.bg }]}>
      <StatusBar hidden={immersive} style={t.scheme === 'dark' ? 'light' : 'dark'} animated />
      <Stage top={showChrome ? insets.top + TOP_BAR_HEIGHT : 0} bottom={showChrome ? insets.bottom : 0} />
      {showChrome && <AppChrome app={activeApp} />}
      <AnimatedSurface visible={state.surface === 'home'} variant="fade" testID="surface-home">
        <HomeScreen />
      </AnimatedSurface>
      <AnimatedSurface visible={state.surface === 'settings'} variant="slide" testID="surface-settings">
        <SettingsScreen />
      </AnimatedSurface>
    </View>
  );
}
