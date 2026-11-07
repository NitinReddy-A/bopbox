import { BopboxCore, type AppId, type BrowserViewRef } from '@bopbox/core';
import { createContext, useContext, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';

import { BrowserRegistry, type BrowserCommand } from './browserRegistry';
import { createInitialState, shellReducer, type ShellAction, type ShellState } from './shellReducer';

export type ShellApi = {
  dispatch: Dispatch<ShellAction>;
  /** Show an app (mounting its BrowserView on first use), then optionally drive it. */
  openApp(app: AppId, command?: BrowserCommand): void;
  goHome(): void;
  openSettings(): void;
  closeSettings(): void;
  focusSearch(): void;
  /** Send a command to an app's browser, queued until the view exists. */
  run(app: AppId, command: BrowserCommand): void;
  attachBrowser(app: AppId, ref: BrowserViewRef | null): void;
};

const StateContext = createContext<ShellState | null>(null);
const ApiContext = createContext<ShellApi | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(shellReducer, undefined, () =>
    createInitialState(BopboxCore.getSettings().launchTarget),
  );
  const [registry] = useState(() => new BrowserRegistry());

  const api = useMemo<ShellApi>(
    () => ({
      dispatch,
      openApp(app, command) {
        dispatch({ type: 'OPEN_APP', app });
        if (command) registry.run(app, command);
      },
      goHome: () => dispatch({ type: 'GO_HOME' }),
      openSettings: () => dispatch({ type: 'OPEN_SETTINGS' }),
      closeSettings: () => dispatch({ type: 'CLOSE_SETTINGS' }),
      focusSearch: () => dispatch({ type: 'FOCUS_SEARCH' }),
      run: (app, command) => registry.run(app, command),
      attachBrowser: (app, ref) => registry.attach(app, ref),
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
