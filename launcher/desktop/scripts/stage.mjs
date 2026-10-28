#!/usr/bin/env node
/**
 * Assembles the app that electron-builder packs into launcher/desktop/stage:
 *
 *   stage/package.json     root deps + electron-builder config ("build")
 *   stage/server/          the HTTP server
 *   stage/web/dist/        the built interface
 *   stage/assets/brand/    logo and icons
 *   stage/launcher/        main.mjs, preload.cjs, ui/
 *   stage/build/icon.png   app icon (electron-builder converts it to .ico/.icns)
 *   stage/node_modules/    production dependencies only
 *
 * The web interface must be built first (npm run build in the project root).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const root = path.resolve(desktop, '..', '..');
const stage = path.join(desktop, 'stage');

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const launcherPkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));

function electronVersion() {
  try {
    const require = createRequire(path.join(desktop, 'package.json'));
    return require('electron/package.json').version;
  } catch {
    return launcherPkg.devDependencies.electron.replace(/^[^\d]*/, '');
  }
}

function copy(from, to) {
  fs.cpSync(path.join(root, from), path.join(stage, to ?? from), {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|test|\.git)([\\/]|$)/.test(path.relative(root, src)) && !src.endsWith('.map'),
  });
}

if (!fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))) {
  console.error('Нет web/dist — сначала соберите интерфейс: npm run build (в корне проекта)');
  process.exit(1);
}
const icon = path.join(root, 'assets', 'brand', 'icon-1024.png');
if (!fs.existsSync(icon)) {
  console.error('Нет assets/brand/icon-1024.png — выполните node scripts/icons.mjs в корне проекта');
  process.exit(1);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

copy('server');
copy('web/dist');
copy('assets/brand');
for (const f of ['main.mjs', 'preload.cjs', 'ui']) {
  fs.cpSync(path.join(desktop, f), path.join(stage, 'launcher', f), { recursive: true });
}
fs.mkdirSync(path.join(stage, 'build'));
fs.copyFileSync(icon, path.join(stage, 'build', 'icon.png'));

const pkg = {
  name: 'cream-soda',
  productName: 'Cream Soda',
  version: rootPkg.version,
  description: launcherPkg.description,
  author: launcherPkg.author,
  license: rootPkg.license,
  repository: 'github:jellysilly/Cream-Soda-RP',
  private: true,
  type: 'module',
  main: 'launcher/main.mjs',
  dependencies: rootPkg.dependencies,
  build: {
    appId: 'rp.creamsoda.desktop',
    productName: 'Cream Soda',
    electronVersion: electronVersion(),
    npmRebuild: false,
    directories: { output: '../dist', buildResources: 'build' },
    files: ['**/*', '!build/**'],
    win: { target: ['nsis', 'portable'] },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      shortcutName: 'Cream Soda',
      artifactName: 'Cream-Soda-Setup-${version}.${ext}',
    },
    portable: { artifactName: 'Cream-Soda-Portable-${version}.${ext}' },
    mac: { target: ['dmg', 'zip'], category: 'public.app-category.entertainment', artifactName: 'Cream-Soda-${version}-mac-${arch}.${ext}' },
    linux: {
      target: ['AppImage', 'tar.gz'],
      category: 'Game',
      artifactName: 'Cream-Soda-${version}-${arch}.${ext}',
    },
  },
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log('[stage] ставлю зависимости сервера…');
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock', { cwd: stage, stdio: 'inherit' });
console.log(`[stage] готово: ${path.relative(root, stage)} (Electron ${pkg.build.electronVersion})`);
