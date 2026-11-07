import { BopboxCore, type NowPlaying } from '@bopbox/core';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { EqualizerBars } from '@/components/common/EqualizerBars';
import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { usePlaybackPosition } from '@/hooks/usePlaybackPosition';
import { APPS } from '@/lib/apps';
import { formatDuration } from '@/lib/format';
import { progressRatio } from '@/lib/progress';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

type Props = {
  nowPlaying: NowPlaying | null;
  onOpen: (np: NowPlaying) => void;
};

export function NowPlayingCard({ nowPlaying, onOpen }: Props) {
  const t = useTheme();
  if (!nowPlaying) {
    return (
      <View style={[styles.card, styles.empty, { backgroundColor: t.surface, borderColor: t.border }]}>
        <EqualizerBars playing={false} color={t.textFaint} />
        <Text style={[typo.body, { color: t.textDim }]}>{"nothing's bopping. fix that."}</Text>
      </View>
    );
  }
  return <ActiveCard np={nowPlaying} onOpen={onOpen} />;
}

function ActiveCard({ np, onOpen }: { np: NowPlaying; onOpen: (np: NowPlaying) => void }) {
  const t = useTheme();
  const position = usePlaybackPosition(np);
  const meta = APPS[np.appId];
  const toggle = () => BopboxCore.control(np.isPlaying ? 'pause' : 'play');

  return (
    <PressableScale
      depth={0.98}
      onPress={() => onOpen(np)}
      accessibilityLabel={`Now playing ${np.title}, open ${meta.name}`}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
      testID="now-playing"
    >
      <View style={styles.header}>
        <EqualizerBars playing={np.isPlaying} color={t.accentAlt} height={12} />
        <Text style={[typo.mono, { color: t.accentAlt }]}>
          {np.isAd ? 'AD · getting yeeted' : `NOW ON ${meta.name.toUpperCase()}`}
        </Text>
      </View>
      <View style={styles.body}>
        <Artwork np={np} />
        <View style={styles.meta}>
          <Text style={[typo.title, { color: t.text }]} numberOfLines={1}>
            {np.title || 'untitled banger'}
          </Text>
          <Text style={[typo.body, { color: t.textDim }]} numberOfLines={1}>
            {np.artist || meta.name}
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: t.border }]}>
        <View
          testID="now-playing-progress"
          style={[styles.fill, { backgroundColor: t.accent, width: `${progressRatio(position, np.durationMs) * 100}%` }]}
        />
      </View>
      <View style={styles.footer}>
        <Text style={[typo.mono, { color: t.textFaint }]}>
          {formatDuration(position)}
          {np.durationMs > 0 ? ` / ${formatDuration(np.durationMs)}` : ''}
        </Text>
        <View style={styles.controls}>
          <IconButton
            glyph="⏮"
            label="Previous"
            disabled={!np.canPrevious}
            onPress={() => BopboxCore.control('previous')}
          />
          <IconButton
            glyph={np.isPlaying ? '❚❚' : '▶'}
            label={np.isPlaying ? 'Pause' : 'Play'}
            tone="filled"
            size={48}
            onPress={toggle}
          />
          <IconButton glyph="⏭" label="Next" disabled={!np.canNext} onPress={() => BopboxCore.control('next')} />
        </View>
      </View>
    </PressableScale>
  );
}

function Artwork({ np }: { np: NowPlaying }) {
  if (np.artworkUrl) {
    return <Image source={{ uri: np.artworkUrl }} style={styles.art} accessibilityIgnoresInvertColors />;
  }
  const meta = APPS[np.appId];
  return (
    <LinearGradient colors={meta.gradient} style={[styles.art, styles.artFallback]}>
      <Text style={styles.artGlyph}>{meta.glyph}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  empty: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  body: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  art: { width: 64, height: 64, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  artGlyph: { color: '#FFFFFF', fontSize: 26, fontWeight: '900' },
  meta: { flex: 1, gap: 2 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
