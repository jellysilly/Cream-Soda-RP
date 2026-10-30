import type { Chat, ChatSummary, ConnectionProfile, ExtensionInfo, ModelInfo, RequestLogItem, SystemInfo } from './types';
import { t } from './i18n';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof Uint8Array) {
    payload = body as BodyInit;
    headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', ...init });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(t('The Cream Soda server is not answering. Is it running?'), 0);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return res as unknown as T;
}

export interface Bootstrap {
  version: string;
  profile: string;
  profiles: string[];
  isLocal: boolean;
  collections: Record<string, any[]>;
  docs: Record<string, any>;
  secrets: Record<string, string>;
  extensions: ExtensionInfo[];
}

/** Saved keys of one slot (`conn:<id>`, `imagegen`); `masked` is the active one. */
export interface KeyList {
  active: string;
  rotate: boolean;
  keys: { id: string; label: string; masked: string }[];
  masked: string;
}

export const api = {
  bootstrap: () => request<Bootstrap>('GET', 'api/bootstrap'),

  list: <T>(collection: string) => request<T[]>('GET', `api/c/${collection}`),
  get: <T>(collection: string, id: string) => request<T>('GET', `api/c/${collection}/${encodeURIComponent(id)}`),
  put: <T>(collection: string, id: string, data: T) => request<T>('PUT', `api/c/${collection}/${encodeURIComponent(id)}`, data),
  remove: (collection: string, id: string, withChats = false) =>
    request('DELETE', `api/c/${collection}/${encodeURIComponent(id)}${withChats ? '?withChats=1' : ''}`),

  getDoc: <T>(name: string) => request<T>('GET', `api/doc/${name}`),
  putDoc: <T>(name: string, data: T) => request<T>('PUT', `api/doc/${name}`, data),

  listChats: (ownerType?: string, ownerId?: string) =>
    request<ChatSummary[]>('GET', ownerType ? `api/chats?ownerType=${ownerType}&ownerId=${encodeURIComponent(ownerId || '')}` : 'api/chats'),
  getChat: (id: string) => request<Chat>('GET', `api/chats/${encodeURIComponent(id)}`),
  putChat: (chat: Chat, keepalive = false) =>
    request<{ id: string }>('PUT', `api/chats/${encodeURIComponent(chat.id)}`, chat, keepalive ? { keepalive: true } : {}),
  removeChat: (id: string) => request('DELETE', `api/chats/${encodeURIComponent(id)}`),

  upload: (kind: 'avatars' | 'backgrounds' | 'images' | 'attachments' | 'sprites', file: Blob, name = '', dir = '') =>
    request<{ url: string; name: string; size: number }>(
      'POST',
      `api/files/${kind}?name=${encodeURIComponent(name || (file as File).name || 'file')}${dir ? `&dir=${encodeURIComponent(dir)}` : ''}`,
      file,
    ),
  listFiles: (kind: string, dir = '') =>
    request<{ url: string; name: string; size: number; createdAt: number }[]>('GET', `api/files/${kind}${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  deleteFile: (url: string) => request('DELETE', `api/files?url=${encodeURIComponent(url)}`),

  importUrl: async (url: string) => {
    const res = await request<Response>('POST', 'api/import/url', { url });
    const name = decodeURIComponent(res.headers.get('X-File-Name') || 'file');
    return new File([await res.blob()], name, { type: res.headers.get('content-type') || '' });
  },

  secrets: () => request<Record<string, string>>('GET', 'api/secrets'),
  setSecret: (name: string, value: string) => request<{ masked: string }>('PUT', `api/secrets/${encodeURIComponent(name)}`, { value }),
  revealSecret: (name: string) => request<{ value: string }>('POST', `api/secrets/${encodeURIComponent(name)}/reveal`, {}),
  keyList: (name: string) => request<KeyList>('GET', `api/secrets/${encodeURIComponent(name)}/keys`),
  addKeys: (name: string, value: string, label = '') => request<KeyList & { added: number }>('POST', `api/secrets/${encodeURIComponent(name)}/keys`, { value, label }),
  updateKey: (name: string, id: string, patch: { label?: string; active?: boolean }) =>
    request<KeyList>('PATCH', `api/secrets/${encodeURIComponent(name)}/keys/${encodeURIComponent(id)}`, patch),
  removeKey: (name: string, id: string) => request<KeyList>('DELETE', `api/secrets/${encodeURIComponent(name)}/keys/${encodeURIComponent(id)}`),
  revealKey: (name: string, id: string) => request<{ value: string }>('POST', `api/secrets/${encodeURIComponent(name)}/keys/${encodeURIComponent(id)}/reveal`, {}),
  setKeyRotation: (name: string, rotate: boolean) => request<KeyList>('PUT', `api/secrets/${encodeURIComponent(name)}/rotate`, { rotate }),

  models: (conn: Partial<ConnectionProfile> & { id?: string }, key?: string) =>
    request<ModelInfo[]>('POST', 'api/llm/models', { connection: conn, key }),
  test: (conn: Partial<ConnectionProfile>, key?: string) =>
    request<{ ok: boolean; latency: number; models?: number; error?: string }>('POST', 'api/llm/test', { connection: conn, key }),
  log: () => request<RequestLogItem[]>('GET', 'api/llm/log'),
  logItem: (id: string) => request<RequestLogItem>('GET', `api/llm/log/${id}`),

  generateImages: (body: { params: Record<string, unknown>; dir?: string; label?: string; config?: unknown }, signal?: AbortSignal) =>
    request<{ images: { url: string }[] }>('POST', 'api/images/generate', body, { signal }),
  testImages: (config?: unknown) => request<{ ok: boolean; latency: number; error?: string }>('POST', 'api/images/test', { config }),
  imageModels: (config?: unknown) => request<{ models: { id: string; name: string }[]; samplers: string[] }>('POST', 'api/images/models', { config }),

  extensions: () => request<ExtensionInfo[]>('GET', 'api/extensions'),
  installExtension: (url: string) => request<ExtensionInfo>('POST', 'api/extensions/install', { url }),
  updateExtension: (name: string) => request<{ output: string }>('POST', `api/extensions/${encodeURIComponent(name)}/update`, {}),
  removeExtension: (name: string) => request('DELETE', `api/extensions/${encodeURIComponent(name)}`),

  backupUrl: (keys: boolean) => `api/backup${keys ? '?keys=1' : ''}`,
  saveBackup: () => request<{ name: string }>('POST', 'api/backup/save', {}),
  backups: () => request<{ name: string; size: number; createdAt: number }[]>('GET', 'api/backups'),
  restore: (file: Blob) => request<{ restored: number }>('POST', 'api/backup/restore', file),

  system: () => request<SystemInfo>('GET', 'api/system/info'),
  setLan: (enabled: boolean) => request<{ enabled: boolean }>('POST', 'api/system/lan', { enabled }),
  logs: () => request<{ time: number; level: string; text: string }[]>('GET', 'api/system/logs'),
};

export interface StreamEvent {
  t: 'delta' | 'done' | 'error';
  text?: string;
  reasoning?: string;
  finish?: string;
  usage?: Record<string, number>;
  message?: string;
  status?: number;
}

/** POSTs a generation request and yields normalised SSE events from the server. */
export async function* streamGenerate(body: Record<string, unknown>, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch('api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    throw new ApiError(t('The Cream Soda server is not answering'), 0);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await res.json();
    yield { t: 'delta', text: j.text || '', reasoning: j.reasoning || '' };
    yield { t: 'done', finish: j.finish, usage: j.usage };
    return;
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            yield JSON.parse(line.slice(5).trim()) as StreamEvent;
          } catch {
            /* partial */
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    throw err;
  }
}

export async function generateOnce(body: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; reasoning: string; usage?: Record<string, number> }> {
  const res = await fetch('api/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  const j = await res.json();
  return { text: j.text || '', reasoning: j.reasoning || '', usage: j.usage };
}
