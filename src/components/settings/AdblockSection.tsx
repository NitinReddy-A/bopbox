import { BopboxCore, type Settings } from '@bopbox/core';
import { useState } from 'react';

import { adblockStatsStore, useAdblockStats } from '@/hooks/useAdblockStats';
import type { UpdateSettings } from '@/hooks/useSettings';
import { formatAgo, formatCount } from '@/lib/format';
import { haptic } from '@/lib/haptics';

import { ActionRow, Section, StatRow, SwitchRow } from './rows';

type Props = { settings: Settings; update: UpdateSettings };

export function AdblockSection({ settings, update }: Props) {
  const stats = useAdblockStats();
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const on = settings.adblockEnabled;

  const refresh = () => {
    setRefreshing(true);
    BopboxCore.updateFilters()
      .then((fresh) => {
        adblockStatsStore.set(fresh);
        haptic('confirm');
      })
      .catch(() => haptic('reject'))
      .finally(() => {
        setRefreshing(false);
        setCheckedAt(Date.now());
      });
  };

  return (
    <Section title="Ad blocking">
      <SwitchRow
        label="Block ads & trackers"
        hint="the whole point, honestly"
        value={on}
        onChange={(v) => update({ adblockEnabled: v })}
      />
      <SwitchRow
        label="On YouTube"
        value={settings['adblock.youtube']}
        disabled={!on}
        onChange={(v) => update({ 'adblock.youtube': v })}
      />
      <SwitchRow
        label="On Spotify"
        value={settings['adblock.spotify']}
        disabled={!on}
        onChange={(v) => update({ 'adblock.spotify': v })}
      />
      <StatRow label="Rules loaded" value={stats.ready ? formatCount(stats.networkRules + stats.cosmeticRules) : 'warming up…'} />
      <StatRow label="Blocked, all time" value={formatCount(stats.blockedTotal)} />
      <StatRow label="Blocked this session" value={formatCount(stats.blockedSession)} />
      <SwitchRow
        label="Auto-update filters"
        value={settings.filterAutoUpdate}
        onChange={(v) => update({ filterAutoUpdate: v })}
      />
      <ActionRow
        label="Update filters now"
        hint={`last refresh: ${formatAgo(stats.lastUpdatedMs, checkedAt)}`}
        busy={refreshing || stats.updating}
        onPress={refresh}
      />
    </Section>
  );
}
