import type { ShellState } from './shellReducer';

export type BackDecision =
  | { type: 'closeSettings' }
  | { type: 'exitFullscreen' }
  /**
   * Hand it to the YouTube view, which never exits either: a playing video shrinks into the
   * miniplayer, otherwise it goes back a page, and at the first page the task moves to the
   * background so playback keeps going.
   */
  | { type: 'pageBack' };

/** What the hardware back button does, in priority order. */
export function decideBack(state: ShellState): BackDecision {
  if (state.settingsOpen) return { type: 'closeSettings' };
  if (state.fullscreen) return { type: 'exitFullscreen' };
  return { type: 'pageBack' };
}
