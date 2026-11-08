import type { NavigationState } from '@bopbox/core';

export type LoadError = { url: string; description: string };

/** Everything the shell tracks. YouTube is always on screen; Settings is a sheet above it. */
export type ShellState = {
  settingsOpen: boolean;
  fullscreen: boolean;
  inPip: boolean;
  nav: NavigationState;
  loadError: LoadError | null;
};

export type ShellAction =
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'SET_NAV'; nav: NavigationState }
  | { type: 'SET_FULLSCREEN'; fullscreen: boolean }
  | { type: 'SET_PIP'; inPip: boolean }
  | { type: 'SET_LOAD_ERROR'; error: LoadError | null };

export const EMPTY_NAV: NavigationState = {
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  progress: 0,
};

export function createInitialState(): ShellState {
  return { settingsOpen: false, fullscreen: false, inPip: false, nav: EMPTY_NAV, loadError: null };
}

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'OPEN_SETTINGS':
      return state.settingsOpen ? state : { ...state, settingsOpen: true };
    case 'CLOSE_SETTINGS':
      return state.settingsOpen ? { ...state, settingsOpen: false } : state;
    case 'SET_NAV': {
      // A fresh page load supersedes whatever error the previous one hit.
      const startedLoading = action.nav.loading && !state.nav.loading;
      return { ...state, nav: action.nav, loadError: startedLoading ? null : state.loadError };
    }
    case 'SET_FULLSCREEN':
      return state.fullscreen === action.fullscreen ? state : { ...state, fullscreen: action.fullscreen };
    case 'SET_PIP':
      return state.inPip === action.inPip ? state : { ...state, inPip: action.inPip };
    case 'SET_LOAD_ERROR':
      return { ...state, loadError: action.error };
  }
}

/** True when the video should own the whole screen, system bars included. */
export function isImmersive(state: ShellState): boolean {
  return state.inPip || state.fullscreen;
}
