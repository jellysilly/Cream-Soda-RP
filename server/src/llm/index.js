import * as openai from './openai.js';
import * as anthropic from './anthropic.js';
import * as google from './google.js';
import * as textcompletion from './textcompletion.js';
import * as ollama from './ollama.js';
import { upstreamFetch, readErrorBody } from './http.js';
import { newId } from '../storage.js';

const ADAPTERS = {
  openai,
  openrouter: openai,
  custom: openai,
  anthropic,
  google,
  textcompletion,
  ollama,
};

export const API_TYPES = Object.keys(ADAPTERS);

export function adapterFor(api) {
  const a = ADAPTERS[api];
  if (!a) {
    const e = new Error(`Неизвестный тип API: ${api}`);
    e.status = 400;
    throw e;
  }
  return a;
}

/** Ring buffer of recent requests, shown in Settings → «Журнал запросов». */
export class RequestLog {
  constructor(limit = 150) {
    this.limit = limit;
    this.items = [];
  }

  start(entry) {
    const item = { id: newId(), time: Date.now(), status: 0, ...entry };
    this.items.unshift(item);
    if (this.items.length > this.limit) this.items.length = this.limit;
    return item;
  }

  list() {
    return this.items.map(({ request, response, ...rest }) => rest);
  }

  get(id) {
    return this.items.find((i) => i.id === id) || null;
  }
}

function connectionTimeout(conn) {
  const s = Number(conn.timeout);
  return Number.isFinite(s) && s > 0 ? s * 1000 : 120000;
}

function extraHeaders(conn) {
  const out = {};
  for (const h of conn.headers || []) {
    const name = String(h?.name || '').trim();
    if (name && /^[A-Za-z0-9\-_]+$/.test(name)) out[name] = String(h.value ?? '');
  }
  return out;
}

function parseExtraBody(conn) {
  const raw = String(conn.extraBody || '').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    const e = new Error('Поле «Добавить в тело запроса» содержит некорректный JSON');
    e.status = 400;
    throw e;
  }
}

function redact(body) {
  const clone = JSON.parse(JSON.stringify(body ?? null));
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'data' && typeof v === 'string' && v.length > 200) node[k] = `[base64 · ${v.length} симв.]`;
      else if (k === 'url' && typeof v === 'string' && v.startsWith('data:') && v.length > 200) node[k] = `[data-url · ${v.length} симв.]`;
      else walk(v);
    }
  };
  walk(clone);
  return clone;
}

/**
 * Runs one generation against the connection profile and streams normalised events
 * to the browser as SSE: {t:'delta', text, reasoning} … {t:'done', finish, usage}.
 */
export async function handleGenerate({ conn, key, body, res, signal, log }) {
  const adapter = adapterFor(conn.api);
  const req = {
    mode: body.mode === 'text' ? 'text' : 'chat',
    messages: body.messages,
    prompt: body.prompt,
    params: body.params || {},
    stream: body.stream !== false,
    model: body.model,
    extraBody: parseExtraBody(conn),
  };
  if (conn.api === 'anthropic' || conn.api === 'google') req.mode = 'chat';
  if (!req.model && !conn.model && !['textcompletion'].includes(conn.api)) {
    const e = new Error('В профиле подключения не выбрана модель');
    e.status = 400;
    throw e;
  }

  const built = adapter.buildRequest(conn, key, req);
  const headers = { ...built.headers, ...extraHeaders(conn) };
  const entry = log.start({
    label: body.label || 'Запрос',
    api: conn.api,
    model: req.model || conn.model || '',
    profile: conn.name,
    url: built.url,
    request: redact(built.body),
  });
  const started = Date.now();

  let upstream;
  try {
    upstream = await upstreamFetch(built.url, {
      method: 'POST',
      headers,
      body: built.body,
      signal,
      timeoutMs: connectionTimeout(conn),
      proxy: conn.proxy,
    });
  } catch (err) {
    entry.status = err.status || 502;
    entry.error = err.message;
    entry.duration = Date.now() - started;
    throw err;
  }
  if (!upstream.ok) {
    const err = await readErrorBody(upstream);
    entry.status = upstream.status;
    entry.error = err.message;
    entry.duration = Date.now() - started;
    throw err;
  }
  entry.status = upstream.status;

  if (!req.stream) {
    const json = await upstream.json();
    const out = adapter.parseResponse(json, conn);
    entry.duration = Date.now() - started;
    entry.response = (out.text || '').slice(0, 4000);
    entry.usage = out.usage;
    res.json(out);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  let text = '';
  let finish = '';
  let usage;
  const contentType = upstream.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json') && conn.api !== 'ollama') {
      // Backend ignored stream:true and answered in one piece.
      const out = adapter.parseResponse(await upstream.json(), conn);
      text = out.text || '';
      send({ t: 'delta', text, reasoning: out.reasoning || '' });
      finish = out.finish;
      usage = out.usage;
    } else {
      for await (const ev of adapter.parseStream(upstream, conn)) {
        if (ev.text || ev.reasoning) {
          text += ev.text || '';
          send({ t: 'delta', text: ev.text || '', reasoning: ev.reasoning || '' });
        }
        if (ev.finish) finish = ev.finish;
        if (ev.usage) usage = { ...(usage || {}), ...ev.usage };
      }
    }
    send({ t: 'done', finish: finish || 'stop', usage });
  } catch (err) {
    if (!signal?.aborted) {
      entry.error = err.message;
      send({ t: 'error', message: err.message, status: err.status || 500 });
    }
  } finally {
    entry.duration = Date.now() - started;
    entry.response = text.slice(0, 4000);
    entry.usage = usage;
    entry.finish = finish;
    if (signal?.aborted) entry.aborted = true;
    res.end();
  }
}

export async function listModels(conn, key) {
  const adapter = adapterFor(conn.api);
  return adapter.listModels(conn, key, {
    timeoutMs: Math.min(connectionTimeout(conn), 30000),
    proxy: conn.proxy,
  });
}

export async function testConnection(conn, key) {
  const started = Date.now();
  try {
    const models = await listModels(conn, key);
    return { ok: true, latency: Date.now() - started, models: models.length };
  } catch (err) {
    return { ok: false, latency: Date.now() - started, error: err.message };
  }
}

export { upstreamFetch };
