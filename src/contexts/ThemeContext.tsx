import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CurrentUser, ThemeId } from '../types/pdks';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  applyThemeToDocument,
  getThemeById,
  isValidThemeId,
  type ThemeDefinition,
} from '../themes/themes';
import { pdksStorage } from '../services/storage';

const LAST_LIGHT_THEME_KEY = 'pdks_last_light_theme_v1';
const LAST_DARK_THEME_KEY = 'pdks_last_dark_theme_v1';
const DEFAULT_DARK_THEME_ID: ThemeId = 'gece_arduvaz';

function readStoredVariant(key: string, expectedMode: 'light' | 'dark', fallback: ThemeId): ThemeId {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    if (isValidThemeId(val) && getThemeById(val).mode === expectedMode) {
      return val;
    }
  } catch {}
  return fallback;
}

function rememberThemeVariant(themeId: ThemeId): void {
  if (typeof localStorage === 'undefined') return;
  const def = getThemeById(themeId);
  try {
    if (def.mode === 'dark') {
      localStorage.setItem(LAST_DARK_THEME_KEY, def.id);
    } else {
      localStorage.setItem(LAST_LIGHT_THEME_KEY, def.id);
    }
  } catch {}
}

export interface ThemeContextValue {
  themeId: ThemeId;
  themeDef: ThemeDefinition;
  mode: 'light' | 'dark';
  themes: ThemeDefinition[];
  setTheme: (nextThemeId: ThemeId, targetUser?: CurrentUser | null) => Promise<{
    success: boolean;
    themeId: ThemeId;
    cloudSynced: boolean;
    message: string;
  }>;
  setMode: (nextMode: 'light' | 'dark', targetUser?: CurrentUser | null) => Promise<ThemeId>;
  toggleMode: (targetUser?: CurrentUser | null) => Promise<ThemeId>;
  syncThemeFromUser: (targetUser?: CurrentUser | null) => ThemeId;
  resetToDefaultTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const initialTheme = pdksStorage.isLoggedIn()
      ? pdksStorage.getUserTheme(pdksStorage.getActiveUser())
      : DEFAULT_THEME_ID;
    applyThemeToDocument(initialTheme);
    rememberThemeVariant(initialTheme);
    return initialTheme;
  });

  // Ensure document <html> stays synchronized with active theme state on every change
  useEffect(() => {
    applyThemeToDocument(themeId);
    rememberThemeVariant(themeId);
  }, [themeId]);

  // Listen to external theme update broadcasts (e.g. storage sync, login, logout)
  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const detail = (e as CustomEvent<ThemeId>).detail;
      if (isValidThemeId(detail)) {
        setThemeId((prev) => (prev === detail ? prev : detail));
        applyThemeToDocument(detail);
        rememberThemeVariant(detail);
      }
    };
    window.addEventListener('pdks-theme-updated', handleThemeEvent);
    return () => {
      window.removeEventListener('pdks-theme-updated', handleThemeEvent);
    };
  }, []);

  const setTheme = useCallback(
    async (nextThemeId: ThemeId, targetUser?: CurrentUser | null) => {
      const resolvedId = isValidThemeId(nextThemeId) ? nextThemeId : DEFAULT_THEME_ID;
      setThemeId(resolvedId);
      applyThemeToDocument(resolvedId);
      rememberThemeVariant(resolvedId);

      const userToSave = targetUser || (pdksStorage.isLoggedIn() ? pdksStorage.getActiveUser() : null);
      if (userToSave) {
        return pdksStorage.saveUserTheme(resolvedId, userToSave);
      }
      return {
        success: true,
        themeId: resolvedId,
        cloudSynced: false,
        message: 'Tema uygulandı.',
      };
    },
    []
  );

  const setMode = useCallback(
    async (nextMode: 'light' | 'dark', targetUser?: CurrentUser | null): Promise<ThemeId> => {
      const currentDef = getThemeById(themeId);
      if (currentDef.mode === nextMode) {
        applyThemeToDocument(currentDef.id);
        return currentDef.id;
      }
      const nextId =
        nextMode === 'dark'
          ? readStoredVariant(LAST_DARK_THEME_KEY, 'dark', DEFAULT_DARK_THEME_ID)
          : readStoredVariant(LAST_LIGHT_THEME_KEY, 'light', DEFAULT_THEME_ID);
      await setTheme(nextId, targetUser);
      return nextId;
    },
    [themeId, setTheme]
  );

  const toggleMode = useCallback(
    async (targetUser?: CurrentUser | null): Promise<ThemeId> => {
      const currentMode = getThemeById(themeId).mode;
      const nextMode: 'light' | 'dark' = currentMode === 'dark' ? 'light' : 'dark';
      return setMode(nextMode, targetUser);
    },
    [themeId, setMode]
  );

  const syncThemeFromUser = useCallback((targetUser?: CurrentUser | null): ThemeId => {
    const resolved = targetUser
      ? pdksStorage.getUserTheme(targetUser)
      : pdksStorage.isLoggedIn()
      ? pdksStorage.getUserTheme(pdksStorage.getActiveUser())
      : DEFAULT_THEME_ID;
    setThemeId(resolved);
    applyThemeToDocument(resolved);
    rememberThemeVariant(resolved);
    return resolved;
  }, []);

  const resetToDefaultTheme = useCallback(() => {
    setThemeId(DEFAULT_THEME_ID);
    applyThemeToDocument(DEFAULT_THEME_ID);
  }, []);

  const themeDef = useMemo(() => getThemeById(themeId), [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      themeDef,
      mode: themeDef.mode,
      themes: APP_THEMES,
      setTheme,
      setMode,
      toggleMode,
      syncThemeFromUser,
      resetToDefaultTheme,
    }),
    [themeId, themeDef, setTheme, setMode, toggleMode, syncThemeFromUser, resetToDefaultTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
