import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { space, type as typo } from '@/theme/tokens';

import { Section, StatRow } from './rows';

export function AboutSection() {
  const t = useTheme();
  return (
    <Section title="About">
      <StatRow label="Version" value={Constants.expoConfig?.version ?? 'dev'} />
      <View style={styles.blurb}>
        <Text style={[typo.title, { color: t.text }]}>bopbox</Text>
        <Text style={[typo.body, { color: t.textDim }]}>two apps, one box, zero ad breaks.</Text>
        <Text style={[typo.caption, { color: t.textFaint }]}>personal project, ads are the enemy.</Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  blurb: { gap: space.xs, paddingVertical: space.md },
});
