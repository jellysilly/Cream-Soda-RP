#!/usr/bin/env node
/**
 * Puts the Node.js project that runs on the phone into www/nodejs (capacitor-nodejs
 * looks for it inside the Capacitor webDir):
 *
 *   www/nodejs/package.json   main: main.cjs + server dependencies
 *   www/nodejs/main.cjs       bridge between the launcher screen and the server
 *   www/nodejs/server/        the HTTP server
 *   www/nodejs/web/dist/      the built interface
 *   www/nodejs/assets/brand/  logo
 *   www/nodejs/node_modules/  production dependencies only
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const android = path.resolve(here, '..');
const root = path.resolve(android, '..', '..');
const out = path.join(android, 'www', 'nodejs');

if (!fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))) {
  console.error('Нет web/dist — сначала соберите интерфейс: npm run build (в корне проекта)');
  process.exit(1);
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const skip = (src) => !/[\\/](node_modules|test|\.git)([\\/]|$)/.test(path.relative(root, src)) && !src.endsWith('.map');
for (const dir of ['server', 'web/dist', 'assets/brand']) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true, filter: skip });
}
fs.copyFileSync(path.join(android, 'node', 'main.cjs'), path.join(out, 'main.cjs'));

const pkg = {
  name: 'cream-soda-phone',
  version: rootPkg.version,
  private: true,
  type: 'module',
  main: 'main.cjs',
  dependencies: rootPkg.dependencies,
};
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log('[android] ставлю зависимости сервера…');
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund --no-package-lock', { cwd: out, stdio: 'inherit' });

// Fewer files unpack faster on the first start: drop docs, typings and tests.
let removed = 0;
(function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(test|tests|__tests__|docs?|example|examples|\.github)$/i.test(e.name)) {
        fs.rmSync(p, { recursive: true, force: true });
        removed++;
      } else prune(p);
    } else if (/\.(md|markdown|d\.ts|map|ts)$/i.test(e.name) || /^(changelog|history|authors|contributors)(\..*)?$/i.test(e.name)) {
      fs.rmSync(p);
      removed++;
    }
  }
})(path.join(out, 'node_modules'));

console.log(`[android] www/nodejs готов (убрано лишних файлов: ${removed})`);
