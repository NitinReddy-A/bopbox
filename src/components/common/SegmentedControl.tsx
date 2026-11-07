import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

export type Segment<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, segments, value, onChange }: Props<T>) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { backgroundColor: t.bg }]}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${segment.label}`}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptic('tick');
              onChange(segment.value);
            }}
            style={[styles.segment, selected && { backgroundColor: t.accent }]}
          >
            <Text style={[typo.label, { color: selected ? t.accentInk : t.textDim }]}>{segment.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, gap: 2 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
});
