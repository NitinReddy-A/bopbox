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

  it('otherwise lets the YouTube view decide: minimise, go back a page, or move to the background', () => {
    expect(decideBack(state({ nav: { ...EMPTY_NAV, canGoBack: true } }))).toEqual({ type: 'pageBack' });
    expect(decideBack(state({}))).toEqual({ type: 'pageBack' });
  });
});
