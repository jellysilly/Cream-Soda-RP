import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/** Collections the client may read and write through the generic REST API. */
export const COLLECTIONS = new Set([
  'characters',
  'personas',
  'worlds',
  'presets',
  'instruct',
  'regex',
  'themes',
  'connections',
  'plots',
  'groups',
  'quickreplies',
]);

/** Single JSON documents (settings and similar). */
export const DOCS = new Set(['settings', 'imagegen', 'extensions-state']);

export const UPLOAD_KINDS = new Set(['avatars', 'backgrounds', 'images', 'attachments', 'sprites']);

const ID_RE = /^[A-Za-z0-9_\-.]{1,96}$/;

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id) && id !== '.' && id !== '..';
}

export function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

/** Writes JSON through a temp file + rename so a crash never leaves half a file. */
export async function writeJsonAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 1), 'utf8');
  await fsp.rename(tmp, file);
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    if (err instanceof SyntaxError) {
      console.warn(`[storage] повреждённый JSON: ${file}`);
      return fallback;
    }
    throw err;
  }
}

/** Serialises writes per file so concurrent saves can't interleave. */
const writeQueues = new Map();
export function queueWrite(file, data) {
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeJsonAtomic(file, data));
  writeQueues.set(file, next);
  next.finally(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  });
  return next;
}

export class Storage {
  constructor(paths) {
    this.paths = paths;
    this.chatMetaCache = new Map();
  }

  async init() {
    const p = this.paths;
    await Promise.all([
      ensureDir(p.profileDir),
      ensureDir(p.filesDir),
      ensureDir(p.chatsDir),
      ensureDir(p.extensionsDir),
      ensureDir(p.backupsDir),
      ensureDir(p.logsDir),
      ...[...COLLECTIONS].map((c) => ensureDir(path.join(p.profileDir, c))),
      ...[...UPLOAD_KINDS].map((k) => ensureDir(path.join(p.filesDir, k))),
    ]);
  }

  collectionDir(name) {
    if (!COLLECTIONS.has(name)) throw httpError(404, `Неизвестная коллекция: ${name}`);
    return path.join(this.paths.profileDir, name);
  }

