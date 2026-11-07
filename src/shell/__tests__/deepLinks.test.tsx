import { act, renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';

import RootLayout from '@/app/_layout';
import NotFound from '@/app/+not-found';
import Index from '@/app/index';
import OpenLink from '@/app/open/[target]';
import SearchLink from '@/app/search';
import { browsers, makeNowPlaying, nativeState } from '@/test/mockBopboxCore';
import { browserState } from '@/test/renderShell';

const routes = {
  _layout: RootLayout,
  index: Index,
  'open/[target]': OpenLink,
  search: SearchLink,
  '+not-found': NotFound,
};

describe('deep links', () => {
  it('cold start on bopbox://open/spotify opens Spotify and settles on /', async () => {
    await renderRouter(routes, { initialUrl: '/open/spotify' });
    expect(browserState('spotify')).toBe('visible');
    expect(screen).toHavePathname('/');
  });

  it('links arriving while running switch apps without remounting the shell', async () => {
    nativeState.nowPlaying = makeNowPlaying({ appId: 'youtube' });
    await renderRouter(routes, { initialUrl: '/' });

    await act(async () => router.push('/open/spotify'));
    expect(browserState('spotify')).toBe('visible');

    await act(async () => router.push('/open/now'));
    expect(browserState('youtube')).toBe('visible');
    expect(browserState('spotify')).toBe('hidden');

    await act(async () => router.push('/open/home'));
    expect(browserState('youtube')).toBe('hidden');
    expect(screen.getByLabelText('Open YouTube')).toBeOnTheScreen();

    await act(async () => router.push('/search'));
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
    expect(browsers.mounts).toEqual({ youtube: 1, spotify: 1 });
  });

  it('`now` with nothing playing goes home', async () => {
    await renderRouter(routes, { initialUrl: '/open/now' });
    expect(screen.getByLabelText('Open YouTube')).toBeOnTheScreen();
    expect(browserState('youtube')).toBe('unmounted');
  });

  it('unknown links fall back to the shell', async () => {
    await renderRouter(routes, { initialUrl: '/definitely/not/a/route' });
    expect(screen).toHavePathname('/');
    expect(screen.getByLabelText('Open YouTube')).toBeOnTheScreen();
  });
});
