import { BopboxCore, type NavigationState } from '@bopbox/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { browsers, emit, nativeState } from '@/test/mockBopboxCore';
import { captureBackHandler, renderShell } from '@/test/renderShell';

import { EMPTY_NAV } from '../shellReducer';

function fireNav(nav: Partial<NavigationState>) {
  return act(async () => browsers.props.youtube?.onNavigationStateChange?.({ nativeEvent: { ...EMPTY_NAV, ...nav } }));
}

describe('Shell', () => {
  it('opens straight into YouTube and keeps one WebView for good', async () => {
    await renderShell();
    expect(screen.getByTestId('native-browser-youtube')).toBeTruthy();
    expect(BopboxCore.setVisibleApp).toHaveBeenCalledWith('youtube');

    await act(async () => emit('onOpenSettings', {}));
    await screen.findByText('Settings');
    await fireEvent.press(screen.getByLabelText('Close settings'));
    await waitFor(() => expect(screen.queryByTestId('surface-settings')).toBeNull());
    expect(browsers.mounts.youtube).toBe(1);
  });

  it('opens Settings from the button inside YouTube', async () => {
    await renderShell();
    expect(screen.queryByTestId('surface-settings')).toBeNull();
    await act(async () => emit('onOpenSettings', {}));
    expect(await screen.findByText('Ads and sponsors')).toBeTruthy();
  });

  it('loads a YouTube link another app handed over, cold or warm', async () => {
    nativeState.launchUrl = 'https://youtu.be/cold';
    await renderShell();
    await waitFor(() => expect(browsers.refs.youtube?.loadUrl).toHaveBeenCalledWith('https://youtu.be/cold'));

    await act(async () => emit('onOpenUrl', { url: 'https://youtu.be/warm' }));
    await waitFor(() => expect(browsers.refs.youtube?.loadUrl).toHaveBeenLastCalledWith('https://youtu.be/warm'));
  });

  it('routes the back button: settings, fullscreen, then the YouTube view', async () => {
    const back = captureBackHandler();
    await renderShell();

    await act(async () => emit('onOpenSettings', {}));
    await screen.findByText('Settings');
    await act(async () => back.pressBack());
    await waitFor(() => expect(screen.queryByTestId('surface-settings')).toBeNull());

    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: true } }));
    await act(async () => back.pressBack());
    expect(browsers.refs.youtube?.exitFullscreen).toHaveBeenCalled();
    await act(async () => browsers.props.youtube?.onFullscreenChange?.({ nativeEvent: { fullscreen: false } }));

    // The view decides natively (minimise, page back or background), with or without history.
    await fireNav({ canGoBack: true });
    await act(async () => back.pressBack());
    expect(browsers.refs.youtube?.back).toHaveBeenCalledTimes(1);

    await fireNav({ canGoBack: false });
    await act(async () => back.pressBack());
    expect(browsers.refs.youtube?.back).toHaveBeenCalledTimes(2);
    expect(BopboxCore.moveToBackground).not.toHaveBeenCalled();
  });

  it('shows a retry screen when YouTube fails to load', async () => {
    await renderShell();
    await act(async () =>
      browsers.props.youtube?.onLoadError?.({ nativeEvent: { url: 'https://m.youtube.com/', description: 'net::ERR_INTERNET_DISCONNECTED' } }),
    );
    expect(screen.getByText('Can’t reach YouTube')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(browsers.refs.youtube?.reload).toHaveBeenCalled();
    expect(screen.queryByTestId('load-error')).toBeNull();
  });

  it('goes immersive in picture-in-picture', async () => {
    await renderShell();
    await act(async () => emit('onPipModeChanged', { inPip: true }));
    const stage = screen.getByTestId('stage');
    expect(stage.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ top: 0, bottom: 0 })]));
  });
});
