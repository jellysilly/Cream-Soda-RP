#!/usr/bin/env node
/**
 * Applies Cream Soda's native bits to the generated android/ project. Safe to run
 * after every `cap add` / `cap sync`: each change is skipped if already present.
 *
 *  - AndroidManifest: cleartext HTTP to the local server, foreground service for
 *    «Run in background», notification permission, ML Kit QR scanner module.
 *  - MainActivity: window.CreamSodaAndroid for saving exported files.
 *  - Notification icon.
 *  - app/cream-soda.gradle: version from package.json, one APK per ABI,
 *    release signing from keystore.properties.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const android = path.resolve(here, '..');
const appDir = path.join(android, 'android', 'app', 'src', 'main');
const config = JSON.parse(fs.readFileSync(path.join(android, 'capacitor.config.json'), 'utf8'));

if (!fs.existsSync(appDir)) {
  console.error('No android/ folder: run npx cap add android first');
  process.exit(1);
}

// ───────── AndroidManifest.xml ─────────

const manifestPath = path.join(appDir, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');

const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
];
for (const p of PERMISSIONS) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}

// Don't recreate the activity (and reload the interface) when the system font size changes.
manifest = manifest.replace(/android:configChanges="([^"]*)"/, (m, list) =>
  list.includes('fontScale') ? m : `android:configChanges="${list}|fontScale|fontWeightAdjustment"`,
);

if (!manifest.includes('android:usesCleartextTraffic')) {
  manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
}

const APP_ENTRIES = [
  [
    'NotificationActionBroadcastReceiver',
    '<receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />',
  ],
  [
    'AndroidForegroundService',
    `<service
            android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService"
            android:foregroundServiceType="specialUse"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Local HTTP server for the app's own interface (127.0.0.1)" />
        </service>`,
  ],
  ['com.google.mlkit.vision.DEPENDENCIES', '<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />'],
];
for (const [marker, xml] of APP_ENTRIES) {
  if (!manifest.includes(marker)) manifest = manifest.replace('</application>', `    ${xml}\n    </application>`);
}
fs.writeFileSync(manifestPath, manifest);

// ───────── MainActivity ─────────

const pkgPath = config.appId.split('.');
const activityDir = path.join(appDir, 'java', ...pkgPath);
fs.mkdirSync(activityDir, { recursive: true });
const activity = fs.readFileSync(path.join(android, 'native', 'MainActivity.java'), 'utf8').replace(/^package [\w.]+;/m, `package ${config.appId};`);
fs.writeFileSync(path.join(activityDir, 'MainActivity.java'), activity);

// ───────── Resources ─────────

const drawable = path.join(appDir, 'res', 'drawable');
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(path.join(android, 'native', 'ic_stat_soda.xml'), path.join(drawable, 'ic_stat_soda.xml'));

// ───────── Gradle ─────────

const appGradleDir = path.join(android, 'android', 'app');
fs.copyFileSync(path.join(android, 'native', 'cream-soda.gradle'), path.join(appGradleDir, 'cream-soda.gradle'));
const buildGradlePath = path.join(appGradleDir, 'build.gradle');
const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
if (!buildGradle.includes("apply from: 'cream-soda.gradle'")) {
  fs.writeFileSync(buildGradlePath, `${buildGradle.trimEnd()}\n\napply from: 'cream-soda.gradle'\n`);
}

console.log('[android] native settings applied');
