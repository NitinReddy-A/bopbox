import type { BrowserViewRef } from '@bopbox/core';

import { BrowserRegistry } from '../browserRegistry';

const fakeBrowser = (): BrowserViewRef => ({
  goBack: jest.fn(() => Promise.resolve()),
  goForward: jest.fn(() => Promise.resolve()),
  reload: jest.fn(() => Promise.resolve()),
  goHome: jest.fn(() => Promise.resolve()),
  loadUrl: jest.fn(() => Promise.resolve()),
  search: jest.fn(() => Promise.resolve()),
  exitFullscreen: jest.fn(() => Promise.resolve()),
  scrollToTop: jest.fn(() => Promise.resolve()),
});

describe('BrowserRegistry', () => {
  it('runs commands immediately once a view is attached', () => {
    const registry = new BrowserRegistry();
    const browser = fakeBrowser();
    registry.attach('youtube', browser);
    registry.run('youtube', (b) => b.reload());
    expect(browser.reload).toHaveBeenCalledTimes(1);
  });

  it('queues commands for a view that has not mounted yet and flushes them in order, once', () => {
    const registry = new BrowserRegistry();
    const calls: string[] = [];
    registry.run('spotify', (b) => b.search('a'));
    registry.run('spotify', (b) => b.loadUrl('https://open.spotify.com/'));
    const browser = fakeBrowser();
    jest.mocked(browser.search).mockImplementation(async () => void calls.push('search'));
    jest.mocked(browser.loadUrl).mockImplementation(async () => void calls.push('loadUrl'));
    registry.attach('spotify', browser);
    expect(calls).toEqual(['search', 'loadUrl']);
    registry.attach('spotify', fakeBrowser());
    expect(calls).toHaveLength(2);
  });

  it('queues again after a view detaches', () => {
    const registry = new BrowserRegistry();
    const first = fakeBrowser();
    registry.attach('youtube', first);
    registry.attach('youtube', null);
    registry.run('youtube', (b) => b.goHome());
    expect(first.goHome).not.toHaveBeenCalled();
    const second = fakeBrowser();
    registry.attach('youtube', second);
    expect(second.goHome).toHaveBeenCalledTimes(1);
  });

  it('swallows command failures with a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new BrowserRegistry();
    const browser = fakeBrowser();
    jest.mocked(browser.reload).mockRejectedValue(new Error('boom'));
    registry.attach('youtube', browser);
    registry.run('youtube', (b) => b.reload());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith('[bopbox] browser command failed', expect.any(Error));
    warn.mockRestore();
  });
});
