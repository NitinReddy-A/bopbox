import { createInitialState, EMPTY_NAV, isImmersive, shellReducer, type ShellAction, type ShellState } from '../shellReducer';

const run = (state: ShellState, ...actions: ShellAction[]) => actions.reduce(shellReducer, state);
const home = createInitialState('home');

describe('createInitialState', () => {
  it('starts on home with nothing mounted', () => {
    expect(home.surface).toBe('home');
    expect(home.opened).toEqual([]);
  });

  it('honours the launch target and pre-mounts that app only', () => {
    const state = createInitialState('spotify');
    expect(state.surface).toBe('spotify');
    expect(state.opened).toEqual(['spotify']);
  });
});

describe('shellReducer', () => {
  it('OPEN_APP shows the app and adds it to the mounted set once', () => {
    const state = run(home, { type: 'OPEN_APP', app: 'youtube' }, { type: 'GO_HOME' }, { type: 'OPEN_APP', app: 'youtube' });
    expect(state.surface).toBe('youtube');
    expect(state.opened).toEqual(['youtube']);
  });

  it('never forgets a mounted app', () => {
    const state = run(
      home,
      { type: 'OPEN_APP', app: 'youtube' },
      { type: 'OPEN_APP', app: 'spotify' },
      { type: 'GO_HOME' },
      { type: 'OPEN_SETTINGS' },
      { type: 'CLOSE_SETTINGS' },
    );
    expect(state.opened).toEqual(['youtube', 'spotify']);
  });

  it('settings returns to wherever it was opened from', () => {
    const fromApp = run(home, { type: 'OPEN_APP', app: 'spotify' }, { type: 'OPEN_SETTINGS' });
    expect(fromApp.surface).toBe('settings');
    expect(shellReducer(fromApp, { type: 'CLOSE_SETTINGS' }).surface).toBe('spotify');

    const fromHome = run(home, { type: 'OPEN_SETTINGS' }, { type: 'CLOSE_SETTINGS' });
    expect(fromHome.surface).toBe('home');
  });

  it('opening settings twice keeps the original return target', () => {
    const state = run(home, { type: 'OPEN_APP', app: 'youtube' }, { type: 'OPEN_SETTINGS' }, { type: 'OPEN_SETTINGS' });
    expect(state.settingsReturn).toBe('youtube');
  });

  it('CLOSE_SETTINGS is a no-op elsewhere', () => {
    expect(shellReducer(home, { type: 'CLOSE_SETTINGS' })).toBe(home);
  });

  it('stores navigation per app', () => {
    const nav = { ...EMPTY_NAV, url: 'https://m.youtube.com/', canGoBack: true };
    const state = shellReducer(home, { type: 'SET_NAV', app: 'youtube', nav });
    expect(state.nav.youtube).toEqual(nav);
    expect(state.nav.spotify).toEqual(EMPTY_NAV);
  });

  it('keeps a load error until a new page load starts', () => {
    const error = { url: 'https://m.youtube.com/', description: 'net::ERR_INTERNET_DISCONNECTED' };
    const loading = { ...EMPTY_NAV, loading: true };
    let state = run(
      home,
      { type: 'SET_NAV', app: 'youtube', nav: loading },
      { type: 'SET_LOAD_ERROR', app: 'youtube', error },
    );
    state = shellReducer(state, { type: 'SET_NAV', app: 'youtube', nav: { ...loading, progress: 80 } });
    expect(state.loadError.youtube).toEqual(error);
    state = shellReducer(state, { type: 'SET_NAV', app: 'youtube', nav: EMPTY_NAV });
    expect(state.loadError.youtube).toEqual(error);
    state = shellReducer(state, { type: 'SET_NAV', app: 'youtube', nav: loading });
    expect(state.loadError.youtube).toBeNull();
  });

  it('FOCUS_SEARCH goes home and raises the flag until handled', () => {
    const state = run(home, { type: 'OPEN_APP', app: 'spotify' }, { type: 'FOCUS_SEARCH' });
    expect(state).toMatchObject({ surface: 'home', searchFocus: true });
    expect(shellReducer(state, { type: 'SEARCH_FOCUSED' }).searchFocus).toBe(false);
  });

  it('returns the same object for redundant updates', () => {
    expect(shellReducer(home, { type: 'SET_PIP', inPip: false })).toBe(home);
    expect(shellReducer(home, { type: 'SET_FULLSCREEN', fullscreen: false })).toBe(home);
    expect(shellReducer(home, { type: 'GO_HOME' })).toBe(home);
  });
});

describe('isImmersive', () => {
  it('is true in PiP and for fullscreen video in an app', () => {
    const app = shellReducer(home, { type: 'OPEN_APP', app: 'youtube' });
    expect(isImmersive(app)).toBe(false);
    expect(isImmersive(shellReducer(app, { type: 'SET_FULLSCREEN', fullscreen: true }))).toBe(true);
    expect(isImmersive(shellReducer(app, { type: 'SET_PIP', inPip: true }))).toBe(true);
  });

  it('ignores a stale fullscreen flag while home is showing', () => {
    const state = run(
      home,
      { type: 'OPEN_APP', app: 'youtube' },
      { type: 'SET_FULLSCREEN', fullscreen: true },
      { type: 'GO_HOME' },
    );
    expect(isImmersive(state)).toBe(false);
  });
});
