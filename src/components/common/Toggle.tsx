import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { CSS_EASE_OUT, motion } from '@/theme/tokens';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
};

const W = 51;
const H = 31;
const KNOB = 27;
const STRETCH = 7;

/**
 * An iOS switch. The knob stretches toward its travel while held (the "squish" that makes it
 * feel physical), slides on release, and the haptic lands on the flip itself.
 */
export function Toggle({ value, onValueChange, label, disabled, testID }: Props) {
  const t = useTheme();
  const [held, setHeld] = useState(false);
  const knobWidth = held ? KNOB + STRETCH : KNOB;
  const x = value ? W - 2 - knobWidth : 2;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      testID={testID}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      onPress={() => {
        haptic(value ? 'toggleOff' : 'toggleOn');
        onValueChange(!value);
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: value ? t.success : t.fill,
            transitionProperty: 'backgroundColor',
            transitionDuration: motion.small,
            transitionTimingFunction: CSS_EASE_OUT,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              width: knobWidth,
              transform: [{ translateX: x }],
              transitionProperty: ['transform', 'width'],
              transitionDuration: motion.small,
              transitionTimingFunction: CSS_EASE_OUT,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2 },
  knob: {
    position: 'absolute',
    top: 2,
    left: 0,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.18), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.04)',
  },
});
