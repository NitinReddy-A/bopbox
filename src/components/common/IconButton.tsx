import { StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import type { Feel } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

import { PressableScale } from './PressableScale';

type Props = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Visual diameter; the hit target never drops below 44. */
  size?: number;
  /** `plain`: glyph only. `tinted`: soft fill circle. `filled`: the accent, for the one primary control. */
  tone?: 'plain' | 'tinted' | 'filled';
  color?: string;
  disabled?: boolean;
  feel?: Feel;
  testID?: string;
};

export function IconButton({ icon, label, onPress, size = 36, tone = 'plain', color, disabled, feel, testID }: Props) {
  const t = useTheme();
  const glyph = tone === 'filled' ? t.onAccent : (color ?? t.label);
  const slop = Math.max(0, (44 - size) / 2);
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={slop}
      depth={0.9}
      feel={feel}
      onPress={onPress}
      testID={testID}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'tinted' && { backgroundColor: t.fill },
        tone === 'filled' && { backgroundColor: t.accent },
      ]}
    >
      <Icon name={icon} color={glyph} size={tone === 'plain' ? size * 0.72 : size * 0.52} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
