import type { AppId } from '@bopbox/core';

import { brand } from '@/theme/tokens';

export type AppMeta = {
  id: AppId;
  name: string;
  /** Single glyph drawn on the tile; keeps us free of an icon dependency. */
  glyph: string;
  tagline: string;
  gradient: readonly [string, string];
  /** Whether the app has video worth popping into Picture-in-Picture. */
  pip: boolean;
};

export const APP_IDS: readonly AppId[] = ['youtube', 'spotify'];

export const APPS: Record<AppId, AppMeta> = {
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    glyph: '▶',
    tagline: 'videos, minus the ad breaks',
    gradient: brand.youtube,
    pip: true,
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    glyph: '♫',
    tagline: 'playlists on tap',
    gradient: brand.spotify,
    pip: false,
  },
};

export function isAppId(value: unknown): value is AppId {
  return value === 'youtube' || value === 'spotify';
}

export function otherApp(app: AppId): AppId {
  return app === 'youtube' ? 'spotify' : 'youtube';
}
