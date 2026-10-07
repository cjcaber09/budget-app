import { useMemo } from 'react';
import { Platform, StyleSheet, useColorScheme, type TextStyle } from 'react-native';
import { usePreferencesStore } from '../stores/usePreferencesStore';

export const lightColors = {
  background: '#F5F6F2', surface: '#FFFFFF', surfaceAlt: '#EDF0E9',
  text: '#202B26', muted: '#626D65', subtle: '#69736A', border: '#DDE3DA',
  primary: '#193C32', primaryHover: '#285244', onPrimary: '#FFFFFF', selected: '#DFE9DD',
  success: '#326449', successBg: '#E6EFE7', warning: '#84591B', warningBg: '#F8EFDC',
  danger: '#A33F36', dangerBg: '#F9EAE5', scrim: 'rgba(14, 27, 20, 0.42)',
};
export type Colors = Record<keyof typeof lightColors, string>;
export const darkColors: Colors = {
  background: '#141C18', surface: '#1C2721', surfaceAlt: '#243229',
  text: '#F0F3EC', muted: '#AFBDB1', subtle: '#9CAE9F', border: '#35473B',
  primary: '#BDDAC4', primaryHover: '#D6E9D9', onPrimary: '#163022', selected: '#334D3C',
  success: '#A9D2B1', successBg: '#253F2E', warning: '#E8C58C', warningBg: '#433620',
  danger: '#F1A59B', dangerBg: '#462B28', scrim: 'rgba(0, 0, 0, 0.65)',
};
export const fontFamily = Platform.select({ web: 'Segoe UI, system-ui, -apple-system, sans-serif', ios: 'System', android: 'sans-serif' });
export const type = {
  title: { fontFamily, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 } as TextStyle,
  heading: { fontFamily, fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 } as TextStyle,
  body: { fontFamily, fontSize: 15, lineHeight: 23 } as TextStyle,
  label: { fontFamily, fontSize: 13, lineHeight: 20, fontWeight: '600' } as TextStyle,
  number: { fontFamily, fontVariant: ['tabular-nums'], fontWeight: '600' } as TextStyle,
};
export const motion = { press: 120, enter: 240, exit: 180, easeOut: 'cubic-bezier(0.23, 1, 0.32, 1)', easeSheet: 'cubic-bezier(0.32, 0.72, 0, 1)' } as const;
export function useColors(): Colors {
  return useThemeMode() === 'dark' ? darkColors : lightColors;
}
export function useThemeMode() { const system=useColorScheme(); const profile=usePreferencesStore(s=>s.profile);const appearance=profile?.appearance??'system'; return appearance==='system' ? system ?? 'light' : appearance; }
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Colors) => T) {
  return function useStyles() {
    const colors = useColors();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
