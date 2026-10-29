import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ensureDir, httpError } from './storage.js';

const SKIP = new Set(['secrets.json']);

async function walk(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile() && !e.name.endsWith('.tmp')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Full profile backup as a zip. API keys are excluded unless includeKeys is set,
 * in which case they are written in plain text to secrets.plain.json.
 */
export async function createBackup(paths, secrets, { includeKeys = false } = {}) {
  const files = {};
  for (const rel of await walk(paths.profileDir)) {
    if (SKIP.has(rel)) continue;
    const data = await fsp.readFile(path.join(paths.profileDir, rel));
    // Images are already compressed; storing them avoids burning CPU for nothing.
    const store = /\.(png|jpe?g|webp|gif|avif|mp3|mp4|webm|ogg)$/i.test(rel);
    files[rel] = store ? [new Uint8Array(data), { level: 0 }] : new Uint8Array(data);
  }
  if (includeKeys) files['secrets.plain.json'] = strToU8(JSON.stringify(await secrets.exportPlain(), null, 1));
  files['cream-soda-backup.json'] = strToU8(
    JSON.stringify({ app: 'cream-soda', format: 1, profile: paths.profile, createdAt: new Date().toISOString(), includeKeys }),
  );
  return Buffer.from(zipSync(files, { level: 6 }));
}

export async function restoreBackup(paths, secrets, buffer) {
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buffer));
  } catch {
    throw httpError(400, 'The file does not look like a zip archive');
  }
  if (!entries['cream-soda-backup.json']) throw httpError(400, 'This is not a Cream Soda backup');
  // Keep a safety copy of the current state before overwriting anything.
  await saveBackupFile(paths, await createBackup(paths, secrets), 'before-restore');
  const root = path.resolve(paths.profileDir);
  for (const [rel, data] of Object.entries(entries)) {
    if (rel.endsWith('/') || rel === 'cream-soda-backup.json') continue;
    if (rel === 'secrets.plain.json') {
      await secrets.importPlain(JSON.parse(strFromU8(data)));
      continue;
    }
    const target = path.resolve(root, rel);
    if (!target.startsWith(root + path.sep)) continue;
    await ensureDir(path.dirname(target));
    await fsp.writeFile(target, data);
  }
  return { restored: Object.keys(entries).length };
}

export async function saveBackupFile(paths, buffer, kind = 'manual') {
  await ensureDir(paths.backupsDir);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const name = `${kind}-${stamp}.zip`;
  await fsp.writeFile(path.join(paths.backupsDir, name), buffer);
  return name;
}

export async function listBackups(paths) {
  let names = [];
  try {
    names = await fsp.readdir(paths.backupsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.filter((n) => n.endsWith('.zip'))) {
    const st = await fsp.stat(path.join(paths.backupsDir, name));
    out.push({ name, size: st.size, createdAt: st.mtimeMs });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function backupPath(paths, name) {
  if (!/^[\w\-.]+\.zip$/.test(name)) throw httpError(400, 'Invalid backup name');
  const full = path.join(paths.backupsDir, name);
  if (!fs.existsSync(full)) throw httpError(404, 'Backup not found');
  return full;
}

/** Daily automatic backup; keeps the newest `keep` auto-backups. */
export async function runAutoBackup(paths, secrets, settings) {
  const cfg = settings?.backup || {};
  if (cfg.auto === false) return null;
  const keep = Math.max(1, Number(cfg.keep) || 7);
  const autos = (await listBackups(paths)).filter((b) => b.name.startsWith('auto-'));
  if (autos[0] && Date.now() - autos[0].createdAt < 23 * 3600 * 1000) return null;
  const name = await saveBackupFile(paths, await createBackup(paths, secrets, { includeKeys: false }), 'auto');
  const all = (await listBackups(paths)).filter((b) => b.name.startsWith('auto-'));
  for (const old of all.slice(keep)) await fsp.rm(path.join(paths.backupsDir, old.name), { force: true });
  return name;
}
