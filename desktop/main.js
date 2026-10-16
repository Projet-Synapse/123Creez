// Powered by OnSpace.AI — Electron main process (Linux / macOS / Windows)
//
// The renderer is the same Expo web bundle the browser build uses. In
// production it is served over a custom `app://` scheme rather than file://,
// because expo-router's client-side routing needs absolute paths and a real
// origin (localStorage, which holds the vault and settings, is per-origin).
const { app, BrowserWindow, ipcMain, shell, protocol, Notification, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
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

// Même garde-fou que 123Système : le « è » du nom d'app (productName
// « 123Créez » dans electron-builder.yml) finit dans le User-Agent, et la
// reconstitution des en-têtes par undici dans protocol.handle exige des
// ByteString (≤ 255) — le « è » re-décodé U+FFFD ferait échouer chaque
// requête de ressource du renderer (page blanche). ASCII dans l'UA
// seulement ; le nom accentué reste utilisé partout ailleurs.
app.userAgentFallback = String(app.userAgentFallback || '').replaceAll('123Créez', '123Creez');

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
  app.on('second-instance', (_event, argv) => {
    // Callback OAuth revenu alors que l'app est déjà ouverte : le protocole
    // custom relance une seconde instance avec l'URL dans argv.
    const url = findProtocolUrlInArgv(argv ?? []);
    if (url && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:callback', url);
    }
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

const MIME_TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

// Réponse construite à la main plutôt que net.fetch(file://) : sans en-tête
// explicite, Chromium mettait les réponses app:// en cache HTTP de façon
// heuristique — après un correctif du bundle, le renderer rechargeait
// l'ancien JS. « no-cache » impose la revalidation (fichiers locaux : quasi
// gratuit) tout en gardant le HTTP cache pour les recharges de session.
function fileResponse(file) {
  const data = fs.readFileSync(file);
  const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const file = resolveRendererFile(pathname);

    if (file) return fileResponse(file);

    // Unknown path: hand it to expo-router, which resolves it client-side.
    const fallback = path.join(RENDERER_DIR, 'index.html');
    if (fs.existsSync(fallback)) return fileResponse(fallback);
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
    // Charger la racine « / » et non « /index.html » : expo-router associe le
    // chemin d'URL à une route, et « /index.html » n'en est pas une → l'app
    // démarrait sur l'écran « Page Not Found » à chaque premier lancement.
    mainWindow.loadURL(`${APP_SCHEME}://local/`);
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

// ── Traqueur de mises à jour ────────────────────────────────────────────────
// Journal persistant de tout ce qui touche aux mises à jour (vérifications,
// disponibilités, téléchargements, installations, erreurs) + liste des
// releases GitHub consultable. Écrit dans userData/updates-history.json.
const RELEASES_API_URL = 'https://api.github.com/repos/Projet-Synapse/123Creez/releases?per_page=20';
const RELEASES_PAGE_URL = 'https://github.com/Projet-Synapse/123Creez/releases';
let updatesHistory = [];
let releasesCache = { at: 0, releases: [] };

try {
  updatesHistory = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'updates-history.json'), 'utf8'));
  if (!Array.isArray(updatesHistory)) updatesHistory = [];
} catch {
  updatesHistory = [];
}

function trackUpdate(kind, extra = {}) {
  const entry = { at: new Date().toISOString(), kind, appVersion: app.getVersion(), ...extra };
  updatesHistory.unshift(entry);
  if (updatesHistory.length > 200) updatesHistory.length = 200;
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'updates-history.json'), JSON.stringify(updatesHistory, null, 2));
  } catch (error) {
    log.warn('[updates] history write failed', error);
  }
  return entry;
}

async function fetchReleases() {
  // Cache d'une heure pour ne pas marteler l'API GitHub.
  if (Date.now() - releasesCache.at < 60 * 60 * 1000) return releasesCache.releases;
  try {
    const response = await net.fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': '123Creez-Desktop' },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const releases = await response.json();
    releasesCache = {
      at: Date.now(),
      releases: releases.map((r) => ({
        tag: r.tag_name,
        name: r.name,
        publishedAt: r.published_at,
        notes: typeof r.body === 'string' ? r.body : undefined,
        prerelease: r.prerelease,
      })),
    };
  } catch (error) {
    log.warn('[updates] releases fetch failed', error);
  }
  return releasesCache.releases;
}

function notifyUpdateAvailable(info) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: '123Créez — mise à jour disponible',
    body: `La version ${info.version} est disponible. Paramètres → Mises à jour pour l'installer.`,
    icon: path.join(__dirname, 'renderer', 'favicon.ico'),
  });
  notification.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    shell.openExternal(RELEASES_PAGE_URL);
  });
  notification.show();
}

// Vérification automatique silencieuse au démarrage ; une notification n'est
// levée que si une mise à jour est trouvée par CE chemin (jamais par la
// recherche manuelle de l'écran Réglages, qui a déjà son retour d'interface).
let silentCheckInFlight = false;

async function checkForUpdatesSilently() {
  if (isDev || silentCheckInFlight) return;
  silentCheckInFlight = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    log.info(`[updates] startup check: installed ${app.getVersion()}, latest ${latest}`);
    if (latest && latest !== app.getVersion()) notifyUpdateAvailable({ version: latest });
  } catch (error) {
    log.warn('[updates] startup check failed', error);
  } finally {
    silentCheckInFlight = false;
  }
}

