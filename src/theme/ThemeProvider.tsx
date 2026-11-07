import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/hooks/useSettings';

import { darkPalette, lightPalette, type Palette } from './palettes';

const ThemeContext = createContext<Palette>(darkPalette);

/** Resolves the theme setting (system/dark/light) into a palette. Dark wins when unknown. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ theme }] = useSettings();
  const system = useColorScheme();
  const scheme = theme === 'system' ? (system === 'light' ? 'light' : 'dark') : theme;
  const palette = scheme === 'light' ? lightPalette : darkPalette;

  useEffect(() => {
    // Root view colour shows briefly during rotations and keyboard resizes.
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette.bg]);

  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Palette {
  return useContext(ThemeContext);
}
