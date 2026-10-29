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
  console.log('[plugins] capacitor-nodejs is not installed, skipping');
  process.exit(0);
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// Every fixed copy starts with this line, so an earlier version of the fix is recognised too.
const isOurCopy = (file) => fs.readFileSync(file, 'utf8').includes(`Modified copy of ${path.basename(file)} from capacitor-nodejs ${SUPPORTED_VERSION}`);
const version = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).version;

let failed = false;
for (const [name, originalSha] of Object.entries(FILES)) {
  const target = path.join(javaDir, name);
  const fixed = path.join(android, 'native', 'capacitor-nodejs', name);
  const current = sha(target);
  if (current === sha(fixed)) continue;
  if (version === SUPPORTED_VERSION && (current === originalSha || isOurCopy(target))) {
    fs.copyFileSync(fixed, target);
    console.log(`[plugins] capacitor-nodejs: ${name} replaced with the fixed copy`);
  } else {
    console.error(
      `[plugins] capacitor-nodejs ${version}: ${name} differs from the one the fix was written for (${SUPPORTED_VERSION}).\n` +
        `          Compare it with native/capacitor-nodejs/${name}, port the fix and update the version and hash in scripts/patch-plugins.mjs.`,
    );
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('[plugins] capacitor-nodejs patched');
