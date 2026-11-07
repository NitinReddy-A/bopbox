import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { useAdblockStats } from '@/hooks/useAdblockStats';
import { useSettings } from '@/hooks/useSettings';
import { formatCount } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

export function AdblockChip({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const stats = useAdblockStats();
  const [{ adblockEnabled }] = useSettings();
  const label = adblockEnabled ? `ads yeeted: ${formatCount(stats.blockedTotal)}` : 'shields down. ads roam free.';

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      <View style={[styles.dot, { backgroundColor: adblockEnabled ? t.accentAlt : t.danger }]} />
      <Text style={[typo.label, { color: t.text }]}>{label}</Text>
      {adblockEnabled && stats.blockedSession > 0 && (
        <Text style={[typo.caption, { color: t.textDim }]}>+{formatCount(stats.blockedSession)} this session</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
