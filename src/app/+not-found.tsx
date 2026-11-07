import { useDeepLink } from '@/shell/useDeepLink';

const ignore = () => {};

/** Unknown links leave the shell wherever it already is. */
export default function NotFound() {
  useDeepLink(ignore);
  return null;
}
