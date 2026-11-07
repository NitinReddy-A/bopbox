import type { AppId } from '@bopbox/core';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { APPS } from '@/lib/apps';
import type { LoadError } from '@/shell/shellReducer';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

type Props = {
  app: AppId;
  error: LoadError;
  onRetry: () => void;
  onHome: () => void;
};

export function LoadErrorOverlay({ app, error, onRetry, onHome }: Props) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: t.bg }]} testID={`load-error-${app}`}>
      <Text style={styles.emoji}>👻</Text>
      <Text style={[typo.hero, styles.center, { color: t.text }]}>the internet ghosted us</Text>
      <Text style={[typo.body, styles.center, { color: t.textDim }]}>
        {APPS[app].name} wouldn&apos;t load. check your connection and give it another spin.
      </Text>
      <Text style={[typo.mono, styles.center, { color: t.textFaint }]} numberOfLines={2}>
        {error.description}
      </Text>
      <View style={styles.actions}>
        <PressableScale onPress={onRetry} accessibilityLabel="Retry" style={[styles.button, { backgroundColor: t.accent }]}>
          <Text style={[typo.label, { color: t.accentInk }]}>try again</Text>
        </PressableScale>
        <PressableScale onPress={onHome} accessibilityLabel="Go home" style={[styles.button, { borderColor: t.border, borderWidth: 1 }]}>
          <Text style={[typo.label, { color: t.text }]}>back to home</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  emoji: { fontSize: 56 },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  button: { borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.md },
});
