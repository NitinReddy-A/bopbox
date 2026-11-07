import { brand } from './tokens';

export type Palette = {
  scheme: 'dark' | 'light';
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentAlt: string;
  accentInk: string;
  violet: string;
  danger: string;
  glow: readonly [string, string];
};

export const darkPalette: Palette = {
  scheme: 'dark',
  bg: brand.ink,
  surface: '#15151F',
  surfaceRaised: '#1E1E2C',
  border: '#2A2A3C',
  text: '#F5F3FF',
  textDim: '#A7A3C2',
  textFaint: '#66637F',
  accent: brand.pink,
  accentAlt: brand.lime,
  accentInk: brand.ink,
  violet: brand.violet,
  danger: '#FF5A6E',
  glow: ['rgba(107,75,255,0.35)', 'rgba(11,11,18,0)'],
};

export const lightPalette: Palette = {
  scheme: 'light',
  bg: '#F6F4FF',
  surface: '#FFFFFF',
  surfaceRaised: '#EEEAFE',
  border: '#DDD8F5',
  text: '#14121F',
  textDim: '#55506F',
  textFaint: '#8E89A8',
  accent: '#E02BB8',
  accentAlt: '#5C9A00',
  accentInk: '#FFFFFF',
  violet: brand.violet,
  danger: '#D92D45',
  glow: ['rgba(255,79,216,0.18)', 'rgba(246,244,255,0)'],
};
