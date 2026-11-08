import type { AppId } from '@bopbox/core';

import type { IconName } from '@/components/icons/Icon';
import { brand } from '@/theme/tokens';

export type AppMeta = {
  id: AppId;
  name: string;
  icon: IconName;
  color: string;
};

/** The one app Tube wraps. Kept as data so copy and icons have a single source. */
export const YOUTUBE: AppMeta = {
  id: 'youtube',
  name: 'YouTube',
  icon: 'youtube',
  color: brand.youtube,
};

export const APPS: Record<AppId, AppMeta> = { youtube: YOUTUBE };
