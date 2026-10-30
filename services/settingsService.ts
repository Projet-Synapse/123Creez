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
  /** Stabilisateur du tracé (0-100) : lissage exponentiel des points. */
  strokeStabilizer: number;
  /** Forme de l'outil Formes (ligne / rectangle / ellipse). */
  shapeKind: 'line' | 'rect' | 'ellipse';
  /** Gestes de la zone de dessin (style IbisPaint). */
  undoTwoFingerTap: boolean;
  redoThreeFingerTap: boolean;
  /** Rotation de la vue à deux doigts (affichage seul). */
  rotateTwoFingers: boolean;
  longPressEyedropper: boolean;  // Appui long sur la toile = pipette
  /** Sélection d'outils : barre latérale fixe ou popup repliable. */
  toolbarMode: 'bar' | 'popup';
  gyroCorrection: boolean;
  /** Sensibilité du déplacement à deux doigts / molette (multiplicateur, 1 = d'origine). */
  panSensitivity: number;
  /** Sensibilité du zoom pinch / Ctrl+molette (exposant du rapport, 1 = d'origine). */
  zoomSensitivity: number;
  /** Affichage en zoom : lisse (vectoriel) ou pixélisé (pixels du document agrandis sans lissage). Affichage seul. */
  zoomRendering: 'smooth' | 'pixelated';
  // Interface
  showLayerInfo: boolean;
  uiAnimations: boolean;
  confirmOnClose: boolean;
  autoFullscreen: boolean;
  realtimeThumbnail: boolean;
  language: string;
  // Largeurs des barres latérales (px), réglables à la souris par poignées.
  editorPanelWidth: number;
  settingsNavWidth: number;
  // Performance
  hiDpiRendering: boolean;
  antialiasing: boolean;
  batterySaver: boolean;
  historyLimit: number;  // 30 → 250 : l'undo d'une vraie session de peinture
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
  strokeStabilizer: 0,
  shapeKind: 'line',
  undoTwoFingerTap: true,
  rotateTwoFingers: true,
  redoThreeFingerTap: true,
  longPressEyedropper: true,
  toolbarMode: 'bar',
  gyroCorrection: false,
  panSensitivity: 1,
  zoomSensitivity: 1,
  zoomRendering: 'smooth',
  // Interface
  showLayerInfo: true,
  uiAnimations: true,
  confirmOnClose: true,
  autoFullscreen: false,
  realtimeThumbnail: false,
  language: 'fr',
  editorPanelWidth: 200,
  settingsNavWidth: 160,
  // Performance
  hiDpiRendering: true,
  antialiasing: true,
  batterySaver: false,
  historyLimit: 250,
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
