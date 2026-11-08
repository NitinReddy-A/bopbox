import * as Haptics from 'expo-haptics';

/**
 * Haptics are reserved for moments with a cause: a value ticking past a step, a toggle
 * flipping, a sheet snapping home, a task succeeding or failing. Never on plain taps or scroll.
 */
export type Feel = 'selection' | 'toggleOn' | 'toggleOff' | 'snap' | 'confirm' | 'reject';

const FEELS: Record<Feel, Haptics.AndroidHaptics> = {
  selection: Haptics.AndroidHaptics.Segment_Tick,
  toggleOn: Haptics.AndroidHaptics.Toggle_On,
  toggleOff: Haptics.AndroidHaptics.Toggle_Off,
  snap: Haptics.AndroidHaptics.Gesture_End,
  confirm: Haptics.AndroidHaptics.Confirm,
  reject: Haptics.AndroidHaptics.Reject,
};

/** Fire-and-forget; feedback is decoration, so failures are ignored. */
export function haptic(feel: Feel): void {
  Haptics.performAndroidHapticsAsync(FEELS[feel]).catch(() => {});
}
