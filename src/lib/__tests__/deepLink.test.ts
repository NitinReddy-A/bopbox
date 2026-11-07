import { makeNowPlaying } from '@/test/mockBopboxCore';

import { resolveOpenTarget } from '../deepLink';

describe('resolveOpenTarget', () => {
  it('opens named apps directly', () => {
    expect(resolveOpenTarget('youtube', null)).toEqual({ surface: 'app', app: 'youtube' });
    expect(resolveOpenTarget('spotify', makeNowPlaying({ appId: 'youtube' }))).toEqual({ surface: 'app', app: 'spotify' });
  });

  it('sends `now` to the app that owns playback', () => {
    expect(resolveOpenTarget('now', makeNowPlaying({ appId: 'youtube' }))).toEqual({ surface: 'app', app: 'youtube' });
  });

  it('sends `now` home when nothing is playing', () => {
    expect(resolveOpenTarget('now', null)).toEqual({ surface: 'home' });
  });

  it('falls back to home for home and unknown targets', () => {
    expect(resolveOpenTarget('home', null)).toEqual({ surface: 'home' });
    expect(resolveOpenTarget('tiktok', null)).toEqual({ surface: 'home' });
    expect(resolveOpenTarget(undefined, null)).toEqual({ surface: 'home' });
  });
});
