import { useCallback, useLayoutEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

export function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  // An explicit `?theme=dark` / `?theme=light` overrides the OS preference on
  // load (handy for embeds); the in-app toggle still works afterwards.
  const themeParam = new URLSearchParams(window.location.search).get("theme")?.trim().toLowerCase();
  if (themeParam === "dark" || themeParam === "light") {
    return themeParam;
  }

  // Geoenergy edition: dark is the default rather than the OS preference.
  // Energy layers (transmission lines, plant points) read better on dark chrome,
  // and the first impression is the point. `?theme=light` above still wins, and
  // the toolbar toggle still switches at any time.
  return "dark";
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);

  useLayoutEffect(() => {
    const isDark = themeMode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((currentThemeMode) => (currentThemeMode === "dark" ? "light" : "dark"));
  }, []);

  return { themeMode, toggleThemeMode };
}
