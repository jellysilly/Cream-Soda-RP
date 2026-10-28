#!/usr/bin/env node
/**
 * Replaces CapacitorNodeJS.java in node_modules/capacitor-nodejs with the fixed copy
 * from native/capacitor-nodejs (see the header of that file for what it fixes).
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
const target = path.join(plugin, 'android', 'src', 'main', 'java', 'net', 'hampoelz', 'capacitor', 'nodejs', 'CapacitorNodeJS.java');
const fixed = path.join(android, 'native', 'capacitor-nodejs', 'CapacitorNodeJS.java');

const SUPPORTED_VERSION = '1.0.0-beta.10';
const ORIGINAL_SHA256 = '2c3f1f84a7424c8cb302fb2a36bac101ae7b4e760b2af15714b567ff80a2d445';

if (!fs.existsSync(target)) {
  console.log('[plugins] capacitor-nodejs не установлен — пропускаю');
  process.exit(0);
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const version = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).version;
const current = sha(target);

if (current === sha(fixed)) {
  console.log('[plugins] capacitor-nodejs уже исправлен');
} else if (version === SUPPORTED_VERSION && current === ORIGINAL_SHA256) {
  fs.copyFileSync(fixed, target);
  console.log('[plugins] capacitor-nodejs: исправлен повторный запуск движка');
} else {
  console.error(
    `[plugins] capacitor-nodejs ${version}: CapacitorNodeJS.java отличается от того, под который написано исправление (${SUPPORTED_VERSION}).\n` +
      '          Сравните его с native/capacitor-nodejs/CapacitorNodeJS.java и перенесите исправление, затем обновите версию и хеш в scripts/patch-plugins.mjs.',
  );
  process.exit(1);
}