  async list(name) {
    const dir = this.collectionDir(name);
    let files = [];
    try {
      files = await fsp.readdir(dir);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const items = await Promise.all(
      files.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f))),
    );
    return items.filter(Boolean);
  }

  async get(name, id) {
    if (!isValidId(id)) throw httpError(400, 'Некорректный id');
    const item = await readJson(path.join(this.collectionDir(name), `${id}.json`));
    if (!item) throw httpError(404, 'Не найдено');
    return item;
  }

  async put(name, id, data) {
    if (!isValidId(id)) throw httpError(400, 'Некорректный id');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Ожидался объект');
    const item = { ...data, id };
    await queueWrite(path.join(this.collectionDir(name), `${id}.json`), item);
    return item;
  }

  async remove(name, id) {
    if (!isValidId(id)) throw httpError(400, 'Некорректный id');
    await fsp.rm(path.join(this.collectionDir(name), `${id}.json`), { force: true });
  }

  docFile(name) {
    if (!DOCS.has(name)) throw httpError(404, `Неизвестный документ: ${name}`);
    return path.join(this.paths.profileDir, `${name}.json`);
  }

  async getDoc(name) {
    return (await readJson(this.docFile(name), {})) || {};
  }

  async putDoc(name, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Ожидался объект');
    await queueWrite(this.docFile(name), data);
    return data;
  }

  // ───────── Chats ─────────
  // Chats live in chats/<ownerType>_<ownerId>/<chatId>.json. The owner key keeps
  // a character's chats together so they can be listed (and deleted) as a unit.

  ownerDir(ownerType, ownerId) {
    if (!['character', 'group'].includes(ownerType) || !isValidId(ownerId)) {
      throw httpError(400, 'Некорректный владелец чата');
    }
    return path.join(this.paths.chatsDir, `${ownerType}_${ownerId}`);
  }

  async findChatFile(chatId) {
    if (!isValidId(chatId)) throw httpError(400, 'Некорректный id чата');
    let owners = [];
    try {
      owners = await fsp.readdir(this.paths.chatsDir);
    } catch {
      return null;
    }
    for (const owner of owners) {
      const file = path.join(this.paths.chatsDir, owner, `${chatId}.json`);
      if (fs.existsSync(file)) return file;
    }
    return null;
  }

  async listChats(ownerType, ownerId) {
    const dir = this.ownerDir(ownerType, ownerId);
    let files = [];
    try {
      files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const metas = await Promise.all(files.map((f) => this.chatMeta(path.join(dir, f))));
    return metas.filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async listAllChats() {
    let owners = [];
    try {
      owners = await fsp.readdir(this.paths.chatsDir);
    } catch {
      return [];
    }
    const out = [];
    for (const owner of owners) {
      const m = /^(character|group)_(.+)$/.exec(owner);
      if (!m) continue;
      out.push(...(await this.listChats(m[1], m[2])));
    }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async chatMeta(file) {
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return null;
    }
    const cached = this.chatMetaCache.get(file);
    if (cached && cached.mtime === stat.mtimeMs) return cached.meta;
    const chat = await readJson(file);
    if (!chat) return null;
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const last = messages[messages.length - 1];
    const meta = {
      id: chat.id,
      ownerType: chat.ownerType,
      ownerId: chat.ownerId,
      title: chat.title || 'Без названия',
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt || stat.mtimeMs,
      parentId: chat.parentId || null,
      branchPoint: chat.branchPoint ?? null,
      messageCount: messages.length,
      preview: last ? String(last.text || '').slice(0, 160) : '',
      size: stat.size,
    };
    this.chatMetaCache.set(file, { mtime: stat.mtimeMs, meta });
    return meta;
  }

  async getChat(chatId) {
    const file = await this.findChatFile(chatId);
    if (!file) throw httpError(404, 'Чат не найден');
    return readJson(file);
  }

  async putChat(chatId, chat) {
    if (!isValidId(chatId)) throw httpError(400, 'Некорректный id чата');
    if (!chat || !Array.isArray(chat.messages)) throw httpError(400, 'Ожидался чат с массивом messages');
    const dir = this.ownerDir(chat.ownerType, chat.ownerId);
    const file = path.join(dir, `${chatId}.json`);
    const existing = await this.findChatFile(chatId);
    if (existing && existing !== file) await fsp.rm(existing, { force: true });
    const data = { ...chat, id: chatId };
    await queueWrite(file, data);
    return { id: chatId, updatedAt: data.updatedAt };
  }

  async removeChat(chatId) {
    const file = await this.findChatFile(chatId);
    if (file) await fsp.rm(file, { force: true });
    this.chatMetaCache.delete(file);
  }

  async removeOwnerChats(ownerType, ownerId) {
    await fsp.rm(this.ownerDir(ownerType, ownerId), { recursive: true, force: true });
  }

  // ───────── Uploaded files ─────────

  async saveUpload(kind, buffer, originalName = '', subdir = '') {
    if (!UPLOAD_KINDS.has(kind)) throw httpError(400, 'Неизвестный тип файла');
    if (subdir && !isValidId(subdir)) throw httpError(400, 'Некорректная папка');
    const ext = safeExt(originalName, buffer);
    const name = `${newId()}${ext}`;
    const dir = path.join(this.paths.filesDir, kind, subdir);
    await ensureDir(dir);
    await fsp.writeFile(path.join(dir, name), buffer);
    const rel = [kind, subdir, name].filter(Boolean).join('/');
    return { url: `/files/${rel}`, name, size: buffer.length };
  }

  async listUploads(kind, subdir = '') {
    if (!UPLOAD_KINDS.has(kind)) throw httpError(400, 'Неизвестный тип файла');
    if (subdir && !isValidId(subdir)) throw httpError(400, 'Некорректная папка');
    const dir = path.join(this.paths.filesDir, kind, subdir);
    let names = [];
    try {
      names = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files = await Promise.all(
      names
        .filter((d) => d.isFile())
        .map(async (d) => {
          const st = await fsp.stat(path.join(dir, d.name));
          const rel = [kind, subdir, d.name].filter(Boolean).join('/');
          return { url: `/files/${rel}`, name: d.name, size: st.size, createdAt: st.mtimeMs };
        }),
    );
    return files.sort((a, b) => b.createdAt - a.createdAt);
  }

  resolveFileUrl(url) {
    const m = /^\/files\/(.+)$/.exec(String(url || '').split('?')[0]);
    if (!m) return null;
    const rel = decodeURIComponent(m[1]);
    const full = path.resolve(this.paths.filesDir, rel);
    if (!full.startsWith(path.resolve(this.paths.filesDir) + path.sep)) return null;
    return full;
  }

  async deleteUpload(url) {
    const full = this.resolveFileUrl(url);
    if (!full) throw httpError(400, 'Некорректный путь');
    await fsp.rm(full, { force: true });
  }
}

const MAGIC = [
  { ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.gif', bytes: [0x47, 0x49, 0x46] },
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: (b) => b.slice(8, 12).toString() === 'WEBP' },
];

const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.txt', '.md', '.json', '.jsonl', '.pdf', '.mp3', '.wav', '.ogg', '.mp4', '.webm', '.csv', '.html',
]);

function safeExt(name, buffer) {
  for (const m of MAGIC) {
    if (m.bytes.every((b, i) => buffer[i] === b) && (!m.extra || m.extra(buffer))) return m.ext;
  }
  if (buffer.slice(4, 12).toString() === 'ftypavif') return '.avif';
  const ext = path.extname(String(name || '')).toLowerCase();
  // An image extension without matching magic bytes is not trusted as an image.
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'].includes(ext)) return '.bin';
  if (ALLOWED_EXT.has(ext)) return ext === '.svg' || ext === '.html' ? '.txt' : ext;
  return '.bin';
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
