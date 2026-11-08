import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';

/** Mount while visible or animating out; unmount once the exit settles. */
function usePresence(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  return [mounted, setMounted] as const;
}

/** Where a flick would come to rest (Apple's exponential-decay projection). */
function project(velocity: number, decelerationRate = 0.998) {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past an edge, follow the finger less and less. */
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

type SheetLayerProps = {
  visible: boolean;
  progress: SharedValue<number>;
  onDismiss: () => void;
  /** Renders the sheet. `grabRegion` wraps the area that can be dragged to dismiss. */
  children: (grabRegion: (node: ReactNode) => ReactNode) => ReactNode;
  testID?: string;
};

/**
 * An iOS page sheet. It rises on a critically damped spring, can be grabbed mid-flight from
 * its header, follows the finger 1:1, resists past the top, and decides on release from the
 * projected landing point, so a short flick dismisses as surely as a long drag.
 */
export function SheetLayer({ visible, progress, onDismiss, children, testID }: SheetLayerProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = usePresence(visible);
  const closingByGesture = useRef(false);
  const start = useSharedValue(0);
  const top = insets.top + 10;
  const travel = screen - top;

  useEffect(() => {
    if (visible) {
      closingByGesture.current = false;
      progress.set(reduced ? withTiming(1, { duration: motion.small }) : withSpring(1, motion.settle));
      return;
    }
    if (closingByGesture.current) return; // the release spring is already carrying it out
    progress.set(
      withTiming(0, { duration: reduced ? motion.small : 280, easing: motion.easeOut }, (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      }),
    );
  }, [visible, reduced, progress, setMounted]);

  const dismissFromGesture = () => {
    closingByGesture.current = true;
    haptic('snap');
    onDismiss();
  };

  const pan = usePanGesture({
    activeOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      start.set(progress.get());
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.get() - e.translationY / travel;
      progress.set(next > 1 ? 1 + rubberband(next - 1, 1) : Math.max(0, next));
    },
    onDeactivate: (e) => {
      'worklet';
      const landing = progress.get() - project(e.velocityY) / travel;
      const velocity = -e.velocityY / travel;
      if (landing < 0.6) {
        progress.set(
          withSpring(0, { ...motion.sheet, dampingRatio: 1, velocity, overshootClamping: true }, (finished) => {
            if (finished) scheduleOnRN(setMounted, false);
          }),
        );
        scheduleOnRN(dismissFromGesture);
      } else {
        progress.set(withSpring(1, { ...motion.sheet, velocity }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: progress.get() }
      : { transform: [{ translateY: (1 - progress.get()) * (travel + insets.bottom) }] },
  );
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const grabRegion = useCallback((node: ReactNode) => <GestureDetector gesture={pan}>{node}</GestureDetector>, [pan]);

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, { top, backgroundColor: t.bg }, sheetStyle]}
      >
        {children(grabRegion)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
});
