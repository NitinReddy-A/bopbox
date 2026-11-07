import type { AppId, LaunchTarget, NavigationState } from '@bopbox/core';

export type Surface = 'home' | 'settings' | AppId;

export type LoadError = { url: string; description: string };

export type ShellState = {
  surface: Surface;
  /** Where CLOSE_SETTINGS returns to (settings can be opened from home or from an app menu). */
  settingsReturn: 'home' | AppId;
  /** Apps whose BrowserView has been mounted. Grows only: views are never unmounted. */
  opened: AppId[];
  fullscreen: boolean;
  inPip: boolean;
  nav: Record<AppId, NavigationState>;
  loadError: Record<AppId, LoadError | null>;
  /** Home should focus its search field once, then clear this. */
  searchFocus: boolean;
};

export type ShellAction =
  | { type: 'OPEN_APP'; app: AppId }
  | { type: 'GO_HOME' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'SET_NAV'; app: AppId; nav: NavigationState }
  | { type: 'SET_FULLSCREEN'; fullscreen: boolean }
  | { type: 'SET_PIP'; inPip: boolean }
  | { type: 'SET_LOAD_ERROR'; app: AppId; error: LoadError | null }
  | { type: 'FOCUS_SEARCH' }
  | { type: 'SEARCH_FOCUSED' };

export const EMPTY_NAV: NavigationState = {
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  progress: 0,
};

export function isAppSurface(surface: Surface): surface is AppId {
  return surface !== 'home' && surface !== 'settings';
}

export function createInitialState(launchTarget: LaunchTarget): ShellState {
  return {
    surface: launchTarget,
    settingsReturn: 'home',
    opened: launchTarget === 'home' ? [] : [launchTarget],
    fullscreen: false,
    inPip: false,
    nav: { youtube: EMPTY_NAV, spotify: EMPTY_NAV },
    loadError: { youtube: null, spotify: null },
    searchFocus: false,
  };
}

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'OPEN_APP':
      return {
        ...state,
        surface: action.app,
        opened: state.opened.includes(action.app) ? state.opened : [...state.opened, action.app],
      };
    case 'GO_HOME':
      return state.surface === 'home' ? state : { ...state, surface: 'home' };
    case 'OPEN_SETTINGS':
      if (state.surface === 'settings') return state;
      return { ...state, surface: 'settings', settingsReturn: state.surface };
    case 'CLOSE_SETTINGS':
      if (state.surface !== 'settings') return state;
      return { ...state, surface: state.settingsReturn };
    case 'SET_NAV': {
      // A fresh page load supersedes whatever error the previous one hit.
      const startedLoading = action.nav.loading && !state.nav[action.app].loading;
      return {
        ...state,
        nav: { ...state.nav, [action.app]: action.nav },
        loadError: startedLoading ? { ...state.loadError, [action.app]: null } : state.loadError,
      };
    }
    case 'SET_FULLSCREEN':
      return state.fullscreen === action.fullscreen ? state : { ...state, fullscreen: action.fullscreen };
    case 'SET_PIP':
      return state.inPip === action.inPip ? state : { ...state, inPip: action.inPip };
    case 'SET_LOAD_ERROR':
      return { ...state, loadError: { ...state.loadError, [action.app]: action.error } };
    case 'FOCUS_SEARCH':
      return { ...state, surface: 'home', searchFocus: true };
    case 'SEARCH_FOCUSED':
      return state.searchFocus ? { ...state, searchFocus: false } : state;
  }
}

/** True when the active app should own the whole screen with no chrome. */
export function isImmersive(state: ShellState): boolean {
  return state.inPip || (state.fullscreen && isAppSurface(state.surface));
}
