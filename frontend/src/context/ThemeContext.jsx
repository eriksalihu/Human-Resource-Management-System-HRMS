/**
 * @file frontend/src/context/ThemeContext.jsx
 * @description Theme context — dark/light mode toggle persisted in localStorage, applies the Tailwind `dark` class to <html>, and detects system preference on first load
 * @author Dev A
 *
 * Tailwind v3 supports two dark-mode strategies: 'media' (default — system
 * preference) and 'class' (driven by a `dark` class somewhere up the tree,
 * conventionally on `<html>`). This context writes the class strategy.
 *
 * Until `tailwind.config.js` flips `darkMode: 'class'` (a later commit on
 * the roadmap), Tailwind keeps interpreting `dark:` variants via the OS
 * preference — meaning the toggle button updates state and persists, but
 * the visual change won't take effect until the config update lands. When
 * it does, everything snaps into place with no further code changes here.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

/** localStorage key for the persisted user choice. */
const STORAGE_KEY = 'hrms.theme';

/** Valid mode values. `system` defers to the OS preference. */
const MODES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

/** Resolve the OS-level color-scheme preference. */
const getSystemPreference = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return MODES.LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? MODES.DARK
    : MODES.LIGHT;
};

/**
 * Read the persisted mode from localStorage, falling back to 'system' so
 * first-time visitors honour their OS setting until they pick something
 * explicit. Defensive against environments without localStorage (SSR /
 * private-mode Safari).
 */
const readStoredMode = () => {
  if (typeof window === 'undefined') return MODES.SYSTEM;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === MODES.LIGHT || stored === MODES.DARK || stored === MODES.SYSTEM) {
      return stored;
    }
    return MODES.SYSTEM;
  } catch {
    return MODES.SYSTEM;
  }
};

/** Apply / remove the `dark` class on the document root. */
const applyClass = (resolvedMode) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolvedMode === MODES.DARK) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // `color-scheme` lets browsers pick form-control colors that fit the
  // theme even without explicit Tailwind variants.
  root.style.colorScheme = resolvedMode === MODES.DARK ? 'dark' : 'light';
};

/** Resolve a stored mode (which may be 'system') to an actual rendered mode. */
const resolveMode = (mode) =>
  mode === MODES.SYSTEM ? getSystemPreference() : mode;

/** @type {React.Context} */
export const ThemeContext = createContext(null);

/**
 * ThemeProvider — wraps the app and exposes:
 *   - mode: the user's explicit choice ('light' | 'dark' | 'system')
 *   - resolvedMode: what's actually rendering ('light' | 'dark') after
 *     resolving 'system' against the OS preference
 *   - isDark: convenience boolean
 *   - setMode(next): explicitly choose 'light' / 'dark' / 'system'
 *   - toggle(): cycles light → dark (ignoring 'system'), useful for a
 *     simple sun/moon button
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export const ThemeProvider = ({ children }) => {
  const [mode, setModeState] = useState(() => readStoredMode());
  const [resolvedMode, setResolvedMode] = useState(() =>
    resolveMode(readStoredMode())
  );

  /** Apply the resolved mode whenever the user choice or system pref shifts. */
  useEffect(() => {
    const next = resolveMode(mode);
    setResolvedMode(next);
    applyClass(next);
  }, [mode]);

  /**
   * Re-apply on the OS-level color-scheme change, but only when the user
   * is in 'system' mode — explicit picks should ignore the OS toggle.
   */
  useEffect(() => {
    if (mode !== MODES.SYSTEM) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const next = getSystemPreference();
      setResolvedMode(next);
      applyClass(next);
    };

    // Older Safari uses addListener / removeListener; modern browsers use
    // addEventListener / removeEventListener. Both work for this MQL.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [mode]);

  /** Persist the explicit user choice. */
  const setMode = useCallback((next) => {
    if (![MODES.LIGHT, MODES.DARK, MODES.SYSTEM].includes(next)) return;
    setModeState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / disabled storage — silently ignore */
    }
  }, []);

  /** Toggle between light and dark. 'system' resolves to its current rendered value first. */
  const toggle = useCallback(() => {
    setModeState((current) => {
      const currentResolved = resolveMode(current);
      const next = currentResolved === MODES.DARK ? MODES.LIGHT : MODES.DARK;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        /* swallow */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      isDark: resolvedMode === MODES.DARK,
      setMode,
      toggle,
      MODES,
    }),
    [mode, resolvedMode, setMode, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export default ThemeContext;
