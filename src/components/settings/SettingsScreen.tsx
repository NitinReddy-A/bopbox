import type { AppId, LaunchTarget, Settings, SiteMode, ThemePref } from '@bopbox/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/common/IconButton';
import { SegmentedControl, type Segment } from '@/components/common/SegmentedControl';
import { useSettings } from '@/hooks/useSettings';
import { APPS, APP_IDS } from '@/lib/apps';
import { useShell } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type as typo } from '@/theme/tokens';

import { AboutSection } from './AboutSection';
import { AdblockSection } from './AdblockSection';
import { PrivacySection } from './PrivacySection';
import { Section, StackedRow, SwitchRow } from './rows';

const THEMES: readonly Segment<ThemePref>[] = [
  { value: 'system', label: 'system' },
  { value: 'dark', label: 'dark' },
  { value: 'light', label: 'light' },
];

const MODES: readonly Segment<SiteMode>[] = [
  { value: 'mobile', label: 'mobile' },
  { value: 'desktop', label: 'desktop' },
];

const LAUNCH: readonly Segment<LaunchTarget>[] = [
  { value: 'home', label: 'home' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'spotify', label: 'Spotify' },
];

function sitePatch(app: AppId, mode: SiteMode): Partial<Settings> {
  const patch: Partial<Settings> = {};
  patch[`mode.${app}`] = mode;
  return patch;
}

export function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { closeSettings } = useShell();
  const [settings, update] = useSettings();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <IconButton glyph="←" label="Close settings" onPress={closeSettings} size={44} />
        <Text style={[typo.hero, { color: t.text }]} accessibilityRole="header">
          settings
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}>
        <Section title="Appearance">
          <StackedRow label="Theme">
            <SegmentedControl label="Theme" segments={THEMES} value={settings.theme} onChange={(theme) => update({ theme })} />
          </StackedRow>
        </Section>

        <AdblockSection settings={settings} update={update} />

        <Section title="Playback">
          <SwitchRow
            label="Background play"
            hint="keeps the music going with the screen off"
            value={settings.backgroundPlay}
            onChange={(v) => update({ backgroundPlay: v })}
          />
          <SwitchRow
            label="Auto picture-in-picture"
            hint="video pops out when you leave the app"
            value={settings.autoPip}
            onChange={(v) => update({ autoPip: v })}
          />
          <SwitchRow
            label="SponsorBlock"
            hint="skip the “this video is sponsored by…” bits"
            value={settings.sponsorBlock}
            onChange={(v) => update({ sponsorBlock: v })}
          />
        </Section>

        <Section title="Sites">
          {APP_IDS.map((app) => (
            <StackedRow key={app} label={`${APPS[app].name} flavour`}>
              <SegmentedControl
                label={`${APPS[app].name} site`}
                segments={MODES}
                value={settings[`mode.${app}`]}
                onChange={(mode) => update(sitePatch(app, mode))}
              />
            </StackedRow>
          ))}
        </Section>

        <Section title="Launch into">
          <StackedRow label="When bopbox opens" hint="widgets and the notification still go where they point">
            <SegmentedControl
              label="Launch into"
              segments={LAUNCH}
              value={settings.launchTarget}
              onChange={(launchTarget) => update({ launchTarget })}
            />
          </StackedRow>
        </Section>

        <PrivacySection />
        <AboutSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  content: { paddingHorizontal: space.lg, gap: space.xl },
});
