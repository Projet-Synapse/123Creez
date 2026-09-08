// Powered by OnSpace.AI — Electron main process (Linux / macOS / Windows)
//
// The renderer is the same Expo web bundle the browser build uses. In
// production it is served over a custom `app://` scheme rather than file://,
// because expo-router's client-side routing needs absolute paths and a real
// origin (localStorage, which holds the vault and settings, is per-origin).
const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const APP_SCHEME = 'app';
const RENDERER_DIR = path.join(__dirname, 'renderer');
const DEV_SERVER_URL = process.env.CREEZ_DEV_SERVER_URL || 'http://localhost:8081';
const isDev = !app.isPackaged;

log.transports.file.level = 'info';
autoUpdater.logger = log;
// Default to a fully manual pipeline so the user is never surprised by a
// restart; see `updates:download` / `updates:install` below. The settings
// screen can flip both flags via `updates:set-auto`.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// The preload reads this synchronously; registered at module load so it is
// always answered before the first window is created.
ipcMain.on('app:version', (event) => {
  event.returnValue = app.getVersion();
});

let mainWindow = null;

// The custom scheme must be registered before `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// ── Single instance: a second launch just focuses the existing one ──────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function resolveRendererFile(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(RENDERER_DIR, relative);

  // Never serve anything outside the renderer directory.
  if (resolved !== RENDERER_DIR && !resolved.startsWith(RENDERER_DIR + path.sep)) return null;

  const candidates = path.extname(resolved)
    ? [resolved]
    : // `expo export` emits one .html per route (editor → editor.html), so a
      // reload deep in the app should land on that route's own document.
      [`${resolved}.html`, path.join(resolved, 'index.html'), resolved];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const file = resolveRendererFile(pathname);

    if (file) return net.fetch(pathToFileURL(file).toString());

    // Unknown path: hand it to expo-router, which resolves it client-side.
    const fallback = path.join(RENDERER_DIR, 'index.html');
    if (fs.existsSync(fallback)) return net.fetch(pathToFileURL(fallback).toString());
    return new Response('Not found', { status: 404 });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0d0d0d',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Anything that tries to open a new window goes to the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadURL(`${APP_SCHEME}://local/index.html`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Update pipeline ─────────────────────────────────────────────────────────
function send(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:event', payload);
  }
}

autoUpdater.on('checking-for-update', () => send({ type: 'checking' }));
autoUpdater.on('update-available', (info) =>
  send({ type: 'available', version: info.version, releaseNotes: stringifyNotes(info.releaseNotes) }),
);
autoUpdater.on('update-not-available', (info) => send({ type: 'not-available', version: info.version }));
autoUpdater.on('download-progress', (p) =>
  send({
    type: 'progress',
    percent: Math.round(p.percent),
    transferred: p.transferred,
    total: p.total,
  }),
);
autoUpdater.on('update-downloaded', (info) => send({ type: 'downloaded', version: info.version }));
autoUpdater.on('error', (err) => send({ type: 'error', message: String(err?.message ?? err) }));

function stringifyNotes(notes) {
  if (!notes) return undefined;
  if (typeof notes === 'string') return notes;
  return notes
    .map((n) => n.note)
    .filter(Boolean)
    .join('\n\n');
}

ipcMain.handle('updates:check', async () => {
  if (isDev) return { updateAvailable: false, error: 'Mises à jour désactivées en développement' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    return { updateAvailable: version !== app.getVersion(), version };
  } catch (error) {
    log.error('[updates] check failed', error);
    return { updateAvailable: false, error: String(error?.message ?? error) };
  }
});

ipcMain.handle('updates:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    log.error('[updates] download failed', error);
    return { ok: false, error: String(error?.message ?? error) };
  }
});

// Quits the app, lets the installer replace the currently installed build, and
// relaunches it — the app restarts on the new version.
ipcMain.on('updates:install', () => {
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
});

// With automatic updates on, a found update downloads by itself and the
// installer replaces the build silently the next time the app quits.
ipcMain.on('updates:set-auto', (_event, enabled) => {
  autoUpdater.autoDownload = !!enabled;
  autoUpdater.autoInstallOnAppQuit = !!enabled;
  log.info(`[updates] automatic updates ${enabled ? 'enabled' : 'disabled'}`);
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!isDev) registerAppProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
