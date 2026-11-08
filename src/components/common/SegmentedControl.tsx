import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius, type as typo } from '@/theme/tokens';

export type Segment<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

const PAD = 2;

/**
 * iOS segmented control: a raised thumb slides between equal segments (ease-in-out, because
 * it moves across the control rather than entering it). The haptic fires on the press, not
 * when the thumb lands.
 */
export function SegmentedControl<T extends string>({ label, segments, value, onChange }: Props<T>) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = index * segmentWidth;
    x.set(reduced || segmentWidth === 0 ? target : withTiming(target, { duration: motion.medium, easing: motion.easeInOut }));
  }, [index, segmentWidth, reduced, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: t.fill }]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: segmentWidth, backgroundColor: t.scheme === 'dark' ? t.tertiary : t.surface },
            thumbStyle,
          ]}
        />
      )}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${segment.label}`}
            accessibilityState={{ selected }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onChange(segment.value);
            }}
            style={styles.segment}
          >
            <Text style={[selected ? typo.footnoteStrong : typo.footnote, { color: t.label }]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.sm + PAD, padding: PAD, height: 34 },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.sm,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.10), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.04)',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
