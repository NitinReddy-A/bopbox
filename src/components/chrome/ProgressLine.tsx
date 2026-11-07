import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

type Props = {
  loading: boolean;
  /** 0-100, as reported by the WebView. */
  progress: number;
  color: string;
};

/** Hairline loading indicator along the bottom edge of the top bar. */
export function ProgressLine({ loading, progress, color }: Props) {
  const [scale] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const ratio = loading ? Math.min(1, Math.max(0.08, progress / 100)) : 1;
    const animation = Animated.parallel([
      Animated.timing(scale, { toValue: ratio, duration: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: loading ? 1 : 0, duration: loading ? 80 : 360, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished && !loading) scale.setValue(0);
    });
    return () => animation.stop();
  }, [loading, progress, scale, opacity]);

  return (
    <Animated.View
      testID="progress-line"
      pointerEvents="none"
      style={[
        styles.line,
        {
          backgroundColor: color,
          opacity,
          transform: [{ scaleX: scale }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, transformOrigin: 'left' },
});
