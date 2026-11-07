import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type Props = {
  playing: boolean;
  color: string;
  height?: number;
  bars?: number;
};

const DURATIONS = [420, 560, 380, 500, 460];

/** Little bouncing equalizer: animates while playing, settles flat when paused. */
export function EqualizerBars({ playing, color, height = 14, bars = 4 }: Props) {
  const [values] = useState(() => Array.from({ length: bars }, () => new Animated.Value(0.3)));

  useEffect(() => {
    if (!playing) {
      const settle = Animated.parallel(
        values.map((v) => Animated.timing(v, { toValue: 0.3, duration: 200, useNativeDriver: true })),
      );
      settle.start();
      return () => settle.stop();
    }
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: DURATIONS[i % DURATIONS.length],
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: DURATIONS[(i + 2) % DURATIONS.length],
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [playing, values]);

  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { height, backgroundColor: color, transform: [{ scaleY: v }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 2 },
});
