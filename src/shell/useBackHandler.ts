import { BopboxCore } from '@bopbox/core';
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

import { decideBack, type BackDecision } from './decideBack';
import { useShell, type ShellApi } from './ShellContext';
import type { ShellState } from './shellReducer';

function perform(decision: BackDecision, shell: ShellApi): void {
  switch (decision.type) {
    case 'closeSettings':
      return shell.closeSettings();
    case 'exitFullscreen':
      return shell.run((b) => b.exitFullscreen());
    case 'goBack':
      return shell.run((b) => b.goBack());
    case 'moveToBackground':
      return BopboxCore.moveToBackground();
  }
}

/** Hardware back is always consumed: the app never finishes itself, playback must survive. */
export function useBackHandler(state: ShellState): void {
  const shell = useShell();
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      perform(decideBack(latest.current), shell);
      return true;
    });
    return () => sub.remove();
  }, [shell]);
}
