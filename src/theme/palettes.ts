/**
 * Two equally designed renderings of one system (light is not an inverted dark). Neutrals sit
 * on Apple's greys; the only chromatic colour is the accent, YouTube red.
 */
export type Palette = {
  scheme: 'dark' | 'light';
  /** Screen canvas (grouped background). */
  bg: string;
  /** YouTube's own page colour, painted behind the status and navigation bars. */
  page: string;
  /** Cards, sheets, rows. In dark mode elevation is lightness, never shadow. */
  surface: string;
  /** Popovers and menus: one step above surface. */
  elevated: string;
  /** Secondary fills: search field, segmented track, tinted buttons. */
  fill: string;
  /** Hairlines between rows and under bars. */
  separator: string;
  label: string;
  secondary: string;
  tertiary: string;
  accent: string;
  /** Text and icons drawn on the accent. */
  onAccent: string;
  danger: string;
  success: string;
  /** Dim behind sheets and menus. */
  scrim: string;
  /** Soft drop shadow for cards in light mode; 'none' in dark. */
  cardShadow: string;
  menuShadow: string;
};

export const lightPalette: Palette = {
  scheme: 'light',
  bg: '#F5F5F7',
  page: '#FFFFFF',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  fill: '#EDEDF0',
  separator: '#D8D8DD',
  label: '#1D1D1F',
  secondary: '#6E6E73',
  tertiary: '#A1A1A6',
  accent: '#FF0033',
  onAccent: '#FFFFFF',
  danger: '#FF3B30',
  success: '#34C759',
  scrim: 'rgba(0, 0, 0, 0.18)',
  cardShadow: '0px 1px 2px rgba(0, 0, 0, 0.05), 0px 4px 16px rgba(0, 0, 0, 0.04)',
  menuShadow: '0px 8px 32px rgba(0, 0, 0, 0.14), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.06)',
};

export const darkPalette: Palette = {
  scheme: 'dark',
  bg: '#0B0B0C',
  page: '#0F0F0F',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  fill: '#2C2C2E',
  separator: '#38383A',
  label: '#F5F5F7',
  secondary: '#98989D',
  tertiary: '#636366',
  accent: '#FF4E45',
  onAccent: '#FFFFFF',
  danger: '#FF453A',
  success: '#30D158',
  scrim: 'rgba(0, 0, 0, 0.45)',
  cardShadow: 'none',
  menuShadow: '0px 0px 0px 0.5px rgba(255, 255, 255, 0.08)',
};
