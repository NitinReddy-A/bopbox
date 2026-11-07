import { useState, type ReactNode } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** How far the element shrinks while pressed. */
  depth?: number;
  silent?: boolean;
};

/** Pressable that squishes a little and ticks the haptics motor. The house button. */
export function PressableScale({ style, children, depth = 0.96, silent, onPress, onPressIn, onPressOut, ...rest }: Props) {
  const [scale] = useState(() => new Animated.Value(1));

  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        animateTo(depth);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (!silent) haptic('tap');
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