autoUpdater.on('checking-for-update', () => {
  send({ type: 'checking' });
  trackUpdate('checking');
});
autoUpdater.on('update-available', (info) => {
  send({ type: 'available', version: info.version, releaseNotes: stringifyNotes(info.releaseNotes) });
  trackUpdate('available', { version: info.version });
});
autoUpdater.on('update-not-available', (info) => {
  send({ type: 'not-available', version: info.version });
  trackUpdate('not-available', { latestVersion: info.version });
});
autoUpdater.on('download-progress', (p) =>
  send({
    type: 'progress',
    percent: Math.round(p.percent),
    transferred: p.transferred,
    total: p.total,
  }),
);
autoUpdater.on('update-downloaded', (info) => {
  send({ type: 'downloaded', version: info.version });
  trackUpdate('downloaded', { version: info.version });
});
autoUpdater.on('error', (err) => {
  send({ type: 'error', message: String(err?.message ?? err) });
  trackUpdate('error', { message: String(err?.message ?? err) });
});

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

// Historique local + liste des releases GitHub (traqueur de mises à jour).
ipcMain.handle('updates:history', async () => {
  const releases = await fetchReleases();
  return {
    currentVersion: app.getVersion(),
    history: updatesHistory,
    releases,
    releasesUrl: RELEASES_PAGE_URL,
  };
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

// ── Dossier vault (miroir explorateur de fichiers) ─────────────────────────
// Le dossier choisi par l'utilisateur contient les exports PNG des toiles ;
// les images qu'on y dépose sont importées comme nouvelles toiles. Le chemin
// est persisté dans userData/vault-folder.json. Côté renderer :
// services/vaultFolderService.ts.
// Auth Google (protocole app123creez://) — voir desktop/auth.js.
const {
  PROTOCOL: AUTH_PROTOCOL,
  registerAuthProtocol,
  findProtocolUrlInArgv,
  registerAuthHandlers,
} = require('./auth');

const VAULT_FOLDER_CONFIG = () => path.join(app.getPath('userData'), 'vault-folder.json');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function readVaultFolderConfig() {
  try {
    return JSON.parse(fs.readFileSync(VAULT_FOLDER_CONFIG(), 'utf8'));
  } catch {
    return { path: null };
  }
}

function writeVaultFolderConfig(cfg) {
  fs.writeFileSync(VAULT_FOLDER_CONFIG(), JSON.stringify(cfg, null, 2));
}

let vaultFolderWatcher = null;

function startVaultFolderWatch(win) {
  if (vaultFolderWatcher) { vaultFolderWatcher.close(); vaultFolderWatcher = null; }
  const { path: folder } = readVaultFolderConfig();
  if (!folder || !fs.existsSync(folder)) return;
  try {
    vaultFolderWatcher = fs.watch(folder, (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return;
      // Laisser l'écriture du fichier se terminer avant d'en notifier.
      clearTimeout(startVaultFolderWatch._debounce);
      startVaultFolderWatch._debounce = setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('vault-folder:event', { type: eventType, filename });
        }
      }, 500);
    });
  } catch (error) {
    log.warn('[vault-folder] watch failed', error);
  }
}

ipcMain.handle('vault-folder:get', () => readVaultFolderConfig().path ?? null);

ipcMain.handle('vault-folder:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le dossier du vault',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  writeVaultFolderConfig({ path: result.filePaths[0] });
  startVaultFolderWatch(mainWindow);
  return result.filePaths[0];
});

ipcMain.handle('vault-folder:write-image', (_e, name, dataUrl) => {
  const { path: folder } = readVaultFolderConfig();
  if (!folder || !fs.existsSync(folder)) return { ok: false, error: 'Aucun dossier configuré' };
  try {
    const safe = String(name).replace(/[^a-zA-Z0-9_\-. ]+/g, '_');
    const base64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
    const full = path.join(folder, safe);
    fs.writeFileSync(full, Buffer.from(base64, 'base64'));
    return { ok: true, path: full };
  } catch (error) {
    log.error('[vault-folder] write failed', error);
    return { ok: false, error: String(error?.message ?? error) };
  }
});

ipcMain.handle('vault-folder:list-images', (_e, folderOverride) => {
  const { path: folder } = folderOverride ? { path: folderOverride } : readVaultFolderConfig();
  if (!folder || !fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map(f => {
      const full = path.join(folder, f);
      return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
    });
});

ipcMain.handle('vault-folder:read-image', (_e, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    log.error('[vault-folder] read failed', error);
    return null;
  }
});

ipcMain.handle('vault-folder:delete-image', (_e, filePath) => {
  const { path: folder } = readVaultFolderConfig();
  // Sécurité : uniquement à l'intérieur du dossier configuré.
  if (!folder || !path.resolve(String(filePath)).startsWith(path.resolve(folder))) {
    return { ok: false, error: 'Hors du dossier vault' };
  }
  try {
    fs.unlinkSync(String(filePath));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
});

ipcMain.on('vault-folder:watch', () => startVaultFolderWatch(mainWindow));

// ── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!isDev) registerAppProtocol();
  createWindow();

  // Traqueur : première vérification automatique 10 s après le démarrage,
  // puis toutes les 6 h tant que l'app reste ouverte.
  setTimeout(checkForUpdatesSilently, 10 * 1000);
  setInterval(checkForUpdatesSilently, 6 * 60 * 60 * 1000);

  // Dossier vault : surveillance si un chemin est déjà configuré.
  startVaultFolderWatch(mainWindow);

  // Auth Google : protocole app123creez:// + ponts IPC.
  registerAuthProtocol();
  registerAuthHandlers(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
