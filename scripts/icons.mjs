#!/usr/bin/env node
/**
 * Renders assets/brand/cream-soda-icon.svg into the PNG icons used by the launchers
 * (icon-1024.png, icon-512.png, icon-192.png), the web app (web/public) and the
 * Android icon/splash sources (launcher/android/resources).
 * Needs Playwright with Chromium: npx playwright install chromium.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets', 'brand');
const svg = fs.readFileSync(path.join(brand, 'cream-soda-icon.svg'), 'utf8');

let chromium;
try {
  // CommonJS resolution also honours NODE_PATH, so a global Playwright works too.
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright is needed: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [1024, 512, 192]) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace(/width="\d+"\s+height="\d+"/, `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  const file = path.join(brand, `icon-${size}.png`);
  await page.locator('svg').first().screenshot({ path: file, omitBackground: true });
  console.log(path.relative(root, file));
}
// Sources for `npx @capacitor/assets generate` in launcher/android (adaptive icon + splash).
const resources = path.join(root, 'launcher', 'android', 'resources');
fs.mkdirSync(resources, { recursive: true });
const scene = async (file, size, logoSize, background) => {
  await page.setViewportSize({ width: size, height: size });
  const logo = svg.replace(/width="\d+"\s+height="\d+"/, `width="${logoSize}" height="${logoSize}"`);
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">${logoSize ? logo : ''}</body></html>`,
  );
  await page.screenshot({ path: path.join(resources, file), omitBackground: background === 'transparent' });
  console.log(path.relative(root, path.join(resources, file)));
};
await scene('icon-only.png', 1024, 760, '#FBE2EC');
await scene('icon-foreground.png', 1024, 600, 'transparent');
await scene('icon-background.png', 1024, 0, '#FBE2EC');
await scene('splash.png', 2732, 720, 'linear-gradient(180deg,#F5AEC8,#F8C6D8 40%,#FBE2EC 70%,#D3EBF8)');
await scene('splash-dark.png', 2732, 720, 'linear-gradient(180deg,#2A0E1E,#3A1228 60%,#1E2A3A)');

fs.copyFileSync(path.join(brand, 'icon-192.png'), path.join(root, 'web', 'public', 'icon-192.png'));
fs.copyFileSync(path.join(brand, 'icon-512.png'), path.join(root, 'web', 'public', 'icon-512.png'));
await browser.close();
