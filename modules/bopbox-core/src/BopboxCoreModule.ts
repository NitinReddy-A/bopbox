import { NativeModule, requireNativeModule } from 'expo';

import type { AdblockStats, AppId, BopboxCoreEvents, MediaCommand, NowPlaying, Settings } from './BopboxCore.types';

declare class BopboxCoreModule extends NativeModule<BopboxCoreEvents> {
  getApps(): { id: AppId; name: string; homeUrl: string }[];
  getSettings(): Settings;
  updateSettings(patch: Partial<Settings>): Settings;
  getNowPlaying(): NowPlaying | null;
  control(command: MediaCommand, arg?: number | null): void;
  getAdblockStats(): AdblockStats;
  updateFilters(): Promise<AdblockStats>;
  clearAppData(appId: AppId): Promise<void>;
  clearAllData(): Promise<void>;
  setVisibleApp(appId: AppId | null): void;
  enterPip(): void;
  isInPip(): boolean;
  moveToBackground(): void;
}

export default requireNativeModule<BopboxCoreModule>('BopboxCore');
