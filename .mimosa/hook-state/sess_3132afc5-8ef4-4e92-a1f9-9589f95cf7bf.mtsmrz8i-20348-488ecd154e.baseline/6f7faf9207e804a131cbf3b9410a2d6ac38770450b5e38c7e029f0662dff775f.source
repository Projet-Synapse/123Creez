// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'oled' | 'light';
export type CanvasBg = 'white' | 'black' | 'transparent' | 'grid' | 'dots';

export interface AppSettings {
  themeMode: ThemeMode;
  canvasBg: CanvasBg;
  showGrid: boolean;
  showRulers: boolean;
  toolbarPosition: 'left' | 'right';
  panelPosition: 'right' | 'left';
  showStatusBar: boolean;
  autoSaveInterval: number; // seconds, 0 = off
  defaultBrushSize: number;
  defaultOpacity: number;
  workspaceBgColor: string; // color around the canvas
  accentColor: string;
  // Tools
  cursorStyle: string;
  pressureCurve: string;
  smoothing: boolean;
  gyroCorrection: boolean;
  // Interface
  showLayerInfo: boolean;
  uiAnimations: boolean;
  confirmOnClose: boolean;
  autoFullscreen: boolean;
  realtimeThumbnail: boolean;
  language: string;
  // Performance
  hiDpiRendering: boolean;
  antialiasing: boolean;
  batterySaver: boolean;
  historyLimit: number;
  // Storage
  defaultExportFormat: string;
  // Accessibility
  highContrast: boolean;
  reduceMotion: boolean;
  boldUI: boolean;
  uiFontSize: 'small' | 'medium' | 'large';
}

const KEY = 'app:settings';

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'dark',
  canvasBg: 'white',
  showGrid: false,
  showRulers: false,
  toolbarPosition: 'left',
  panelPosition: 'right',
  showStatusBar: true,
  autoSaveInterval: 30,
  defaultBrushSize: 12,
  defaultOpacity: 1,
  workspaceBgColor: '#1a1a1a',
  accentColor: '#4ecdc4',
  // Tools
  cursorStyle: 'ring',
  pressureCurve: 'linear',
  smoothing: true,
  gyroCorrection: false,
  // Interface
  showLayerInfo: true,
  uiAnimations: true,
  confirmOnClose: true,
  autoFullscreen: false,
  realtimeThumbnail: false,
  language: 'fr',
  // Performance
  hiDpiRendering: true,
  antialiasing: true,
  batterySaver: false,
  historyLimit: 30,
  // Storage
  defaultExportFormat: 'PNG',
  // Accessibility
  highContrast: false,
  reduceMotion: false,
  boldUI: false,
  uiFontSize: 'medium',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
