import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../index.js';

let nextPort = 18400 + Math.floor(Math.random() * 1000);

/** Starts a server on a throwaway data folder. Call `stop()` when done. */
export async function startTestServer(options = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cream-soda-test-'));
  const server = await startServer({ port: nextPort, dataRoot, captureConsole: false, ...options });
  nextPort = server.port + 1;
  const base = server.url;
  return {
    server,
    base,
    dataRoot,
    /** fetch() against the server; JSON bodies are encoded automatically. */
    request(pathname, { body, headers = {}, ...rest } = {}) {
      const isJson = body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string';
      return fetch(base + pathname, {
        ...rest,
        headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: isJson ? JSON.stringify(body) : body,
      });
    },
    async stop() {
      await server.close();
      fs.rmSync(dataRoot, { recursive: true, force: true });
    },
  };
}

/**
 * Raw HTTP request, for headers fetch() won't let us set (Host).
 * Resolves with { status, body }.
 */
export function rawRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    // agent: false — a fresh connection every time, never a pooled keep-alive socket.
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Starts an HTTP server with the given handler on a free port. */
export function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ srv, port, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

/** Reads an SSE response from /api/llm/generate into an array of events. */
export async function readSse(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
