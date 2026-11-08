import { decideBack } from '../decideBack';
import { createInitialState, EMPTY_NAV, type ShellState } from '../shellReducer';

const state = (patch: Partial<ShellState>): ShellState => ({ ...createInitialState(), ...patch });

describe('decideBack', () => {
  it('closes settings before anything else', () => {
    expect(decideBack(state({ settingsOpen: true, fullscreen: true }))).toEqual({ type: 'closeSettings' });
  });

  it('leaves fullscreen next', () => {
    expect(decideBack(state({ fullscreen: true, nav: { ...EMPTY_NAV, canGoBack: true } }))).toEqual({ type: 'exitFullscreen' });
  });

  it('walks back through YouTube pages', () => {
    expect(decideBack(state({ nav: { ...EMPTY_NAV, canGoBack: true } }))).toEqual({ type: 'goBack' });
  });

  it('never exits the app: it goes to the background so playback continues', () => {
    expect(decideBack(state({}))).toEqual({ type: 'moveToBackground' });
  });
});
