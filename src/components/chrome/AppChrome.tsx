import type { AppId } from '@bopbox/core';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { APPS } from '@/lib/apps';
import { useShell, useShellState } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space, TOP_BAR_HEIGHT, type as typo } from '@/theme/tokens';

import { AppMenu } from './AppMenu';
import { ProgressLine } from './ProgressLine';
import { SwitchPill } from './SwitchPill';

/**
 * Top bar shown above an active app, plus an opaque strip under the navigation bar. The Stage
 * positions the WebView exactly between the two, so neither ever covers page content.
 */
export function AppChrome({ app }: { app: AppId }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { goHome, openApp, run } = useShell();
  const nav = useShellState().nav[app];
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const meta = APPS[app];
  const barBottom = insets.top + TOP_BAR_HEIGHT;

  return (
    <>
      <View style={[styles.bar, { paddingTop: insets.top, height: barBottom, backgroundColor: t.bg }]}>
        <PressableScale onPress={goHome} accessibilityLabel="Back to bopbox home" depth={0.9} style={styles.logo}>
          <Text style={[typo.title, { color: t.accent }]}>b●</Text>
        </PressableScale>
        <View style={styles.titles}>
          <Text style={[typo.mono, { color: meta.gradient[0] }]}>{meta.name.toUpperCase()}</Text>
          <Text style={[typo.label, { color: t.text }]} numberOfLines={1}>
            {nav.title || (nav.loading ? 'loading…' : meta.tagline)}
          </Text>
        </View>
        <SwitchPill app={app} onSwitch={(to) => openApp(to)} />
        <IconButton glyph="↻" label="Reload" onPress={() => run(app, (b) => b.reload())} />
        <IconButton glyph="⋮" label="Menu" onPress={() => setMenuOpen(true)} />
        <ProgressLine loading={nav.loading} progress={nav.progress} color={t.accent} />
      </View>
      <View style={[styles.navStrip, { height: insets.bottom, backgroundColor: t.bg }]} />
      {menuOpen && <AppMenu app={app} nav={nav} top={barBottom} onClose={closeMenu} />}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  logo: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  titles: { flex: 1, marginLeft: space.xs },
  navStrip: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
