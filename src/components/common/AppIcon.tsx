import type { AppId } from '@bopbox/core';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { APPS } from '@/lib/apps';
import { ICON_CORNER } from '@/theme/tokens';

type Props = {
  /** An app, or any glyph on a colour (settings rows, search, home). */
  app?: AppId;
  icon?: IconName;
  color?: string;
  size: number;
};

/**
 * An iOS-style app icon: a squircle in the app's colour with a white glyph and the faintest
 * top-light, so it reads as an object rather than a flat swatch.
 */
export function AppIcon({ app, icon, color, size }: Props) {
  const glyph = app ? APPS[app].icon : (icon ?? 'note');
  const fill = app ? APPS[app].color : (color ?? '#8E8E93');
  return (
    <View
      style={[styles.base, { width: size, height: size, borderRadius: size * ICON_CORNER, backgroundColor: fill }]}
      accessible={false}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Icon name={glyph} color="#FFFFFF" size={size * 0.6} weight={2.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
