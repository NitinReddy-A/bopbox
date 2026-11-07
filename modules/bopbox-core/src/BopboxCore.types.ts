import type { StyleProp, ViewStyle } from 'react-native';

export type AppId = 'youtube' | 'spotify';
export type ThemePref = 'system' | 'dark' | 'light';
export type SiteMode = 'mobile' | 'desktop';
export type LaunchTarget = 'home' | AppId;

/** Flat settings map shared with native (keys mirror Settings.kt#toMap). */
export type Settings = {
  theme: ThemePref;
  adblockEnabled: boolean;
  backgroundPlay: boolean;
  autoPip: boolean;
  sponsorBlock: boolean;
  launchTarget: LaunchTarget;
  filterAutoUpdate: boolean;
  'adblock.youtube': boolean;
  'adblock.spotify': boolean;
  'mode.youtube': SiteMode;
  'mode.spotify': SiteMode;
};

export type NowPlaying = {
  appId: AppId;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  hasVideo: boolean;
  isAd: boolean;
  canNext: boolean;
  canPrevious: boolean;
  canSeek: boolean;
  updatedAtMs: number;
};

export type AdblockStats = {
  ready: boolean;
  networkRules: number;
  cosmeticRules: number;
  blockedTotal: number;
  blockedSession: number;
  lastUpdatedMs: number;
  updating: boolean;
};

export type MediaCommand = 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'stop';

export type BopboxCoreEvents = {
  onSettingsChanged: (settings: Settings) => void;
  onNowPlayingChanged: (event: { nowPlaying: NowPlaying | null }) => void;
  onAdblockStatsChanged: (stats: AdblockStats) => void;
  onPipModeChanged: (event: { inPip: boolean }) => void;
};

export type NavigationState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
};

export type BrowserViewProps = {
  appId: AppId;
  style?: StyleProp<ViewStyle>;
  onNavigationStateChange?: (event: { nativeEvent: NavigationState }) => void;
  onFullscreenChange?: (event: { nativeEvent: { fullscreen: boolean } }) => void;
  onLoadError?: (event: { nativeEvent: { url: string; description: string } }) => void;
  onSwitchApp?: (event: { nativeEvent: { appId: AppId; url: string } }) => void;
};

/** Imperative handle exposed by <BrowserView ref>. */
export type BrowserViewRef = {
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  goHome(): Promise<void>;
  loadUrl(url: string): Promise<void>;
  search(query: string): Promise<void>;
  exitFullscreen(): Promise<void>;
  scrollToTop(): Promise<void>;
};
