import { BopboxCore, type PlaybackSpeed, type SiteMode, type ThemePref, type VideoQuality } from '@bopbox/core';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/common/AppIcon';
import { SegmentedControl, type Segment } from '@/components/common/SegmentedControl';
import { adblockStatsStore, useAdblockStats } from '@/hooks/useAdblockStats';
import { useSettings } from '@/hooks/useSettings';
import { formatAgo, formatCount } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useShell } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type as typo } from '@/theme/tokens';

import { ActionRow, ChoiceRow, Group, StackedRow, tint, ToggleRow, ValueRow, type Choice } from './rows';

const SPEEDS: readonly Choice<PlaybackSpeed>[] = [
  { value: '0.5', label: '0.5×' },
  { value: '0.75', label: '0.75×' },
  { value: '1', label: 'Normal' },
  { value: '1.25', label: '1.25×' },
  { value: '1.5', label: '1.5×' },
  { value: '1.75', label: '1.75×' },
  { value: '2', label: '2×' },
  { value: '2.5', label: '2.5×' },
  { value: '3', label: '3×' },
];

const QUALITIES: readonly Choice<VideoQuality>[] = [
  { value: 'auto', label: 'Auto' },
  { value: '2160', label: '2160p' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
];

const LAYOUTS: readonly Segment<SiteMode>[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'desktop', label: 'Desktop' },
];

