import { BopboxCore } from '@bopbox/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { browsers, emit, makeNowPlaying, nativeState } from '@/test/mockBopboxCore';
import { browserState, renderShell } from '@/test/renderShell';

describe('Home', () => {
  it('renders both app tiles, an empty now-playing card and the ad counter', async () => {
    await renderShell();
    expect(screen.getByLabelText('Open YouTube')).toBeOnTheScreen();
    expect(screen.getByLabelText('Open Spotify')).toBeOnTheScreen();
    expect(screen.getByText("nothing's bopping. fix that.")).toBeOnTheScreen();
    expect(screen.getByText('ads yeeted: 1,204')).toBeOnTheScreen();
  });

  it('starts cold: no WebView is mounted until an app is opened', async () => {
    await renderShell();
    expect(browserState('youtube')).toBe('unmounted');
    expect(browserState('spotify')).toBe('unmounted');
    expect(BopboxCore.setVisibleApp).toHaveBeenLastCalledWith(null);
  });

  it('shows what is playing and pauses it', async () => {
    nativeState.nowPlaying = makeNowPlaying({ title: 'Midnight City', artist: 'M83', isPlaying: true });
    await renderShell();
    expect(screen.getByText('Midnight City')).toBeOnTheScreen();
    expect(screen.getByText('playing: Midnight City')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(BopboxCore.control).toHaveBeenCalledWith('pause');
  });

  it('plays when paused, and skips', async () => {
    nativeState.nowPlaying = makeNowPlaying({ isPlaying: false });
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Play'));
    expect(BopboxCore.control).toHaveBeenCalledWith('play');
    await fireEvent.press(screen.getByLabelText('Next'));
    expect(BopboxCore.control).toHaveBeenCalledWith('next');
  });

  it('follows now-playing events from native', async () => {
    await renderShell();
    await act(async () => emit('onNowPlayingChanged', { nowPlaying: makeNowPlaying({ title: 'Kids', appId: 'youtube' }) }));
    expect(screen.getByText('Kids')).toBeOnTheScreen();
    expect(screen.getByText('NOW ON YOUTUBE')).toBeOnTheScreen();
    await act(async () => emit('onNowPlayingChanged', { nowPlaying: null }));
    expect(screen.getByText("nothing's bopping. fix that.")).toBeOnTheScreen();
  });

  it('updates the ad counter live', async () => {
    await renderShell();
    await act(async () => emit('onAdblockStatsChanged', { ...nativeState.stats, blockedTotal: 99_999 }));
    expect(screen.getByText('ads yeeted: 99,999')).toBeOnTheScreen();
  });

  it('opens an app from its tile: its WebView mounts, shows, and home goes away', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    expect(browserState('youtube')).toBe('visible');
    expect(browserState('spotify')).toBe('unmounted');
    expect(BopboxCore.setVisibleApp).toHaveBeenLastCalledWith('youtube');
    await waitFor(() => expect(screen.queryByTestId('surface-home')).toBeNull());
    expect(screen.getByLabelText('Back to bopbox home')).toBeOnTheScreen();
  });

  it('tapping the now-playing card opens the app that owns playback', async () => {
    nativeState.nowPlaying = makeNowPlaying({ appId: 'spotify' });
    await renderShell();
    await fireEvent.press(screen.getByTestId('now-playing'));
    expect(browserState('spotify')).toBe('visible');
  });

  it('searches free text on the chosen app, even before its WebView existed', async () => {
    await renderShell();
    await fireEvent.changeText(screen.getByLabelText('Search'), 'lofi hip hop');
    await fireEvent.press(screen.getByLabelText('on Spotify'));
    expect(browserState('spotify')).toBe('visible');
    expect(browsers.refs.spotify?.search).toHaveBeenCalledWith('lofi hip hop');
  });

  it('opens a pasted link straight in the app that owns it', async () => {
    await renderShell();
    await fireEvent.changeText(screen.getByLabelText('Search'), 'youtu.be/dQw4w9WgXcQ');
    expect(screen.queryByLabelText('on Spotify')).toBeNull();
    await fireEvent.press(screen.getByLabelText('open in YouTube'));
    expect(browsers.refs.youtube?.loadUrl).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ');
  });
});
