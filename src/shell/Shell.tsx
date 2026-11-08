import { BopboxCore } from '@bopbox/core';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { usePipMode } from '@/hooks/usePipMode';
import { useTheme } from '@/theme/ThemeProvider';

import { SheetLayer } from './Layers';
import { Stage } from './Stage';
import { useShell, useShellState } from './ShellContext';
import { isImmersive } from './shellReducer';
import { useBackHandler } from './useBackHandler';

/**
 * The whole app: YouTube edge to edge between the system bars, and Tube's Settings as a page
 * sheet above it. There is no launcher screen; the app opens straight into YouTube.
 */
export function Shell() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const state = useShellState();
  const shell = useShell();
  const inPip = usePipMode();
  const sheet = useSharedValue(0);
  const immersive = isImmersive(state);

  useBackHandler(state);

  useEffect(() => {
    shell.dispatch({ type: 'SET_PIP', inPip });
  }, [inPip, shell]);

  // YouTube is always the visible app (auto picture-in-picture keys off this).
  useEffect(() => {
    BopboxCore.setVisibleApp('youtube');
  }, []);

  // Settings button inside YouTube's top bar, and YouTube links handed over by other apps.
  useEffect(() => {
    const launchUrl = BopboxCore.consumeLaunchUrl();
    if (launchUrl) shell.openUrl(launchUrl);
    const settingsSub = BopboxCore.addListener('onOpenSettings', () => shell.openSettings());
    const urlSub = BopboxCore.addListener('onOpenUrl', ({ url }) => {
      BopboxCore.consumeLaunchUrl();
      shell.openUrl(url);
    });
    return () => {
      settingsSub.remove();
      urlSub.remove();
    };
  }, [shell]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: immersive ? '#000000' : t.page }]}>
      <StatusBar hidden={immersive} style={t.scheme === 'dark' ? 'light' : 'dark'} animated />
      <Stage top={immersive ? 0 : insets.top} bottom={immersive ? 0 : insets.bottom} />
      <SheetLayer visible={state.settingsOpen} progress={sheet} onDismiss={shell.closeSettings} testID="surface-settings">
        {(grabRegion) => <SettingsScreen grabRegion={grabRegion} />}
      </SheetLayer>
    </View>
  );
}
