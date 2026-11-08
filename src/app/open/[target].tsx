import { useDeepLink } from '@/shell/useDeepLink';
import { useShell } from '@/shell/ShellContext';

/**
 * `bopbox://open/<anything>` from the widgets and the media notification: bring YouTube back
 * to the front (closing Settings if it was open over it).
 */
export default function OpenLink() {
  useDeepLink(useShell().closeSettings);
  return null;
}
