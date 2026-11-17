import type { ThemeId } from '../types/pdks';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  subtitle: string;
  description: string;
  mode: 'light' | 'dark';
  preview: {
    bg: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
  };
}

export const DEFAULT_THEME_ID: ThemeId = 'kurumsal_saf';

export const APP_THEMES: ThemeDefinition[] = [
  {
    id: 'kurumsal_saf',
    name: 'Kurumsal Açık',
    subtitle: 'Saf Arduvaz',
    description: 'Dengeli kontrastlı klasik kurumsal görünüm.',
    mode: 'light',
    preview: {
      bg: '#f8fafc',
      surface: '#ffffff',
      surfaceMuted: '#f1f5f9',
      border: '#e2e8f0',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#4f46e5',
    },
  },
  {
    id: 'sicak_kagit',
    name: 'Sıcak Kâğıt',
    subtitle: 'Kum & Adaçayı',
    description: 'Mavi ışığı azaltan, uzun okumalar için göz dinlendiren sıcak ton.',
    mode: 'light',
    preview: {
      bg: '#f6f3ec',
      surface: '#fdfcf8',
      surfaceMuted: '#ede8dc',
      border: '#e0d9c8',
      text: '#1f1d1a',
      textMuted: '#6b655c',
      accent: '#2d6a58',
    },
  },
  {
    id: 'serin_sis',
    name: 'Serin Sis',
    subtitle: 'Gümüş & Çelik',
    description: 'Mat gri-mavi zemin ile parlamasız, sade gündüz çalışma alanı.',
    mode: 'light',
    preview: {
      bg: '#eef2f7',
      surface: '#f8fafc',
      surfaceMuted: '#e2e8f0',
      border: '#d3dce8',
      text: '#111827',
      textMuted: '#5b6574',
      accent: '#2563eb',
    },
  },
  {
    id: 'gece_arduvaz',
    name: 'Gece Arduvaz',
    subtitle: 'Koyu Mat',
    description: 'Zifiri siyah yerine yumuşak koyu arduvaz tonuyla göz yormayan gece modu.',
    mode: 'dark',
    preview: {
      bg: '#11161f',
      surface: '#18202c',
      surfaceMuted: '#202a38',
      border: '#2a374b',
      text: '#e6ebf2',
      textMuted: '#8e9fb8',
      accent: '#7c8cf8',
    },
  },
  {
    id: 'komur_orman',
    name: 'Kömür & Adaçayı',
    subtitle: 'Koyu Dingin',
    description: 'Nötr kömür zemin ve yumuşak adaçayı vurgusuyla düşük parlamalı koyu tema.',
    mode: 'dark',
    preview: {
      bg: '#121615',
      surface: '#1a201e',
      surfaceMuted: '#232b28',
      border: '#2d3733',
      text: '#e4e8e6',
      textMuted: '#8b9993',
      accent: '#4eb394',
    },
  },
];

export const VALID_THEME_IDS: readonly ThemeId[] = APP_THEMES.map((t) => t.id);

export function isValidThemeId(val: unknown): val is ThemeId {
  return typeof val === 'string' && VALID_THEME_IDS.includes(val as ThemeId);
}

export function getThemeById(themeId?: string | null): ThemeDefinition {
  const found = APP_THEMES.find((t) => t.id === themeId);
  return found || APP_THEMES[0];
}

export function applyThemeToDocument(themeId?: string | null): ThemeDefinition {
  const theme = getThemeById(themeId);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-theme-mode', theme.mode);
    root.classList.toggle('dark', theme.mode === 'dark');
    root.style.colorScheme = theme.mode;
  }
  return theme;
}
