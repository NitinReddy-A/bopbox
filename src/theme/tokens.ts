import { cubicBezier, Easing } from 'react-native-reanimated';

/** Brand colours, used only inside each app's icon. */
export const brand = {
  youtube: '#FF0033',
} as const;

/** Spacing scale. Every gap and padding in the app comes from here. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 44,
} as const;

/** One radius per nesting level, concentric: inner = outer - padding. */
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  card: 22,
  pill: 999,
} as const;

/** iOS app-icon corner ratio (a continuous squircle approximated by a rounded square). */
export const ICON_CORNER = 0.2237;

const FONT = 'Inter';

/**
 * Apple's type ramp, set in Inter (embedded at build time). Tracking tightens as size grows;
 * leading tightens on display sizes and opens on body.
 */
export const type = {
  largeTitle: { fontFamily: FONT, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  title1: { fontFamily: FONT, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.55 },
  title2: { fontFamily: FONT, fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4 },
  headline: { fontFamily: FONT, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontFamily: FONT, fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.25 },
  callout: { fontFamily: FONT, fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.2 },
  subhead: { fontFamily: FONT, fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.15 },
  subheadStrong: { fontFamily: FONT, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.15 },
  footnote: { fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.05 },
  footnoteStrong: { fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: -0.05 },
  caption: { fontFamily: FONT, fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
} as const;

/** Figures that compare (times, counts) keep their width as they change. */
export const tabular = { fontVariant: ['tabular-nums'] } as const;

/**
 * Motion vocabulary. Springs for anything a finger moves (Apple's damping + response, as
 * Reanimated's duration + dampingRatio); ease-out curves for everything else. Never ease-in.
 */
export const motion = {
  press: 120,
  small: 180,
  medium: 260,
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  easeSheet: Easing.bezier(0.32, 0.72, 0, 1),
  /** Default settle: critically damped, no overshoot. */
  settle: { duration: 400, dampingRatio: 1 },
  /** Sheet released by a finger: a little give, carrying the gesture's velocity. */
  sheet: { duration: 320, dampingRatio: 0.82 },
} as const;

/** Same curve as `motion.easeOut`, for Reanimated CSS transitions. */
export const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** Height of the in-app top bar, excluding the status bar inset. */
export const TOP_BAR_HEIGHT = 52;
