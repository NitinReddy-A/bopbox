import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[typo.mono, { color: t.accent }]} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>{children}</View>
    </View>
  );
}

type RowProps = { label: string; hint?: string; children?: ReactNode };

export function Row({ label, hint, children }: RowProps) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[typo.body, { color: t.text }]}>{label}</Text>
        {hint ? <Text style={[typo.caption, { color: t.textDim }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A full-width control (e.g. a segmented picker) under its label. */
export function StackedRow({ label, hint, children }: RowProps) {
  return (
    <View style={styles.stacked}>
      <Row label={label} hint={hint} />
      {children}
    </View>
  );
}

type SwitchRowProps = {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, hint, value, onChange, disabled }: SwitchRowProps) {
  const t = useTheme();
  return (
    <Row label={label} hint={hint}>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{ disabled, checked: value }}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          haptic(next ? 'toggleOn' : 'toggleOff');
          onChange(next);
        }}
        trackColor={{ false: t.border, true: t.violet }}
        thumbColor={value ? t.accentAlt : t.textFaint}
      />
    </Row>
  );
}

type ActionRowProps = {
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: 'normal' | 'danger';
  busy?: boolean;
};

export function ActionRow({ label, hint, onPress, tone = 'normal', busy }: ActionRowProps) {
  const t = useTheme();
  const color = tone === 'danger' ? t.danger : t.accent;
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityLabel={label} depth={0.98}>
      <Row label={label} hint={hint}>
        {busy ? (
          <ActivityIndicator color={color} testID={`${label}-busy`} />
        ) : (
          <Text style={[typo.title, { color }]}>›</Text>
        )}
      </Row>
    </PressableScale>
  );
}

export function StatRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <Row label={label}>
      <Text style={[typo.mono, { color: t.accentAlt }]}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52 },
  stacked: { paddingBottom: space.md },
  text: { flex: 1, gap: 2 },
});
