const countFormat = new Intl.NumberFormat('en-US');

/** 1204 -> "1,204". */
export function formatCount(n: number): string {
  return countFormat.format(Math.max(0, Math.round(n)));
}

/** 1204 -> "1.2k", 3_400_000 -> "3.4M". For tight spaces like chips. */
export function formatCompact(n: number): string {
  const abs = Math.max(0, Math.round(n));
  if (abs < 1000) return String(abs);
  const [value, suffix] = abs < 1_000_000 ? [abs / 1000, 'k'] : [abs / 1_000_000, 'M'];
  const rounded = value < 10 ? Math.floor(value * 10) / 10 : Math.floor(value);
  return `${rounded}${suffix}`;
}

/** 83_000 -> "1:23", 3_723_000 -> "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Coarse "how long ago" label for timestamps like the last filter update. */
export function formatAgo(thenMs: number, nowMs: number): string {
  if (thenMs <= 0) return 'never';
  const minutes = Math.floor(Math.max(0, nowMs - thenMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
