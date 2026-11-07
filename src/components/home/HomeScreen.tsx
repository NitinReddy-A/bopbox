import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNowPlaying } from '@/hooks/useNowPlaying';
import { APP_IDS } from '@/lib/apps';
import { useShell } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type as typo } from '@/theme/tokens';

import { AdblockChip } from './AdblockChip';
import { AppTile } from './AppTile';
import { HomeHeader } from './HomeHeader';
import { NowPlayingCard } from './NowPlayingCard';
import { SearchBar } from './SearchBar';

export function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { openApp, openSettings } = useShell();
  const nowPlaying = useNowPlaying();

  return (
    <View style={styles.root}>
      <LinearGradient colors={t.glow} style={styles.glow} pointerEvents="none" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <HomeHeader />
        <SearchBar />
        <View style={styles.tiles}>
          {APP_IDS.map((app) => (
            <AppTile key={app} app={app} nowPlaying={nowPlaying} onPress={() => openApp(app)} />
          ))}
        </View>
        <NowPlayingCard nowPlaying={nowPlaying} onOpen={(np) => openApp(np.appId)} />
        <AdblockChip onPress={openSettings} />
        <Text style={[typo.mono, styles.footer, { color: t.textFaint }]}>
          no ads · no autoplay nags · just bops
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  tiles: { flexDirection: 'row', gap: space.md },
  footer: { textAlign: 'center', marginTop: space.sm },
});
