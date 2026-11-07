import { BopboxCore, type AppId, type NavigationState } from '@bopbox/core';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { APPS } from '@/lib/apps';
import { haptic } from '@/lib/haptics';
import { useShell } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

type Props = {
  app: AppId;
  nav: NavigationState;
  top: number;
  onClose: () => void;
};

type Item = { label: string; onPress: () => void; disabled?: boolean };

export function AppMenu({ app, nav, top, onClose }: Props) {
  const t = useTheme();
  const { run, openSettings } = useShell();

  // Registered after the shell's handler, so back closes the menu first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const items: Item[] = [
    { label: 'forward', disabled: !nav.canGoForward, onPress: () => run(app, (b) => b.goForward()) },
    { label: `${APPS[app].name} home`, onPress: () => run(app, (b) => b.goHome()) },
    { label: 'scroll to top', onPress: () => run(app, (b) => b.scrollToTop()) },
    ...(APPS[app].pip ? [{ label: 'pop out (PiP)', onPress: () => BopboxCore.enterPip() }] : []),
    { label: 'open settings', onPress: openSettings },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View
        accessibilityRole="menu"
        style={[styles.menu, { top, backgroundColor: t.surfaceRaised, borderColor: t.border }]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: item.disabled }}
            disabled={item.disabled}
            onPress={() => {
              haptic('tap');
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.border }]}
          >
            <Text style={[typo.body, { color: item.disabled ? t.textFaint : t.text }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    right: space.sm,
    minWidth: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.xs,
    elevation: 12,
  },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md },
});
