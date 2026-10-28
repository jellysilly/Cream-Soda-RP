import fs from 'node:fs';
import crypto from 'node:crypto';
import { readJson, queueWrite } from './storage.js';

/**
 * API keys are encrypted at rest with AES-256-GCM. The data key lives next to the
 * data root (outside of profile folders), so a copied profile or a backup zip never
 * carries usable keys unless the user explicitly asks for them.
 */
export class Secrets {
  constructor(paths) {
    this.paths = paths;
    this.cache = null;
  }

  loadKey() {
    if (this.key) return this.key;
    try {
      this.key = Buffer.from(fs.readFileSync(this.paths.keyFile, 'utf8').trim(), 'base64');
      if (this.key.length !== 32) throw new Error('bad key length');
    } catch {
      this.key = crypto.randomBytes(32);
      fs.mkdirSync(this.paths.root, { recursive: true });
      fs.writeFileSync(this.paths.keyFile, this.key.toString('base64'), { mode: 0o600 });
    }
    return this.key;
  }

  async all() {
    if (this.cache) return this.cache;
    const raw = await readJson(this.paths.secretsFile, null);
    if (!raw) {
      this.cache = {};
      return this.cache;
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.loadKey(), Buffer.from(raw.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
      const plain = Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]);
      this.cache = JSON.parse(plain.toString('utf8'));
    } catch {
      console.warn('[secrets] не удалось расшифровать ключи — возможно, данные перенесены с другого устройства');
      this.cache = {};
    }
    return this.cache;
  }

  async save(map) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.loadKey(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(map), 'utf8'), cipher.final()]);
    this.cache = map;
    await queueWrite(this.paths.secretsFile, {
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    });
  }

  async get(name) {
    return (await this.all())[name] || '';
  }

  async set(name, value) {
    const map = { ...(await this.all()) };
    if (value) map[name] = String(value);
    else delete map[name];
    await this.save(map);
  }

  async status() {
    const map = await this.all();
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, mask(v)]));
  }

  /** Plain export used only when the user opts into including keys in a backup. */
  async exportPlain() {
    return { ...(await this.all()) };
  }

  async importPlain(map) {
    if (map && typeof map === 'object') await this.save({ ...(await this.all()), ...map });
  }
}

export function mask(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 3)}••••••••${v.slice(-4)}`;
}
