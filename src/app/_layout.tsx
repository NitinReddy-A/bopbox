import { Slot } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Shell } from '@/shell/Shell';
import { ShellProvider } from '@/shell/ShellContext';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Why the whole UI lives here instead of in routes: the YouTube/Spotify WebViews must never
 * unmount (that kills background playback). The root layout is the one component Expo Router
 * keeps mounted for the app's lifetime, so the Shell (and its Stage of BrowserViews) is a
 * sibling of <Slot />, outside every route's subtree. Routes are reduced to one-shot
 * dispatchers (deep links) or nothing (`/`), so navigating between them can only remount the
 * route components, never the Shell. <Slot /> renders the focused route without native screen
 * containers, and every route renders null, so it adds no views on top of the Shell.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <ShellProvider>
        <View style={styles.root}>
          <Slot />
          <Shell />
        </View>
      </ShellProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
