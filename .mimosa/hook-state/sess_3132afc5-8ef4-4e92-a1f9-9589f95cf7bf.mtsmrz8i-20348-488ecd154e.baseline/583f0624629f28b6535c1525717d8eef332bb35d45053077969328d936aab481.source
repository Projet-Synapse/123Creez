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
  onUpdateEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(UPDATE_CHANNEL, listener);
    return () => ipcRenderer.removeListener(UPDATE_CHANNEL, listener);
  },
});
