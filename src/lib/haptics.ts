import * as Haptics from 'expo-haptics';

type Feel = 'tap' | 'toggleOn' | 'toggleOff' | 'tick' | 'confirm' | 'reject';

const FEELS: Record<Feel, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Virtual_Key,
  toggleOn: Haptics.AndroidHaptics.Toggle_On,
  toggleOff: Haptics.AndroidHaptics.Toggle_Off,
  tick: Haptics.AndroidHaptics.Segment_Tick,
  confirm: Haptics.AndroidHaptics.Confirm,
  reject: Haptics.AndroidHaptics.Reject,
};

/** Fire-and-forget haptic; feedback is decoration, so failures are ignored. */
export function haptic(feel: Feel = 'tap'): void {
  Haptics.performAndroidHapticsAsync(FEELS[feel]).catch(() => {});
}
