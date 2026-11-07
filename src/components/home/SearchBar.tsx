import type { AppId } from '@bopbox/core';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { APPS, APP_IDS } from '@/lib/apps';
import { resolveSearch } from '@/lib/search';
import { useShell, useShellState } from '@/shell/ShellContext';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type as typo } from '@/theme/tokens';

/**
 * Free text asks which app to search; a YouTube/Spotify link skips the question and opens
 * in the app that owns it.
 */
export function SearchBar() {
  const t = useTheme();
  const { openApp, dispatch } = useShell();
  const { searchFocus } = useShellState();
  const [text, setText] = useState('');
  const input = useRef<TextInputInstance>(null);
  const resolved = resolveSearch(text);

  useEffect(() => {
    if (!searchFocus) return;
    input.current?.focus();
    dispatch({ type: 'SEARCH_FOCUSED' });
  }, [searchFocus, dispatch]);

  const finish = () => {
    setText('');
    Keyboard.dismiss();
  };

  const searchOn = (app: AppId) => {
    if (resolved?.kind !== 'query') return;
    const { query } = resolved;
    openApp(app, (browser) => browser.search(query));
    finish();
  };

  const openLink = () => {
    if (resolved?.kind !== 'url') return;
    const { url } = resolved;
    openApp(resolved.app, (browser) => browser.loadUrl(url));
    finish();
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.field, { backgroundColor: t.surface, borderColor: text ? t.accent : t.border }]}>
        <Text style={[styles.icon, { color: t.textDim }]}>⌕</Text>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={resolved?.kind === 'url' ? openLink : () => Keyboard.dismiss()}
          placeholder="search or paste a link…"
          placeholderTextColor={t.textFaint}
          returnKeyType={resolved?.kind === 'url' ? 'go' : 'search'}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search"
          style={[typo.body, styles.input, { color: t.text }]}
        />
      </View>
      {resolved?.kind === 'query' && (
        <View style={styles.targets}>
          {APP_IDS.map((app) => (
            <TargetButton key={app} label={`on ${APPS[app].name}`} app={app} onPress={() => searchOn(app)} />
          ))}
        </View>
      )}
      {resolved?.kind === 'url' && (
        <View style={styles.targets}>
          <TargetButton label={`open in ${APPS[resolved.app].name}`} app={resolved.app} onPress={openLink} />
        </View>
      )}
    </View>
  );
}

function TargetButton({ label, app, onPress }: { label: string; app: AppId; onPress: () => void }) {
  const [from] = APPS[app].gradient;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={[styles.target, { borderColor: from }]}>
      <Text style={[typo.label, { color: from }]}>
        {APPS[app].glyph} {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    height: 52,
  },
  icon: { fontSize: 20, marginRight: space.sm },
  input: { flex: 1, paddingVertical: 0 },
  targets: { flexDirection: 'row', gap: space.sm },
  target: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
