import { decideBack } from '../decideBack';
import { createInitialState, EMPTY_NAV, shellReducer, type ShellState } from '../shellReducer';

const home = createInitialState('home');
const onYouTube = shellReducer(home, { type: 'OPEN_APP', app: 'youtube' });
const withHistory = (state: ShellState) =>
  shellReducer(state, { type: 'SET_NAV', app: 'youtube', nav: { ...EMPTY_NAV, canGoBack: true } });

describe('decideBack', () => {
  it('moves the task to the background from home instead of exiting', () => {
    expect(decideBack(home)).toEqual({ type: 'moveToBackground' });
  });

  it('closes settings first, wherever they were opened from', () => {
    expect(decideBack(shellReducer(home, { type: 'OPEN_SETTINGS' }))).toEqual({ type: 'closeSettings' });
    expect(decideBack(shellReducer(withHistory(onYouTube), { type: 'OPEN_SETTINGS' }))).toEqual({
      type: 'closeSettings',
    });
  });

  it('exits fullscreen before navigating', () => {
    const state = shellReducer(withHistory(onYouTube), { type: 'SET_FULLSCREEN', fullscreen: true });
    expect(decideBack(state)).toEqual({ type: 'exitFullscreen', app: 'youtube' });
  });

  it('walks back through page history', () => {
    expect(decideBack(withHistory(onYouTube))).toEqual({ type: 'goBack', app: 'youtube' });
  });

  it('goes home when the app has no history', () => {
    expect(decideBack(onYouTube)).toEqual({ type: 'goHome' });
  });

  it('only looks at the history of the active app', () => {
    const spotify = shellReducer(withHistory(onYouTube), { type: 'OPEN_APP', app: 'spotify' });
    expect(decideBack(spotify)).toEqual({ type: 'goHome' });
  });
});
