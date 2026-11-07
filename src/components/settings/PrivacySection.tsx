import { BopboxCore, type AppId } from '@bopbox/core';
import { Alert } from 'react-native';

import { APPS, APP_IDS } from '@/lib/apps';
import { haptic } from '@/lib/haptics';

import { ActionRow, Section } from './rows';

function confirmThen(title: string, message: string, action: string, run: () => Promise<void>) {
  haptic('reject');
  Alert.alert(title, message, [
    { text: 'nah', style: 'cancel' },
    {
      text: action,
      style: 'destructive',
      onPress: () => {
        run()
          .then(() => haptic('confirm'))
          .catch((error: unknown) => Alert.alert('that did not work', String(error)));
      },
    },
  ]);
}

export function PrivacySection() {
  const signOut = (app: AppId) =>
    confirmThen(
      `Sign out of ${APPS[app].name}?`,
      `Clears ${APPS[app].name}'s cookies, storage and cache. You'll need to log in again.`,
      'sign out',
      () => BopboxCore.clearAppData(app),
    );

  const nuke = () =>
    confirmThen(
      'Nuke all browsing data?',
      'Every cookie, login and cache, for both apps. Gone. No undo.',
      'nuke it',
      () => BopboxCore.clearAllData(),
    );

  return (
    <Section title="Privacy & data">
      {APP_IDS.map((app) => (
        <ActionRow key={app} label={`Sign out of ${APPS[app].name}`} onPress={() => signOut(app)} />
      ))}
      <ActionRow label="Nuke all browsing data" hint="scorched earth, both apps" tone="danger" onPress={nuke} />
    </Section>
  );
}
