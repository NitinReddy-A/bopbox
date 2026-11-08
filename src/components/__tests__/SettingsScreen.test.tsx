import { BopboxCore } from '@bopbox/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { emit } from '@/test/mockBopboxCore';
import { renderShell } from '@/test/renderShell';

async function openSettings() {
  await renderShell();
  await act(async () => emit('onOpenSettings', {}));
  await screen.findByText('Settings');
}

function pressAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((b) => b.text === text)?.onPress?.();
}

describe('Settings', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('writes each switch through to native under its own key', async () => {
    await openSettings();
    const cases: [label: string, key: string, value: boolean][] = [
      ['Block ads', 'adblockEnabled', false],
      ['Skip sponsors', 'sponsorBlock', false],
      ['Background play', 'backgroundPlay', false],
      ['Picture in picture', 'autoPip', false],
      ['Always repeat', 'alwaysRepeat', true],
      ['Swipe controls', 'swipeControls', false],
      ['Show dislikes', 'returnDislike', false],
      ['Hide end screens and cards', 'hideCards', false],
      ['Hide Shorts', 'hideShorts', true],
    ];
    for (const [label, key, value] of cases) {
      await fireEvent.press(screen.getByRole('switch', { name: label }));
      expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ [key]: value });
    }
  });

  it('picks a playback speed from the inline list', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Playback speed'));
    await fireEvent.press(await screen.findByLabelText('Playback speed: 1.5×'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ defaultSpeed: '1.5' });
    await waitFor(() => expect(screen.queryByLabelText('Playback speed: 2×')).toBeNull());
  });

  it('picks a default video quality', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Video quality'));
    await fireEvent.press(await screen.findByLabelText('Video quality: 1080p'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ defaultQuality: '1080' });
  });

  it('switches the YouTube layout and the theme with segmented controls', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('YouTube layout: Desktop'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ siteMode: 'desktop' });
    await fireEvent.press(screen.getByLabelText('Theme: Light'));
    expect(BopboxCore.updateSettings).toHaveBeenLastCalledWith({ theme: 'light' });
  });

  it('refreshes the filter lists and shows the result', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Update filter lists'));
    await waitFor(() => expect(BopboxCore.updateFilters).toHaveBeenCalled());
    expect(await screen.findByText(/1,204 ads and trackers blocked/)).toBeTruthy();
  });

  it('asks before signing out or clearing data', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Sign out of YouTube'));
    expect(BopboxCore.clearAppData).not.toHaveBeenCalled();
    await act(async () => pressAlertButton('Sign Out'));
    expect(BopboxCore.clearAppData).toHaveBeenCalledWith('youtube');

    await fireEvent.press(screen.getByLabelText('Clear all browsing data'));
    await act(async () => pressAlertButton('Clear Data'));
    expect(BopboxCore.clearAllData).toHaveBeenCalled();
  });

  it('closes with Done', async () => {
    await openSettings();
    await fireEvent.press(screen.getByLabelText('Close settings'));
    await waitFor(() => expect(screen.queryByTestId('surface-settings')).toBeNull());
  });
});
