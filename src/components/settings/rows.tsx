import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AppIcon } from '@/components/common/AppIcon';
import { Toggle } from '@/components/common/Toggle';
import { Icon, type IconName } from '@/components/icons/Icon';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { CSS_EASE_OUT, motion, radius, space, tabular, type as typo } from '@/theme/tokens';

/** iOS Settings icon tile colours. Each row gets one, so the eye can find it by colour. */
export const tint = {
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  blue: '#007AFF',
  indigo: '#5856D6',
  pink: '#FF2D55',
  purple: '#AF52DE',
  teal: '#30B0C7',
  gray: '#8E8E93',
} as const;

const REFLOW = LinearTransition.duration(motion.small).easing(motion.easeOut);
const OPTION_IN = FadeIn.duration(motion.small).easing(motion.easeOut);
const OPTION_OUT = FadeOut.duration(120);

type RowInjected = { first?: boolean };

/** An inset grouped section: optional header above, the rows on one surface, a footer below. */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<RowInjected>[];
  return (
    <Animated.View layout={REFLOW} style={styles.group}>
      {title ? (
        <Text style={[typo.footnote, styles.header, { color: t.secondary }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        {rows.map((row, i) => cloneElement(row, { first: i === 0 }))}
      </View>
      {footer ? <Text style={[typo.footnote, styles.footer, { color: t.secondary }]}>{footer}</Text> : null}
    </Animated.View>
  );
}

type RowProps = RowInjected & {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityRole?: 'button' | 'switch' | 'none';
  testID?: string;
};

/**
 * A settings row. The hairline between rows starts where the text starts (as on iOS), so the
 * icons read as one column. Pressable rows highlight on press-in.
 */
export function Row({ first, icon, iconColor, title, subtitle, accessory, onPress, destructive, disabled, testID }: RowProps) {
  const t = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? <AppIcon icon={icon} color={iconColor ?? tint.gray} size={30} /> : null}
      <View
        style={[
          styles.rowBody,
          !first && { borderTopColor: t.separator, borderTopWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <View style={styles.rowText}>
          <Text style={[typo.body, { color: destructive ? t.danger : t.label }]}>{title}</Text>
          {subtitle ? <Text style={[typo.footnote, { color: t.secondary }]}>{subtitle}</Text> : null}
        </View>
        {accessory}
      </View>
    </View>
  );
  if (!onPress) return <View testID={testID} style={{ opacity: disabled ? 0.4 : 1 }}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.fill : 'transparent', opacity: disabled ? 0.4 : 1 })}
    >
      {body}
    </Pressable>
  );
}

type ToggleRowProps = Omit<RowProps, 'accessory' | 'onPress'> & {
  value: boolean;
  onChange: (value: boolean) => void;
};

export function ToggleRow({ value, onChange, disabled, title, ...rest }: ToggleRowProps) {
  return (
    <Row
      {...rest}
      title={title}
      disabled={disabled}
      accessory={<Toggle value={value} onValueChange={onChange} label={title} disabled={disabled} />}
    />
  );
}

/** A row whose control (e.g. a segmented picker) sits full width under its title. */
export function StackedRow({ first, icon, iconColor, title, children }: RowInjected & { icon?: IconName; iconColor?: string; title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      {icon ? <AppIcon icon={icon} color={iconColor ?? tint.gray} size={30} /> : null}
      <View style={[styles.stacked, !first && { borderTopColor: t.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[typo.body, { color: t.label }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function ValueRow({ value, ...rest }: Omit<RowProps, 'accessory'> & { value: string }) {
  const t = useTheme();
  return <Row {...rest} accessory={<Text style={[typo.body, tabular, { color: t.secondary }]}>{value}</Text>} />;
}

export function ActionRow({ busy, ...rest }: Omit<RowProps, 'accessory'> & { busy?: boolean }) {
  const t = useTheme();
  return (
    <Row
      {...rest}
      disabled={rest.disabled || busy}
      accessory={
        busy ? (
          <ActivityIndicator color={t.secondary} testID={`${rest.title}-busy`} />
        ) : rest.destructive ? null : (
          <Icon name="chevronRight" size={16} color={t.tertiary} weight={2.4} />
        )
      }
    />
  );
}

export type Choice<T extends string> = { value: T; label: string };

type ChoiceRowProps<T extends string> = Omit<RowProps, 'accessory' | 'onPress'> & {
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
};

/**
 * A row that shows its current value and opens an inline list of choices beneath it, like an
 * iOS menu pinned to the row. The chevron turns as it opens; the list fades in while the group
 * below glides down.
 */
export function ChoiceRow<T extends string>({ value, choices, onChange, title, first, ...rest }: ChoiceRowProps<T>) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = choices.find((c) => c.value === value)?.label ?? value;
  return (
    <View>
      <Row
        {...rest}
        first={first}
        title={title}
        onPress={() => setOpen((o) => !o)}
        accessory={
          <View style={styles.choiceValue}>
            <Text style={[typo.body, tabular, { color: t.secondary }]}>{current}</Text>
            <Animated.View
              style={{
                transform: [{ rotate: open ? '180deg' : '0deg' }],
                transitionProperty: 'transform',
                transitionDuration: motion.small,
                transitionTimingFunction: CSS_EASE_OUT,
              }}
            >
              <Icon name="chevronDown" size={14} color={t.tertiary} weight={2.6} />
            </Animated.View>
          </View>
        }
      />
      {open && (
        <Animated.View entering={OPTION_IN} exiting={OPTION_OUT} accessibilityRole="radiogroup" accessibilityLabel={title}>
          {choices.map((choice) => {
            const selected = choice.value === value;
            return (
              <Pressable
                key={choice.value}
                accessibilityRole="radio"
                accessibilityLabel={`${title}: ${choice.label}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (!selected) {
                    haptic('selection');
                    onChange(choice.value);
                  }
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, { backgroundColor: pressed ? t.fill : 'transparent' }]}
              >
                <View style={[styles.optionBody, { borderTopColor: t.separator }]}>
                  <Text style={[typo.body, tabular, { color: t.label }]}>{choice.label}</Text>
                  {selected ? <Icon name="checkmark" size={18} color={t.accent} weight={2.4} /> : null}
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const ROW_INSET = space.lg;
const ICON = 30;

const styles = StyleSheet.create({
  group: { gap: space.sm },
  header: { paddingHorizontal: ROW_INSET },
  footer: { paddingHorizontal: ROW_INSET },
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: ROW_INSET },
  rowBody: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingRight: ROW_INSET,
  },
  rowText: { flex: 1, gap: space.xxs },
  stacked: { flex: 1, gap: space.md, paddingVertical: space.md, paddingRight: ROW_INSET },
  choiceValue: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  option: { paddingLeft: ROW_INSET + ICON + space.md },
  optionBody: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: ROW_INSET,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
