import { createInitialState, EMPTY_NAV, isImmersive, shellReducer, type ShellState } from '../shellReducer';

describe('shellReducer', () => {
  const start = createInitialState();

  it('opens and closes settings, returning the same object when nothing changes', () => {
    const open = shellReducer(start, { type: 'OPEN_SETTINGS' });
    expect(open.settingsOpen).toBe(true);
    expect(shellReducer(open, { type: 'OPEN_SETTINGS' })).toBe(open);
    const closed = shellReducer(open, { type: 'CLOSE_SETTINGS' });
    expect(closed.settingsOpen).toBe(false);
    expect(shellReducer(closed, { type: 'CLOSE_SETTINGS' })).toBe(closed);
  });

  it('clears a load error when a fresh load starts', () => {
    const failed: ShellState = { ...start, loadError: { url: 'https://m.youtube.com/', description: 'offline' } };
    const stillFailed = shellReducer(failed, { type: 'SET_NAV', nav: { ...EMPTY_NAV, title: 'x' } });
    expect(stillFailed.loadError).not.toBeNull();
    const retrying = shellReducer(failed, { type: 'SET_NAV', nav: { ...EMPTY_NAV, loading: true } });
    expect(retrying.loadError).toBeNull();
  });

  it('tracks fullscreen and picture-in-picture as immersive', () => {
    expect(isImmersive(start)).toBe(false);
    expect(isImmersive(shellReducer(start, { type: 'SET_FULLSCREEN', fullscreen: true }))).toBe(true);
    expect(isImmersive(shellReducer(start, { type: 'SET_PIP', inPip: true }))).toBe(true);
    expect(shellReducer(start, { type: 'SET_PIP', inPip: false })).toBe(start);
  });
});
