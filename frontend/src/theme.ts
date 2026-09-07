import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F3F4F6",
  onSurface: "#111827",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#111827",
  surfaceTertiary: "#E5E7EB",
  onSurfaceTertiary: "#374151",
  surfaceInverse: "#111827",
  onSurfaceInverse: "#F9FAFB",
  muted: "#4B5563",

  brand: "#15803D",
  onBrand: "#FFFFFF",
  brandPrimary: "#15803D",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#DCFCE7",
  onBrandSecondary: "#14532D",
  brandTertiary: "#22C55E",
  onBrandTertiary: "#064E3B",

  success: "#15803D",
  onSuccess: "#FFFFFF",
  warning: "#B45309",
  onWarning: "#FFFFFF",
  error: "#B91C1C",
  onError: "#FFFFFF",
  info: "#0369A1",
  onInfo: "#FFFFFF",

  border: "#D1D5DB",
  borderStrong: "#9CA3AF",
  divider: "#E5E7EB",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const colors = light;
