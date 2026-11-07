import { useDeepLink } from '@/shell/useDeepLink';
import { useShell } from '@/shell/ShellContext';

/** `bopbox://search`: home with the search field focused. */
export default function SearchLink() {
  useDeepLink(useShell().focusSearch);
  return null;
}
