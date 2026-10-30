import fs from 'node:fs';
import crypto from 'node:crypto';
import { readJson, queueWrite } from './storage.js';

const KEY_LISTS = '__keyLists';
const newKeyId = () => crypto.randomBytes(6).toString('hex');

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
      console.warn('[secrets] could not decrypt the keys: the data may have been moved from another device');
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
    const v = (await this.all())[name];
    return typeof v === 'string' ? v : '';
  }

  /**
   * Sets the active key of a slot (`conn:<id>`, `imagegen`). With a key list the
   * active entry gets the new value (or the entry that already has it becomes
   * active); an empty value removes the slot and its list.
   */
  async set(name, value) {
    if (!value) return this.saveList(name, { active: '', rotate: false, keys: [] });
    const list = await this.keyList(name);
    const active = list.keys.find((k) => k.id === list.active);
    const same = list.keys.find((k) => k.value === String(value));
    if (same) list.active = same.id;
    else if (active) active.value = String(value);
    else {
      const id = newKeyId();
      list.keys.push({ id, label: '', value: String(value) });
      list.active = id;
    }
    await this.saveList(name, list);
  }

  // ───────── Several keys per slot ─────────
  // Stored inside the same encrypted map under KEY_LISTS; map[name] always holds
  // the active key, so everything that only needs «the key» keeps reading it.

  /** { active, rotate, keys: [{ id, label, value }] }; a lone old-style key becomes a one-entry list. */
  async keyList(name) {
    const map = await this.all();
    const saved = map[KEY_LISTS]?.[name];
    if (saved?.keys?.length) return structuredClone(saved);
    const value = typeof map[name] === 'string' ? map[name] : '';
    return value ? { active: 'k1', rotate: false, keys: [{ id: 'k1', label: '', value }] } : { active: '', rotate: false, keys: [] };
  }

  async saveList(name, list) {
    const map = { ...(await this.all()) };
    const lists = { ...(map[KEY_LISTS] || {}) };
    const keys = (list.keys || []).filter((k) => k.value);
    if (!keys.length) {
      delete lists[name];
      delete map[name];
    } else {
      const active = keys.find((k) => k.id === list.active) || keys[0];
      lists[name] = { active: active.id, rotate: !!list.rotate, keys };
      map[name] = active.value;
    }
    if (Object.keys(lists).length) map[KEY_LISTS] = lists;
    else delete map[KEY_LISTS];
    await this.save(map);
  }

  /** The list without the key values, for the interface. */
  async publicList(name) {
    const list = await this.keyList(name);
    return { active: list.active, rotate: list.rotate, keys: list.keys.map(({ id, label, value }) => ({ id, label, masked: mask(value) })) };
  }

  async addKeys(name, values, label = '') {
    const list = await this.keyList(name);
    const known = new Set(list.keys.map((k) => k.value));
    const fresh = [...new Set(values.map((v) => String(v || '').trim()).filter((v) => v && !known.has(v)))];
    fresh.forEach((value, i) => list.keys.push({ id: newKeyId(), label: fresh.length > 1 && label ? `${label} ${i + 1}` : label, value }));
    if (!list.keys.some((k) => k.id === list.active)) list.active = list.keys[0]?.id || '';
    await this.saveList(name, list);
    return fresh.length;
  }

  async updateKey(name, id, patch) {
    const list = await this.keyList(name);
    const key = list.keys.find((k) => k.id === id);
    if (!key) throw Object.assign(new Error('Key not found'), { status: 404 });
    if (typeof patch.label === 'string') key.label = patch.label.slice(0, 80);
    if (patch.active) list.active = id;
    await this.saveList(name, list);
  }

  async removeKey(name, id) {
    const list = await this.keyList(name);
    const idx = list.keys.findIndex((k) => k.id === id);
    if (idx === -1) return;
    list.keys.splice(idx, 1);
    if (list.active === id) list.active = list.keys[Math.min(idx, list.keys.length - 1)]?.id || '';
    await this.saveList(name, list);
  }

  async revealKey(name, id) {
    return (await this.keyList(name)).keys.find((k) => k.id === id)?.value || '';
  }

  async setRotate(name, rotate) {
    const list = await this.keyList(name);
    list.rotate = !!rotate;
    await this.saveList(name, list);
  }

  /**
   * Makes the next key that is not in `failedValues` active (when rotation is on)
   * and returns its entry, or null when there is nothing left to try.
   */
  async rotate(name, failedValues) {
    const list = await this.keyList(name);
    if (!list.rotate || list.keys.length < 2) return null;
    const start = Math.max(0, list.keys.findIndex((k) => k.id === list.active));
    for (let i = 1; i < list.keys.length; i++) {
      const next = list.keys[(start + i) % list.keys.length];
      if (failedValues.has(next.value)) continue;
      list.active = next.id;
      await this.saveList(name, list);
      return next;
    }
    return null;
  }

  async status() {
    const map = await this.all();
    return Object.fromEntries(Object.entries(map).filter(([k, v]) => k !== KEY_LISTS && typeof v === 'string').map(([k, v]) => [k, mask(v)]));
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
