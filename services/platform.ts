// Powered by OnSpace.AI — Runtime platform detection (mobile / web / desktop)
import { Platform } from 'react-native';

/** Bridge injected by desktop/preload.js when running inside the Electron shell. */
export interface DesktopBridge {
  platform: 'linux' | 'darwin' | 'win32';
  appVersion: string;
  checkForUpdates: () => Promise<{ updateAvailable: boolean; version?: string; error?: string }>;
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
  /** Quits the app, replaces the installed build, then relaunches. */
  quitAndInstall: () => void;
  /** Turns automatic download + install-on-quit on or off. */
  setAutoUpdate: (enabled: boolean) => void;
  onUpdateEvent: (handler: (event: DesktopUpdateEvent) => void) => () => void;
  vaultFolder?: DesktopVaultFolder;
  auth?: DesktopAuth;
}

export type DesktopUpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

/** Auth Google : pont navigateur-système + protocole app123creez://. */
export interface DesktopAuth {
  openExternal: (url: string) => Promise<void>;
  onCallback: (handler: (url: string) => void) => () => void;
  /** Callback reçu au démarrage à froid via argv — consommé une seule fois. */
  takePendingUrl: () => Promise<string | null>;
}

/** Miroir explorateur : dossier disque lié au vault (desktop uniquement). */
export interface DesktopVaultFolder {
  get: () => Promise<string | null>;
  choose: () => Promise<string | null>;
  writeImage: (name: string, dataUrl: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  listImages: () => Promise<{ name: string; path: string; mtime: number }[]>;
  readImage: (filePath: string) => Promise<string | null>;
  deleteImage: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  onEvent: (handler: (event: { type: string; filename?: string }) => void) => () => void;
}

declare global {
  var creezDesktop: DesktopBridge | undefined;
}

function getBridge(): DesktopBridge | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return globalThis.creezDesktop;
}

/** True when the web bundle is running inside the Electron desktop shell. */
export const isDesktop = (): boolean => Platform.OS === 'web' && getBridge() !== undefined;

/** True on a plain browser (not the desktop shell). */
export const isBrowser = (): boolean => Platform.OS === 'web' && !isDesktop();

/** True on iOS or Android. */
export const isNative = (): boolean => Platform.OS === 'ios' || Platform.OS === 'android';

export const desktop = getBridge;
