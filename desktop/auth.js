// Powered by OnSpace.AI — Connexion Google via Supabase Auth (PKCE), pont
// « navigateur système + protocole personnalisé » propre à Electron.
// Reproduit apps/desktop/electron/auth.ts de 123Ecriture (même projet
// Supabase partagé, schéma dédié app_123creez) :
// 1. Le renderer demande l'ouverture de l'URL Google dans le navigateur PAR
//    DÉFAUT (auth:open-external) — un formulaire Google dans une fenêtre
//    Electron est bloqué par Google (disallowed_useragent).
// 2. Google → Supabase redirigent vers `app123creez://auth-callback?code=…`
//    ; l'OS relaie cette URL à l'app via le protocole enregistré ci-dessous
//    (le verrou mono-instance de main.js relaie ensuite au renderer).
// 3. Le renderer termine l'échange PKCE (exchangeCodeForSession).
// Un schéma d'URI ne peut pas commencer par un chiffre (RFC 3986) — d'où le
// préfixe `app` devant `123creez`.
// Fichier en CommonJS pur : chargé par le main process (pas de module ESM,
// pas d'annotations TypeScript).
const { app, ipcMain, shell } = require('electron');
const { spawnSync } = require('child_process');
const path = require('path');

const PROTOCOL = 'app123creez';

// Enregistre l'app comme gestionnaire du protocole `app123creez://`, avec le
// repli registre HKCU observé nécessaire sur Windows en build empaqueté
// (setAsDefaultProtocolClient seul a été silencieusement inefficace chez
// 123Ecriture v0.4.5 — aucune classe HKCU écrite, callback perdu).
function registerAuthProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, []);
  }
  if (process.platform === 'win32' && !app.isDefaultProtocolClient(PROTOCOL, process.execPath, [])) {
    try {
      const root = `HKCU\\Software\\Classes\\${PROTOCOL}`;
      const regAdd = (value, args) =>
        spawnSync('reg', ['add', value, ...args, '/f'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        });
      regAdd(root, ['/ve', '/t', 'REG_SZ', '/d', 'URL:123Creez Auth Callback']);
      regAdd(root, ['/v', 'URL Protocol', '/t', 'REG_SZ', '/d', '']);
      regAdd(`${root}\\shell\\open\\command`, ['/ve', '/t', 'REG_SZ', '/d', `"${process.execPath}" "%1"`]);
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, []);
      if (!app.isDefaultProtocolClient(PROTOCOL, process.execPath, [])) {
        console.error('[auth] enregistrement du protocole app123creez:// toujours absent après repli reg.');
      }
    } catch (error) {
      console.error('[auth] échec du repli d’enregistrement du protocole :', error);
    }
  }
}

// Windows/Linux : le protocole relance l'app (captée par le verrou
// mono-instance) avec l'URL quelque part dans argv.
function findProtocolUrlInArgv(argv) {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}

function registerAuthHandlers(getWindow) {
  ipcMain.handle('auth:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('URL de connexion invalide.');
    }
    await shell.openExternal(url);
  });

  // Démarrage À FROID par le lien : l'app fermée au retour OAuth est relancée
  // par Windows avec l'URL dans argv ; le renderer la tire via
  // 'auth:take-pending-url' (une seule fois — évite la course d'un push
  // envoyé avant que l'écouteur React ne soit posé).
  let pendingStartupUrl = findProtocolUrlInArgv(process.argv);
  ipcMain.handle('auth:take-pending-url', () => {
    const url = pendingStartupUrl;
    pendingStartupUrl = null;
    return url;
  });

  const deliverCallback = (url) => {
    const win = getWindow && getWindow();
    if (!win) return;
    // Rendre le focus à l'app une fois le callback reçu (le navigateur
    // système l'a pris pendant la connexion).
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('auth:callback', url);
  };

  app.on('open-url', (event, url) => {
    if (!url.startsWith(`${PROTOCOL}://`)) return;
    event.preventDefault();
    deliverCallback(url);
  });

  // La capture argv du second-instance vit dans main.js (verrou
  // mono-instance) — voir le handler 'second-instance' existant.
}

module.exports = { PROTOCOL, registerAuthProtocol, findProtocolUrlInArgv, registerAuthHandlers };
