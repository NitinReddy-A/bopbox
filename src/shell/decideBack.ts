import type { ShellState } from './shellReducer';

export type BackDecision =
  | { type: 'closeSettings' }
  | { type: 'exitFullscreen' }
  | { type: 'goBack' }
  /** Never exit: the task goes to the background so playback keeps going. */
  | { type: 'moveToBackground' };

/** What the hardware back button does, in priority order. */
export function decideBack(state: ShellState): BackDecision {
  if (state.settingsOpen) return { type: 'closeSettings' };
  if (state.fullscreen) return { type: 'exitFullscreen' };
  if (state.nav.canGoBack) return { type: 'goBack' };
  return { type: 'moveToBackground' };
}
