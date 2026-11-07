import type { AppId, NowPlaying } from '@bopbox/core';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { EqualizerBars } from '@/components/common/EqualizerBars';
import { PressableScale } from '@/components/common/PressableScale';
import { APPS } from '@/lib/apps';
import { radius, space, type as typo } from '@/theme/tokens';

type Props = {
  app: AppId;
  nowPlaying: NowPlaying | null;
  onPress: () => void;
};

function statusLine(app: AppId, np: NowPlaying | null): string {
  if (!np || np.appId !== app) return APPS[app].tagline;
  if (np.isAd) return 'yeeting an ad…';
  return `${np.isPlaying ? 'playing' : 'paused'}: ${np.title || 'something good'}`;
}

export function AppTile({ app, nowPlaying, onPress }: Props) {
  const meta = APPS[app];
  const owns = nowPlaying?.appId === app;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`Open ${meta.name}`} style={styles.shadow} testID={`tile-${app}`}>
      <LinearGradient colors={meta.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
        <View style={styles.top}>
          <View style={styles.badge}>
            <Text style={styles.glyph}>{meta.glyph}</Text>
          </View>
          {owns && <EqualizerBars playing={nowPlaying.isPlaying} color="#FFFFFF" />}
        </View>
        <View>
          <Text style={[typo.title, styles.name]}>{meta.name}</Text>
          <Text style={[typo.caption, styles.status]} numberOfLines={1}>
            {statusLine(app, nowPlaying)}
          </Text>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: { flex: 1, borderRadius: radius.lg },
  tile: { height: 156, borderRadius: radius.lg, padding: space.lg, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  name: { color: '#FFFFFF' },
  status: { color: 'rgba(255,255,255,0.88)', marginTop: 2 },
});
