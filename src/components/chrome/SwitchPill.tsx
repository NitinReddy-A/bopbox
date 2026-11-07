import type { AppId } from '@bopbox/core';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { APPS, otherApp } from '@/lib/apps';
import { radius, space, type as typo } from '@/theme/tokens';

/** Hop straight to the other app without detouring through home. */
export function SwitchPill({ app, onSwitch }: { app: AppId; onSwitch: (to: AppId) => void }) {
  const target = APPS[otherApp(app)];
  return (
    <PressableScale onPress={() => onSwitch(target.id)} accessibilityLabel={`Switch to ${target.name}`} depth={0.9}>
      <LinearGradient colors={target.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pill}>
        <Text style={[typo.label, styles.text]}>⇄ {target.glyph}</Text>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  text: { color: '#FFFFFF' },
});
