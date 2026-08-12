import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'adeem.theme';

/**
 * Three states, not two. "System" is the default and is handled entirely in CSS
 * via prefers-color-scheme, so the correct theme is painted on the very first
 * frame — the CSP forbids the inline script that would otherwise be needed to
 * stamp a class before paint, and without that a dark-mode user would see a white
 * flash on every load.
 *
 * This module therefore only ever writes the *override*: data-theme is set when
 * the user has made an explicit choice, and removed when they hand control back.
 */
export function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    apply(theme);
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  }, [theme]);

  /** Whether dark is showing right now, whichever way it was decided. */
  const isDark = theme === 'dark'
    || (theme === 'system'
        && typeof window !== 'undefined'
        && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Cycles light -> dark -> system, so following the OS again is reachable
  // without a settings screen.
  const cycle = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'));
  }, []);

  return { theme, setTheme, isDark, cycle };
}
