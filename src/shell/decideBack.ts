import type { AppId } from '@bopbox/core';

import { isAppSurface, type ShellState } from './shellReducer';

export type BackDecision =
  | { type: 'closeSettings' }
  | { type: 'exitFullscreen'; app: AppId }
  | { type: 'goBack'; app: AppId }
  | { type: 'goHome' }
  /** Never exit: the task goes to the background so music keeps playing. */
  | { type: 'moveToBackground' };

export function decideBack(state: ShellState): BackDecision {
  const { surface } = state;
  if (surface === 'settings') return { type: 'closeSettings' };
  if (isAppSurface(surface)) {
    if (state.fullscreen) return { type: 'exitFullscreen', app: surface };
    if (state.nav[surface].canGoBack) return { type: 'goBack', app: surface };
    return { type: 'goHome' };
  }
  return { type: 'moveToBackground' };
}
