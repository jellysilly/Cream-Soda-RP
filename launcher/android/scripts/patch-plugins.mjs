#!/usr/bin/env node
/**
 * Replaces Java files of node_modules/capacitor-nodejs with the fixed copies from
 * native/capacitor-nodejs (the header of each file says what it changes).
 * Runs after `npm install` and before every build. Refuses to touch a plugin
 * version it was not written for, so an upgrade can't silently drop or break the fix.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const android = path.resolve(here, '..');
const plugin = path.join(android, 'node_modules', 'capacitor-nodejs');
const javaDir = path.join(plugin, 'android', 'src', 'main', 'java', 'net', 'hampoelz', 'capacitor', 'nodejs');

const SUPPORTED_VERSION = '1.0.0-beta.10';
// SHA-256 of the original files in that version.
const FILES = {
  'CapacitorNodeJS.java': '2c3f1f84a7424c8cb302fb2a36bac101ae7b4e760b2af15714b567ff80a2d445',
  'NodeProcess.java': '7caf2f2c2f60c1935824826bd31df7336b1471020779bd485c57ef149afa0830',
};

if (!fs.existsSync(javaDir)) {
  console.log('[plugins] capacitor-nodejs не установлен — пропускаю');
  process.exit(0);
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const version = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).version;

let failed = false;
for (const [name, originalSha] of Object.entries(FILES)) {
  const target = path.join(javaDir, name);
  const fixed = path.join(android, 'native', 'capacitor-nodejs', name);
  const current = sha(target);
  if (current === sha(fixed)) continue;
  if (version === SUPPORTED_VERSION && current === originalSha) {
    fs.copyFileSync(fixed, target);
    console.log(`[plugins] capacitor-nodejs: ${name} заменён исправленной копией`);
  } else {
    console.error(
      `[plugins] capacitor-nodejs ${version}: ${name} отличается от того, под который написано исправление (${SUPPORTED_VERSION}).\n` +
        `          Сравните его с native/capacitor-nodejs/${name}, перенесите исправление и обновите версию и хеш в scripts/patch-plugins.mjs.`,
    );
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('[plugins] capacitor-nodejs исправлен');
