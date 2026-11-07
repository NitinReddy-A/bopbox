import { BopboxCore } from '@bopbox/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { emit, nativeState } from '@/test/mockBopboxCore';
import { renderShell } from '@/test/renderShell';

async function openSettings() {
  await renderShell();
  await fireEvent.press(screen.getByLabelText('Settings'));
  await screen.findByText('settings');
}

function pressAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((b) => b.text === text)?.onPress?.();
}

describe('Settings', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('writes switches through to native with the right key', async () => {
    await openSettings();
    await fireEvent(screen.getByLabelText('Background play'), 'valueChange', false);
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ backgroundPlay: false });
    await fireEvent(screen.getByLabelText('SponsorBlock'), 'valueChange', false);
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ sponsorBlock: false });
    await fireEvent(screen.getByLabelText('On Spotify'), 'valueChange', false);
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ 'adblock.spotify': false });
  });

  it('reflects the value native returns', async () => {
    await openSettings();
    await fireEvent(screen.getByLabelText('Block ads & trackers'), 'valueChange', false);
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ adblockEnabled: false });
    expect(screen.getByLabelText('Block ads & trackers')).toHaveProp('value', false);
    expect(screen.getByLabelText('On YouTube')).toBeDisabled();
  });

  it('writes segmented choices through to native', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Theme: light'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ theme: 'light' });
    await fireEvent.press(screen.getByLabelText('YouTube site: desktop'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ 'mode.youtube': 'desktop' });
    await fireEvent.press(screen.getByLabelText('Launch into: Spotify'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ launchTarget: 'spotify' });
  });

  it('follows settings changed elsewhere (e.g. by a widget)', async () => {
    await openSettings();
    await act(async () => emit('onSettingsChanged', { ...nativeState.settings, autoPip: false }));
    expect(screen.getByLabelText('Auto picture-in-picture')).toHaveProp('value', false);
  });

  it('refreshes filters with a spinner', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Update filters now'));
    expect(BopboxCore.updateFilters).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('Update filters now-busy')).toBeNull());
    expect(screen.getByText('last refresh: just now')).toBeOnTheScreen();
  });

  it('confirms before signing out of an app', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Sign out of YouTube'));
    expect(Alert.alert).toHaveBeenCalled();
    expect(BopboxCore.clearAppData).not.toHaveBeenCalled();
    await act(async () => pressAlertButton('sign out'));
    expect(BopboxCore.clearAppData).toHaveBeenCalledWith('youtube');
  });

  it('confirms before nuking everything, and backing out does nothing', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Nuke all browsing data'));
    await act(async () => pressAlertButton('nah'));
    expect(BopboxCore.clearAllData).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Nuke all browsing data'));
    await act(async () => pressAlertButton('nuke it'));
    expect(BopboxCore.clearAllData).toHaveBeenCalled();
  });

  it('closes back to home', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Close settings'));
    await waitFor(() => expect(screen.queryByTestId('surface-settings')).toBeNull());
    expect(screen.getByLabelText('Open YouTube')).toBeOnTheScreen();
  });
});
