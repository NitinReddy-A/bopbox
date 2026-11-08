import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { Icon } from '@/components/icons/Icon';
import type { LoadError } from '@/shell/shellReducer';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type as typo } from '@/theme/tokens';

type Props = {
  error: LoadError;
  onRetry: () => void;
};

/** What failed, why if we know, and the one thing to do about it. */
export function LoadErrorOverlay({ error, onRetry }: Props) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: t.page }]} testID="load-error">
      <View style={[styles.badge, { backgroundColor: t.fill }]}>
        <Icon name="wifiSlash" size={30} color={t.secondary} />
      </View>
      <Text style={[typo.title2, styles.center, { color: t.label }]}>Can’t reach YouTube</Text>
      <Text style={[typo.callout, styles.center, { color: t.secondary }]}>
        Check your internet connection, then try again.
      </Text>
      <Text style={[typo.footnote, styles.center, { color: t.tertiary }]} numberOfLines={2}>
        {error.description}
      </Text>
      <PressableScale onPress={onRetry} accessibilityLabel="Try again" style={[styles.button, { backgroundColor: t.accent }]}>
        <Text style={[typo.headline, { color: t.onAccent }]}>Try Again</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxxl, gap: space.md },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center' },
  button: { marginTop: space.lg, height: 50, minWidth: 180, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl },
});
