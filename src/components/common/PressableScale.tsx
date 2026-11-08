import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { haptic, type Feel } from '@/lib/haptics';
import { CSS_EASE_OUT, motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Scale while pressed. 0.97 for buttons and cards; smaller targets can go to 0.9. */
  depth?: number;
  /** Optional haptic on a committed press. Off by default: haptics are for meaningful moments. */
  feel?: Feel;
};

/**
 * The house pressable. Feedback lands on press-in (never on release), scales with a 120ms
 * ease-out transition on the UI thread, and forgives a drifting finger.
 */
export function PressableScale({
  style,
  children,
  depth = 0.97,
  feel,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={8}
      pressRetentionOffset={16}
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feel) haptic(feel);
        onPress?.(e);
      }}
      style={[
        style,
        {
          opacity: disabled ? 0.35 : 1,
          transform: [{ scale: pressed ? depth : 1 }],
          transitionProperty: ['transform', 'opacity'],
          transitionDuration: motion.press,
          transitionTimingFunction: CSS_EASE_OUT,
        },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
