import type { BrowserViewRef } from '@bopbox/core';
import { createContext, useContext, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';

import { BrowserRegistry, type BrowserCommand } from './browserRegistry';
import { createInitialState, shellReducer, type ShellAction, type ShellState } from './shellReducer';

export type ShellApi = {
  dispatch: Dispatch<ShellAction>;
  openSettings(): void;
  closeSettings(): void;
  /** Send a command to the YouTube view, queued until the view exists. */
  run(command: BrowserCommand): void;
  /** Open a YouTube URL (a shared link, a notification tap) in the app. */
  openUrl(url: string): void;
  attachBrowser(ref: BrowserViewRef | null): void;
};

const StateContext = createContext<ShellState | null>(null);
const ApiContext = createContext<ShellApi | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shellReducer, undefined, createInitialState);
  const [registry] = useState(() => new BrowserRegistry());

  const api = useMemo<ShellApi>(
    () => ({
      dispatch,
      openSettings: () => dispatch({ type: 'OPEN_SETTINGS' }),
      closeSettings: () => dispatch({ type: 'CLOSE_SETTINGS' }),
      run: (command) => registry.run('youtube', command),
      openUrl(url) {
        dispatch({ type: 'CLOSE_SETTINGS' });
        registry.run('youtube', (browser) => browser.loadUrl(url));
      },
      attachBrowser: (ref) => registry.attach('youtube', ref),
    }),
    [registry],
  );

  return (
    <ApiContext.Provider value={api}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ApiContext.Provider>
  );
}

export function useShellState(): ShellState {
  const state = useContext(StateContext);
  if (!state) throw new Error('useShellState must be used inside <ShellProvider>');
  return state;
}

/** Stable shell commands; components using only this don't re-render on state changes. */
export function useShell(): ShellApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useShell must be used inside <ShellProvider>');
  return api;
}
