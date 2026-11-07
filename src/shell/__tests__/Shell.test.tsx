import { BopboxCore, type NavigationState } from '@bopbox/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { browsers, emit, nativeState } from '@/test/mockBopboxCore';
import { browserState, captureBackHandler, renderShell } from '@/test/renderShell';

import { EMPTY_NAV } from '../shellReducer';

function fireNav(app: 'youtube' | 'spotify', nav: Partial<NavigationState>) {
  return act(async () => browsers.props[app]?.onNavigationStateChange?.({ nativeEvent: { ...EMPTY_NAV, ...nav } }));
}

describe('Shell', () => {
  it('keeps both WebViews mounted while switching around, hiding the inactive one', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    await fireEvent.press(screen.getByLabelText('Switch to Spotify'));
    expect(browserState('spotify')).toBe('visible');
    expect(browserState('youtube')).toBe('hidden');

    await fireEvent.press(screen.getByLabelText('Back to bopbox home'));
    expect(browserState('youtube')).toBe('hidden');
    expect(browserState('spotify')).toBe('hidden');
    expect(BopboxCore.setVisibleApp).toHaveBeenLastCalledWith(null);

    await fireEvent.press(await screen.findByLabelText('Settings'));
    await fireEvent.press(await screen.findByLabelText('Close settings'));
    await fireEvent.press(await screen.findByLabelText('Open YouTube'));
    expect(browserState('youtube')).toBe('visible');
    expect(browsers.mounts).toEqual({ youtube: 1, spotify: 1 });
  });

  it('launches straight into the configured app', async () => {
    nativeState.settings = { ...nativeState.settings, launchTarget: 'spotify' };
    await renderShell();
    expect(browserState('spotify')).toBe('visible');
    expect(browserState('youtube')).toBe('unmounted');
    expect(screen.queryByTestId('surface-home')).toBeNull();
  });

  it('hands links for the other app over to it', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open Spotify'));
    await act(async () =>
      browsers.props.spotify?.onSwitchApp?.({ nativeEvent: { appId: 'youtube', url: 'https://m.youtube.com/watch?v=1' } }),
    );
    expect(browserState('youtube')).toBe('visible');
    expect(browsers.refs.youtube?.loadUrl).toHaveBeenCalledWith('https://m.youtube.com/watch?v=1');
  });

  it('hides chrome and lets the page fill the screen in fullscreen and PiP', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    expect(screen.getByTestId('stage')).not.toHaveStyle({ top: 0 });

    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: true } }));
    expect(screen.queryByLabelText('Back to bopbox home')).toBeNull();
    expect(screen.getByTestId('stage')).toHaveStyle({ top: 0, bottom: 0 });

    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: false } }));
    expect(screen.getByLabelText('Back to bopbox home')).toBeOnTheScreen();

    await act(async () => emit('onPipModeChanged', { inPip: true }));
    expect(screen.queryByLabelText('Back to bopbox home')).toBeNull();
    expect(screen.getByTestId('stage')).toHaveStyle({ top: 0, bottom: 0 });
  });

  it('shows a load error with retry, and clears it when retrying', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    await act(async () =>
      browsers.props.youtube?.onLoadError?.({ nativeEvent: { url: 'https://m.youtube.com/', description: 'net::ERR_NAME_NOT_RESOLVED' } }),
    );
    expect(screen.getByText('the internet ghosted us')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(browsers.refs.youtube?.reload).toHaveBeenCalled();
    expect(screen.queryByText('the internet ghosted us')).toBeNull();
  });

  it('runs app menu commands against the active WebView', async () => {
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    await fireEvent.press(screen.getByLabelText('Menu'));
    await fireEvent.press(screen.getByLabelText('scroll to top'));
    expect(browsers.refs.youtube?.scrollToTop).toHaveBeenCalled();
    expect(screen.queryByLabelText('scroll to top')).toBeNull();
  });
});

describe('hardware back', () => {
  it('walks: settings -> fullscreen -> page history -> home -> background', async () => {
    const back = captureBackHandler();
    await renderShell();

    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    await fireNav('youtube', { canGoBack: true });
    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: true } }));

    await act(async () => void back.pressBack());
    expect(browsers.refs.youtube?.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(browsers.refs.youtube?.goBack).not.toHaveBeenCalled();
    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: false } }));

    await act(async () => void back.pressBack());
    expect(browsers.refs.youtube?.goBack).toHaveBeenCalledTimes(1);
    await fireNav('youtube', { canGoBack: false });

    await fireEvent.press(screen.getByLabelText('Menu'));
    await fireEvent.press(screen.getByLabelText('open settings'));
    await act(async () => void back.pressBack());
    await waitFor(() => expect(screen.queryByTestId('surface-settings')).toBeNull());
    expect(browserState('youtube')).toBe('visible');

    await act(async () => void back.pressBack());
    expect(browserState('youtube')).toBe('hidden');
    expect(await screen.findByLabelText('Open YouTube')).toBeOnTheScreen();

    expect(await act(async () => back.pressBack())).toBe(true);
    expect(BopboxCore.moveToBackground).toHaveBeenCalledTimes(1);
    expect(browsers.mounts.youtube).toBe(1);
  });

  it('closes the app menu before anything else', async () => {
    const back = captureBackHandler();
    await renderShell();
    await fireEvent.press(screen.getByLabelText('Open YouTube'));
    await fireEvent.press(screen.getByLabelText('Menu'));
    await act(async () => void back.pressBack());
    expect(screen.queryByLabelText('scroll to top')).toBeNull();
    expect(browserState('youtube')).toBe('visible');
  });
});
