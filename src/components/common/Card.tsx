import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * A surface on the canvas. Light mode lifts it with a soft shadow; dark mode with lightness.
 * Never both a border and a shadow, never a card inside a card.
 */
export function Card({ children, style, onPress, accessibilityLabel, testID }: Props) {
  const t = useTheme();
  const surface = [styles.card, { backgroundColor: t.surface, boxShadow: t.cardShadow }, style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} depth={0.98} style={surface} testID={testID}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={surface} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card },
});
