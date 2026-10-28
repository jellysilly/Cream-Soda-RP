import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, '..', '..');
export const WEB_DIST = path.join(ROOT_DIR, 'web', 'dist');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
export const VERSION = pkg.version;

// Unicode property escapes need ICU, which nodejs-mobile (Android) is built without;
// there we fall back to stripping characters that are unsafe in file names.
const UNSAFE_NAME_CHARS = (() => {
  try {
    return new RegExp('[^\\p{L}\\p{N}_\\- ]+', 'gu');
  } catch {
    return /[\x00-\x1f<>:"/\\|?*.%]+/g;
  }
})();

/** Profile names become directory names, so keep them filesystem-safe. */
export function sanitizeProfileName(name) {
  const clean = String(name || '')
    .trim()
    .replace(UNSAFE_NAME_CHARS, '')
    .slice(0, 48);
  return clean || 'default';
}

/**
 * Resolves every directory the server writes to.
 * Layout:
 *   <dataRoot>/profiles/<profile>/...   user data (characters, chats, settings)
 *   <dataRoot>/extensions/<name>/       installed third-party extensions
 *   <dataRoot>/backups/<profile>/       zip backups
 *   <dataRoot>/logs/                    server logs
 */
export function resolvePaths(dataRoot, profile) {
  const root = path.resolve(dataRoot);
  const profileName = sanitizeProfileName(profile);
  const profileDir = path.join(root, 'profiles', profileName);
  return {
    root,
    profile: profileName,
    profileDir,
    filesDir: path.join(profileDir, 'files'),
    chatsDir: path.join(profileDir, 'chats'),
    extensionsDir: path.join(root, 'extensions'),
    backupsDir: path.join(root, 'backups', profileName),
    logsDir: path.join(root, 'logs'),
    keyFile: path.join(root, '.cs-key'),
    lanTokenFile: path.join(root, '.cs-lan-token'),
    secretsFile: path.join(profileDir, 'secrets.json'),
  };
}

export function listProfiles(dataRoot) {
  const dir = path.join(path.resolve(dataRoot), 'profiles');
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export function defaultDataRoot() {
  if (process.env.CREAM_SODA_DATA) return process.env.CREAM_SODA_DATA;
  return path.join(ROOT_DIR, 'data');
}
