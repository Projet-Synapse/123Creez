// Powered by OnSpace.AI — Electron preload bridge
//
// The renderer runs the Expo web bundle with contextIsolation on and node
// integration off. Everything it may ask of the OS goes through this narrow,
// explicitly enumerated surface — see services/platform.ts for the typed view.
const { contextBridge, ipcRenderer } = require('electron');

const UPDATE_CHANNEL = 'updates:event';

contextBridge.exposeInMainWorld('creezDesktop', {
  platform: process.platform,
  appVersion: ipcRenderer.sendSync('app:version'),

  // ── Updates ──────────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  /** Replaces the installed build with the downloaded one and relaunches. */
  quitAndInstall: () => ipcRenderer.send('updates:install'),
  /** Turns automatic download + install-on-quit on or off. */
  setAutoUpdate: (enabled) => ipcRenderer.send('updates:set-auto', enabled),
  /** Traqueur : historique local des événements + releases GitHub connues. */
  getUpdatesHistory: () => ipcRenderer.invoke('updates:history'),
  onUpdateEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(UPDATE_CHANNEL, listener);
    return () => ipcRenderer.removeListener(UPDATE_CHANNEL, listener);
  },

  // ── Auth Google (PKCE, protocole app123creez://) ────────────────────
  auth: {
    openExternal: (url) => ipcRenderer.invoke('auth:open-external', url),
    onCallback: (handler) => {
      const listener = (_event, url) => handler(url);
      ipcRenderer.on('auth:callback', listener);
      return () => ipcRenderer.removeListener('auth:callback', listener);
    },
    // Callback reçu au démarrage à froid via argv (voir desktop/auth.js).
    takePendingUrl: () => ipcRenderer.invoke('auth:take-pending-url'),
  },

  // ── Dossier vault (miroir explorateur) ──────────────────────────────
  vaultFolder: {
    get: () => ipcRenderer.invoke('vault-folder:get'),
    choose: () => ipcRenderer.invoke('vault-folder:choose'),
    writeImage: (name, dataUrl) => ipcRenderer.invoke('vault-folder:write-image', name, dataUrl),
    listImages: () => ipcRenderer.invoke('vault-folder:list-images'),
    readImage: (filePath) => ipcRenderer.invoke('vault-folder:read-image', filePath),
    deleteImage: (filePath) => ipcRenderer.invoke('vault-folder:delete-image', filePath),
    /** Événements du dossier (image ajoutée…) ; retourne la fonction de désabonnement. */
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on('vault-folder:event', listener);
      return () => ipcRenderer.removeListener('vault-folder:event', listener);
    },
  },
});
