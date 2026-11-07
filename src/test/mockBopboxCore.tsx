/**
 * Jest stand-in for `@bopbox/core` (wired via moduleNameMapper). Keeps native state in plain
 * objects, exposes a fake event emitter, and records every BrowserView so tests can inspect
 * its imperative handle, fire its events and count mounts.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';

import type {
  AdblockStats,
  AppId,
  BopboxCoreEvents,
  BrowserViewProps,
  BrowserViewRef,
  MediaCommand,
  NowPlaying,
  Settings,
} from '../../modules/bopbox-core/src/BopboxCore.types';

export type * from '../../modules/bopbox-core/src/BopboxCore.types';

type EventName = keyof BopboxCoreEvents;
type Payload<E extends EventName> = Parameters<BopboxCoreEvents[E]>[0];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  adblockEnabled: true,
  backgroundPlay: true,
  autoPip: true,
  sponsorBlock: true,
  launchTarget: 'home',
  filterAutoUpdate: true,
  'adblock.youtube': true,
  'adblock.spotify': true,
  'mode.youtube': 'mobile',
  'mode.spotify': 'mobile',
};

export const DEFAULT_STATS: AdblockStats = {
  ready: true,
  networkRules: 41000,
  cosmeticRules: 12000,
  blockedTotal: 1204,
  blockedSession: 37,
  lastUpdatedMs: 0,
  updating: false,
};

export function makeNowPlaying(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return {
    appId: 'spotify',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We Are Dreaming',
    artworkUrl: null,
    isPlaying: true,
    positionMs: 30_000,
    durationMs: 240_000,
    hasVideo: false,
    isAd: false,
    canNext: true,
    canPrevious: true,
    canSeek: true,
    updatedAtMs: Date.now(),
    ...overrides,
  };
}

export const nativeState = {
  settings: { ...DEFAULT_SETTINGS },
  nowPlaying: null as NowPlaying | null,
  stats: { ...DEFAULT_STATS },
  inPip: false,
};

const listeners = new Map<EventName, Set<(payload: never) => void>>();

/** Emit a native event to every subscribed JS listener. Wrap in `act` from tests. */
export function emit<E extends EventName>(event: E, payload: Payload<E>): void {
  listeners.get(event)?.forEach((listener) => (listener as (p: Payload<E>) => void)(payload));
}

export const BopboxCore = {
  getApps: jest.fn(() => [
    { id: 'youtube' as const, name: 'YouTube', homeUrl: 'https://m.youtube.com/' },
    { id: 'spotify' as const, name: 'Spotify', homeUrl: 'https://open.spotify.com/' },
  ]),
  getSettings: jest.fn(() => ({ ...nativeState.settings })),
  updateSettings: jest.fn((patch: Partial<Settings>) => {
    nativeState.settings = { ...nativeState.settings, ...patch };
    return { ...nativeState.settings };
  }),
  getNowPlaying: jest.fn(() => nativeState.nowPlaying),
  control: jest.fn((_command: MediaCommand, _arg?: number | null) => {}),
  getAdblockStats: jest.fn(() => ({ ...nativeState.stats })),
  updateFilters: jest.fn(async () => {
    nativeState.stats = { ...nativeState.stats, lastUpdatedMs: Date.now() };
    return { ...nativeState.stats };
  }),
  clearAppData: jest.fn(async (_appId: AppId) => {}),
  clearAllData: jest.fn(async () => {}),
  setVisibleApp: jest.fn((_appId: AppId | null) => {}),
  enterPip: jest.fn(() => {}),
  isInPip: jest.fn(() => nativeState.inPip),
  moveToBackground: jest.fn(() => {}),
  addListener: jest.fn(<E extends EventName>(event: E, listener: BopboxCoreEvents[E]) => {
    const set = listeners.get(event) ?? new Set();
    set.add(listener as (payload: never) => void);
    listeners.set(event, set);
    return { remove: () => set.delete(listener as (payload: never) => void) };
  }),
};

export type MockBrowser = { [K in keyof BrowserViewRef]: jest.Mock<Promise<void>, Parameters<BrowserViewRef[K]>> };

/** Latest handle, props and mount count of each app's BrowserView. */
export const browsers = {
  refs: {} as Partial<Record<AppId, MockBrowser>>,
  props: {} as Partial<Record<AppId, BrowserViewProps>>,
  mounts: { youtube: 0, spotify: 0 } as Record<AppId, number>,
};

function createMockBrowser(): MockBrowser {
  const command = <Args extends unknown[] = []>() => jest.fn((..._args: Args) => Promise.resolve());
  return {
    goBack: command(),
    goForward: command(),
    reload: command(),
    goHome: command(),
    loadUrl: command<[url: string]>(),
    search: command<[query: string]>(),
    exitFullscreen: command(),
    scrollToTop: command(),
  };
}

export const BrowserView = forwardRef<BrowserViewRef, BrowserViewProps>(function MockBrowserView(props, ref) {
  const [handle] = useState(createMockBrowser);
  useImperativeHandle(ref, () => handle, [handle]);

  useEffect(() => {
    browsers.props[props.appId] = props;
  });

  useEffect(() => {
    browsers.refs[props.appId] = handle;
    browsers.mounts[props.appId] += 1;
  }, [props.appId, handle]);

  return <View testID={`native-browser-${props.appId}`} style={props.style} />;
});

export function resetBopboxMock(): void {
  nativeState.settings = { ...DEFAULT_SETTINGS };
  nativeState.nowPlaying = null;
  nativeState.stats = { ...DEFAULT_STATS };
  nativeState.inPip = false;
  listeners.clear();
  browsers.refs = {};
  browsers.props = {};
  browsers.mounts = { youtube: 0, spotify: 0 };
  Object.values(BopboxCore).forEach((fn) => fn.mockClear());
}
