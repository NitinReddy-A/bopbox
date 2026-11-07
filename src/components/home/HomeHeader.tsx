import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/common/IconButton';
import { greetingFor } from '@/lib/greeting';
import { useShell } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { type as typo } from '@/theme/tokens';

export function HomeHeader() {
  const t = useTheme();
  const { openSettings } = useShell();
  const [greeting] = useState(() => greetingFor(new Date().getHours()));

  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text style={[typo.mono, { color: t.accentAlt }]}>
          bopbox<Text style={{ color: t.accent }}>●</Text> fm
        </Text>
        <Text style={[typo.hero, { color: t.text }]} accessibilityRole="header">
          {greeting}
        </Text>
      </View>
      <IconButton glyph="⚙" label="Settings" onPress={openSettings} size={44} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titles: { flex: 1, gap: 4 },
});
