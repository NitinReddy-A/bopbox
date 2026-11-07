import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

type Props = {
  visible: boolean;
  /** `slide` enters from the right (pushed screens), `fade` cross-fades with a slight lift. */
  variant: 'slide' | 'fade';
  children: ReactNode;
  testID?: string;
};

/**
 * Opaque full-screen overlay that animates in/out and unmounts once hidden, so the
 * BrowserView beneath receives touches again.
 */
export function AnimatedSurface({ visible, variant, children, testID }: Props) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [mounted, setMounted] = useState(visible);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? motion.base : motion.fast,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  if (!mounted) return null;

  const transform =
    variant === 'slide'
      ? [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width * 0.35, 0] }) }]
      : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }];

  return (
    <Animated.View
      testID={testID}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, opacity: progress, transform }]}
    >
      {children}
    </Animated.View>
  );
}
