/** Raw brand palette. Components should read colours through `useTheme()` instead. */
export const brand = {
  ink: '#0B0B12',
  pink: '#FF4FD8',
  lime: '#B6FF3B',
  violet: '#6B4BFF',
  youtube: ['#FF3B5C', '#FF8A3B'],
  spotify: ['#1ED760', '#0EA5A0'],
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const type = {
  hero: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: '600' },
  mono: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
} as const;

export const motion = {
  fast: 160,
  base: 220,
} as const;

/** Height of the in-app top bar, excluding the status bar inset. */
export const TOP_BAR_HEIGHT = 52;