const THEMES: readonly Segment<ThemePref>[] = [
  { value: 'system', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type Props = {
  /** Wraps the header so it can be dragged down to dismiss the sheet. */
  grabRegion: (node: ReactNode) => ReactNode;
};

export function SettingsScreen({ grabRegion }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { closeSettings } = useShell();
  const [settings, update] = useSettings();
  const stats = useAdblockStats();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now);

  const refreshFilters = () => {
    setRefreshing(true);
    BopboxCore.updateFilters()
      .then((fresh) => {
        adblockStatsStore.set(fresh);
        haptic('confirm');
      })
      .catch(() => haptic('reject'))
      .finally(() => {
        setRefreshing(false);
        setNow(Date.now());
      });
  };

  const confirm = (title: string, message: string, action: string, run: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => {
          run()
            .then(() => haptic('confirm'))
            .catch((error: unknown) => Alert.alert("Couldn't finish that", String(error)));
        },
      },
    ]);

  const adFooter = settings.adblockEnabled
    ? `${formatCount(stats.blockedTotal)} ads and trackers blocked. ${
        stats.ready ? `${formatCount(stats.networkRules + stats.cosmeticRules)} filter rules` : 'Filter lists loading'
      }, updated ${formatAgo(stats.lastUpdatedMs, now)}.`
    : 'Ads, trackers and promoted content will show while this is off.';

  return (
    <View style={styles.root}>
      {grabRegion(
        <View style={styles.grab}>
          <View style={[styles.grabber, { backgroundColor: t.tertiary }]} />
          <View style={styles.bar}>
            <Pressable onPress={closeSettings} accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={12}>
              <Text style={[typo.headline, { color: t.accent }]}>Done</Text>
            </Pressable>
          </View>
        </View>,
      )}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typo.largeTitle, { color: t.label }]} accessibilityRole="header">
          Settings
        </Text>

        <View style={[styles.identity, { backgroundColor: t.surface }]}>
          <AppIcon icon="play" color={t.accent} size={56} />
          <View style={styles.identityText}>
            <Text style={[typo.title2, { color: t.label }]}>Tube</Text>
            <Text style={[typo.subhead, { color: t.secondary }]}>YouTube, minus the ads and the limits.</Text>
          </View>
        </View>

        <Group title="Ads and sponsors" footer={adFooter}>
          <ToggleRow
            icon="shield"
            iconColor={tint.green}
            title="Block ads"
            value={settings.adblockEnabled}
            onChange={(v) => update({ adblockEnabled: v })}
          />
          <ToggleRow
            icon="forward"
            iconColor={tint.orange}
            title="Skip sponsors"
            subtitle="SponsorBlock skips sponsor reads and self-promos"
            value={settings.sponsorBlock}
            onChange={(v) => update({ sponsorBlock: v })}
          />
          <ActionRow
            icon="reload"
            iconColor={tint.blue}
            title="Update filter lists"
            busy={refreshing || stats.updating}
            onPress={refreshFilters}
          />
        </Group>

        <Group title="Playback" footer="Keeps playing when you switch apps, lock the phone or swipe Tube away.">
          <ToggleRow
            icon="play"
            iconColor={tint.pink}
            title="Background play"
            value={settings.backgroundPlay}
            onChange={(v) => update({ backgroundPlay: v })}
          />
          <ToggleRow
            icon="pip"
            iconColor={tint.blue}
            title="Picture in picture"
            subtitle="Video floats when you go home"
            value={settings.autoPip}
            onChange={(v) => update({ autoPip: v })}
          />
          <ChoiceRow
            icon="gauge"
            iconColor={tint.indigo}
            title="Playback speed"
            value={settings.defaultSpeed}
            choices={SPEEDS}
            onChange={(v) => update({ defaultSpeed: v })}
          />
          <ChoiceRow
            icon="sliders"
            iconColor={tint.purple}
            title="Video quality"
            value={settings.defaultQuality}
            choices={QUALITIES}
            onChange={(v) => update({ defaultQuality: v })}
          />
          <ToggleRow
            icon="repeat"
            iconColor={tint.teal}
            title="Always repeat"
            value={settings.alwaysRepeat}
            onChange={(v) => update({ alwaysRepeat: v })}
          />
        </Group>

        <Group title="Player" footer="Swipe up or down on the left of a fullscreen video for brightness, on the right for volume.">
          <ToggleRow
            icon="sun"
            iconColor={tint.orange}
            title="Swipe controls"
            value={settings.swipeControls}
            onChange={(v) => update({ swipeControls: v })}
          />
          <ToggleRow
            icon="thumbDown"
            iconColor={tint.red}
            title="Show dislikes"
            subtitle="Counts from Return YouTube Dislike"
            value={settings.returnDislike}
            onChange={(v) => update({ returnDislike: v })}
          />
          <ToggleRow
            icon="rectangleStack"
            iconColor={tint.gray}
            title="Hide end screens and cards"
            value={settings.hideCards}
            onChange={(v) => update({ hideCards: v })}
          />
        </Group>

        <Group title="Feed">
          <ToggleRow
            icon="eyeSlash"
            iconColor={tint.pink}
            title="Hide Shorts"
            value={settings.hideShorts}
            onChange={(v) => update({ hideShorts: v })}
          />
          <StackedRow icon="globe" iconColor={tint.blue} title="YouTube layout">
            <SegmentedControl
              label="YouTube layout"
              segments={LAYOUTS}
              value={settings.siteMode}
              onChange={(v) => update({ siteMode: v })}
            />
          </StackedRow>
        </Group>

        <Group title="Appearance" footer="Applies to Tube's own screens. YouTube follows its own theme setting.">
          <StackedRow icon="contrast" iconColor={tint.indigo} title="Theme">
            <SegmentedControl label="Theme" segments={THEMES} value={settings.theme} onChange={(theme) => update({ theme })} />
          </StackedRow>
        </Group>

        <Group title="Privacy">
          <ActionRow
            icon="signOut"
            iconColor={tint.gray}
            title="Sign out of YouTube"
            onPress={() =>
              confirm(
                'Sign out of YouTube?',
                "Clears YouTube's cookies, storage and cache in Tube. You'll need to sign in again.",
                'Sign Out',
                () => BopboxCore.clearAppData('youtube'),
              )
            }
          />
          <ActionRow
            icon="trash"
            iconColor={tint.red}
            title="Clear all browsing data"
            destructive
            onPress={() =>
              confirm(
                'Clear all browsing data?',
                'Removes every cookie, sign-in and cached page. This can’t be undone.',
                'Clear Data',
                () => BopboxCore.clearAllData(),
              )
            }
          />
        </Group>

        <Group footer="Tube is a personal project. It isn't affiliated with YouTube or Google.">
          <ValueRow icon="info" iconColor={tint.gray} title="Version" value={Constants.expoConfig?.version ?? 'dev'} />
        </Group>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grab: { paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, opacity: 0.6 },
  bar: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: space.xl },
  content: { paddingHorizontal: space.lg, gap: space.xxl, paddingTop: space.xs },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: 16 },
  identityText: { flex: 1, gap: space.xxs },
});
