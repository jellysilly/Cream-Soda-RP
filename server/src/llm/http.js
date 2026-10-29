import { fetch, Agent, ProxyAgent, buildConnector } from 'undici';
import { SocksClient } from 'socks';

const dispatchers = new Map();

/** undici Agent whose connections go through a SOCKS4/5 proxy (TLS is set up on top). */
function socksAgent(proxy) {
  const tlsConnect = buildConnector({});
  return new Agent({
    connect: async (options, callback) => {
      const { protocol, hostname, port } = options;
      try {
        const { socket } = await SocksClient.createConnection({
          command: 'connect',
          proxy,
          timeout: 15000,
          destination: { host: hostname, port: port ? Number(port) : protocol === 'http:' ? 80 : 443 },
        });
        if (protocol !== 'https:') return callback(null, socket.setNoDelay());
        tlsConnect({ ...options, httpSocket: socket }, callback);
      } catch (err) {
        callback(err, null);
      }
    },
  });
}

function dispatcherFor(proxy) {
  const url = String(proxy || '').trim();
  if (!url) return undefined;
  if (dispatchers.has(url)) return dispatchers.get(url);
  let dispatcher;
  const parsed = new URL(url);
  if (parsed.protocol.startsWith('socks')) {
    dispatcher = socksAgent({
      type: parsed.protocol === 'socks4:' ? 4 : 5,
      host: parsed.hostname,
      port: Number(parsed.port) || 1080,
      userId: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    });
  } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    dispatcher = new ProxyAgent(url);
  } else {
    throw new Error(`Unsupported proxy: ${parsed.protocol}`);
  }
  dispatchers.set(url, dispatcher);
  return dispatcher;
}

/**
 * fetch() with proxy support and a timeout that combines with the caller's abort
 * signal (the browser closing the stream aborts the upstream request too).
 */
export async function upstreamFetch(url, { method = 'GET', headers = {}, body, signal, timeoutMs = 120000, proxy } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error('timeout')), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
      signal: controller.signal,
      dispatcher: dispatcherFor(proxy),
    });
    // The timeout guards connection + first byte; streaming responses may run longer.
    if (timer) clearTimeout(timer);
    return res;
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (controller.signal.reason?.message === 'timeout') {
      const e = new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s: the server did not answer`);
      e.status = 504;
      throw e;
    }
    if (signal?.aborted) {
      const e = new Error('Request cancelled');
      e.status = 499;
      e.aborted = true;
      throw e;
    }
    const e = new Error(`Could not connect: ${err.cause?.message || err.message}`);
    e.status = 502;
    throw e;
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
  }
}

export async function readErrorBody(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  let message = text;
  try {
    const json = JSON.parse(text);
    message =
      json?.error?.message ||
      json?.error?.metadata?.raw ||
      (typeof json?.error === 'string' ? json.error : '') ||
      json?.message ||
      json?.detail ||
      text;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {
    /* plain text */
  }
  const e = new Error(`${res.status} ${res.statusText}: ${String(message).slice(0, 800)}`);
  e.status = res.status;
  return e;
}

/** Iterates SSE events ({event, data}) from a fetch Response body. */
export async function* sseEvents(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const ev = parseSseBlock(raw);
      if (ev) yield ev;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    const ev = parseSseBlock(buffer);
    if (ev) yield ev;
  }
}

function parseSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  return { event, data: data.join('\n') };
}

/** Iterates newline-delimited JSON objects from a Response body (Ollama). */
export async function* ndjson(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield JSON.parse(line);
    }
  }
  const rest = (buffer + decoder.decode()).trim();
  if (rest) yield JSON.parse(rest);
}

export function joinUrl(base, suffix) {
  return `${String(base || '').replace(/\/+$/, '')}/${String(suffix).replace(/^\/+/, '')}`;
}

/** Deep-merges user "extra body" JSON into the provider request. */
export function mergeDeep(target, extra) {
  if (!extra || typeof extra !== 'object') return target;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      mergeDeep(target[k], v);
    } else if (v === null) {
      delete target[k];
    } else {
      target[k] = v;
    }
  }
  return target;
}

export function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))));
}
