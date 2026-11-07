import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { PressableScale } from './PressableScale';

type Props = {
  glyph: string;
  label: string;
  onPress: () => void;
  size?: number;
  tone?: 'plain' | 'filled';
  disabled?: boolean;
};

export function IconButton({ glyph, label, onPress, size = 40, tone = 'plain', disabled }: Props) {
  const t = useTheme();
  const filled = tone === 'filled';
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      depth={0.88}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        filled && { backgroundColor: t.accent },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.glyph, { fontSize: size * 0.45, color: filled ? t.accentInk : t.text }]}>{glyph}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontWeight: '800', includeFontPadding: false, textAlign: 'center' },
  disabled: { opacity: 0.35 },
});
