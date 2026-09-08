// Powered by OnSpace.AI
import React, {
  createContext, useState, useCallback, useEffect, ReactNode,
} from 'react';
import { AppSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/services/settingsService';

interface ThemeContextType {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  theme: ThemeTokens;
}

export interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceHigh: string;
  surfaceBorder: string;
  panelBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentAlt: string;
  accentGold: string;
  active: string;
  activeGlow: string;
  danger: string;
  success: string;
  toolDefault: string;
  toolActive: string;
  canvasBg: string;
  cardBg: string;
  statusBarStyle: 'light' | 'dark';
}

const DARK_THEME: ThemeTokens = {
  bg: '#0d0d0d', surface: '#1a1a1a', surfaceHigh: '#242424',
  surfaceBorder: '#2e2e2e', panelBg: '#141414',
  textPrimary: '#f0f0f0', textSecondary: '#888888', textMuted: '#555555',
  accent: '#4ecdc4', accentAlt: '#ff6b6b', accentGold: '#ffd700',
  active: '#4ecdc4', activeGlow: 'rgba(78,205,196,0.25)',
  danger: '#ff6b6b', success: '#6bcb77',
  toolDefault: '#3a3a3a', toolActive: '#4ecdc4',
  canvasBg: '#ffffff', cardBg: '#1e1e1e', statusBarStyle: 'light',
};

const OLED_THEME: ThemeTokens = {
  bg: '#000000', surface: '#0a0a0a', surfaceHigh: '#111111',
  surfaceBorder: '#1c1c1c', panelBg: '#050505',
  textPrimary: '#ffffff', textSecondary: '#777777', textMuted: '#444444',
  accent: '#4ecdc4', accentAlt: '#ff6b6b', accentGold: '#ffd700',
  active: '#4ecdc4', activeGlow: 'rgba(78,205,196,0.2)',
  danger: '#ff6b6b', success: '#6bcb77',
  toolDefault: '#222222', toolActive: '#4ecdc4',
  canvasBg: '#ffffff', cardBg: '#0d0d0d', statusBarStyle: 'light',
};

const LIGHT_THEME: ThemeTokens = {
  bg: '#f4f4f8', surface: '#ffffff', surfaceHigh: '#efefef',
  surfaceBorder: '#ddd', panelBg: '#f9f9fb',
  textPrimary: '#111111', textSecondary: '#555555', textMuted: '#aaaaaa',
  accent: '#2abdb5', accentAlt: '#e95555', accentGold: '#d4a000',
  active: '#2abdb5', activeGlow: 'rgba(42,189,181,0.18)',
  danger: '#e95555', success: '#4caf50',
  toolDefault: '#e0e0e0', toolActive: '#2abdb5',
  canvasBg: '#ffffff', cardBg: '#ffffff', statusBarStyle: 'dark',
};

function resolveTheme(mode: AppSettings['themeMode']): ThemeTokens {
  if (mode === 'oled') return OLED_THEME;
  if (mode === 'light') return LIGHT_THEME;
  return DARK_THEME;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeTokens>(DARK_THEME);

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s);
      setTheme(resolveTheme(s.themeMode));
    });
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    setTheme(resolveTheme(next.themeMode));
    await saveSettings(next);
  }, [settings]);

  return (
    <ThemeContext.Provider value={{ settings, updateSettings, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}
