import type { StyleProp, ViewStyle } from 'react-native';

export type AppId = 'youtube';
export type ThemePref = 'system' | 'dark' | 'light';
export type SiteMode = 'mobile' | 'desktop';
export type VideoQuality = 'auto' | '2160' | '1440' | '1080' | '720' | '480' | '360' | '240' | '144';
export type PlaybackSpeed = '0.5' | '0.75' | '1' | '1.25' | '1.5' | '1.75' | '2' | '2.5' | '3';

/** Flat settings map shared with native (keys mirror Settings.kt#toMap). */
export type Settings = {
  theme: ThemePref;
  adblockEnabled: boolean;
  sponsorBlock: boolean;
  backgroundPlay: boolean;
  autoPip: boolean;
  siteMode: SiteMode;
  filterAutoUpdate: boolean;
  defaultQuality: VideoQuality;
  defaultSpeed: PlaybackSpeed;
  returnDislike: boolean;
  hideShorts: boolean;
  hideCards: boolean;
  swipeControls: boolean;
  alwaysRepeat: boolean;
  miniplayer: boolean;
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
  /** The Settings button injected into YouTube's top bar was tapped. */
  onOpenSettings: (event: Record<string, never>) => void;
  /** Another app opened or shared a YouTube link into us. */
  onOpenUrl: (event: { url: string }) => void;
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
  /** Android back: minimise a playing video, else go back a page, else leave to the background. */
  back(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  goHome(): Promise<void>;
  loadUrl(url: string): Promise<void>;
  search(query: string): Promise<void>;
  exitFullscreen(): Promise<void>;
  scrollToTop(): Promise<void>;
};
