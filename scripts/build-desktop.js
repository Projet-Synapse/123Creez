#!/usr/bin/env node
// Powered by OnSpace.AI — desktop build pipeline
//
//   1. export the Expo web bundle          →  dist/
//   2. copy it into the Electron app root  →  desktop/renderer/
//   3. sync the version so the app, the installer and the update feed agree
//   4. hand off to electron-builder
//
// Usage:  node scripts/build-desktop.js [--publish] [--linux|--mac|--win]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RENDERER = path.join(ROOT, 'desktop', 'renderer');

const args = process.argv.slice(2);
const shouldPublish = args.includes('--publish');
const targets = args.filter((a) => ['--linux', '--mac', '--win'].includes(a));

function run(command, commandArgs, options = {}) {
  console.log(`\n▸ ${command} ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    cwd: ROOT,
    // Windows ships `npx.cmd`, not `npx`; execFileSync cannot spawn a .cmd
    // without going through the shell.
    shell: process.platform === 'win32',
    ...options,
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// ── 3 (first, so the exported bundle already knows its own version) ──────────
const rootPkg = readJson(path.join(ROOT, 'package.json'));
const appJsonPath = path.join(ROOT, 'app.json');
const appJson = readJson(appJsonPath);
const desktopPkgPath = path.join(ROOT, 'desktop', 'package.json');
const desktopPkg = readJson(desktopPkgPath);

const version = rootPkg.version;
if (!/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`package.json version "${version}" is not semver`);
}

if (appJson.expo.version !== version) {
  appJson.expo.version = version;
  writeJson(appJsonPath, appJson);
  console.log(`• app.json version → ${version}`);
}
if (desktopPkg.version !== version) {
  desktopPkg.version = version;
  writeJson(desktopPkgPath, desktopPkg);
  console.log(`• desktop/package.json version → ${version}`);
}

// ── 1 ───────────────────────────────────────────────────────────────────────
fs.rmSync(DIST, { recursive: true, force: true });
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
  env: { ...process.env, EXPO_PUBLIC_APP_VERSION: version },
});

// ── 2 ───────────────────────────────────────────────────────────────────────
fs.rmSync(RENDERER, { recursive: true, force: true });
fs.cpSync(DIST, RENDERER, { recursive: true });
console.log(`• renderer copied to ${path.relative(ROOT, RENDERER)}`);
relocateNodeModulesAssets(RENDERER);

// ── 2b ──────────────────────────────────────────────────────────────────────
// `expo export` range les polices d'icônes (@expo/vector-icons) et les images
// d'expo-router / react-navigation sous `assets/node_modules/...`. Or
// electron-builder écarte TOUT dossier `node_modules` qui n'est pas une
// dépendance de desktop/package.json, même sous `renderer/**/*` : dans la
// v1.0.20, app.asar n'a aucun `renderer/assets/` → les .ttf répondent 404 et
// toutes les icônes s'affichent en carrés vides. On renomme le dossier et on
// réécrit les références (uniquement dans la copie empaquetée ; dist/ et le
// build web restent intacts).
function relocateNodeModulesAssets(rendererDir) {
  const assetsDir = path.join(rendererDir, 'assets');
  if (!fs.existsSync(assetsDir)) return;
  // 1. Renomme chaque dossier `node_modules` (y compris ceux imbriqués sous
  //    .pnpm), du plus profond au moins profond.
  const dirs = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      collect(full);
      if (entry.name === 'node_modules') dirs.push(full);
    }
  };
  collect(assetsDir);
  for (const dir of dirs) fs.renameSync(dir, path.join(path.dirname(dir), '_nm'));
  if (dirs.length === 0) return;
  // 2. Réécrit les URL `/assets/…/node_modules/…` dans le bundle et le HTML.
  const URL_RE = /\/assets\/[^"'`\s)]*/g;
  let rewritten = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html|css|json)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf-8');
        const next = text.replace(URL_RE, (url) => url.split('/node_modules/').join('/_nm/'));
        if (next !== text) {
          fs.writeFileSync(full, next);
          rewritten++;
        }
      }
    }
  };
  walk(rendererDir);
  console.log(`• ${dirs.length} dossiers assets/**/node_modules → _nm (${rewritten} fichiers réécrits)`);
}

// ── 4 ───────────────────────────────────────────────────────────────────────
const builderArgs = [
  'electron-builder',
  '--config',
  'electron-builder.yml',
  ...(targets.length ? targets : []),
  shouldPublish ? '--publish=always' : '--publish=never',
];
run('npx', builderArgs);

console.log('\n✓ Installateurs disponibles dans release/');
