import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startTestServer, listen, readSse } from './helpers.js';

let t;
let upstream;
const seen = [];

// An OpenAI-compatible backend that streams «При» «вет» and checks the key.
before(async () => {
  t = await startTestServer();
  upstream = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (req.headers.authorization !== 'Bearer sk-test') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
      }
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'soda-1' }, { id: 'soda-2' }] }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const piece of ['При', 'вет']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
});
after(async () => {
  await upstream.close();
  await t.stop();
});

const connection = (extra = {}) => ({ id: 'mock', name: 'Mock', api: 'custom', baseUrl: `${upstream.url}/v1`, model: 'soda-1', ...extra });

test('streams a chat completion as normalised SSE', async () => {
  const res = await t.request('/api/llm/generate', {
    method: 'POST',
    body: { connection: connection(), key: 'sk-test', messages: [{ role: 'user', content: 'Привет' }], params: { max_tokens: 50, temperature: 0.8 } },
  });
  assert.equal(res.status, 200);
  const events = await readSse(res);
  const text = events.filter((e) => e.t === 'delta').map((e) => e.text).join('');
  assert.equal(text, 'Привет');
  assert.equal(events.at(-1).t, 'done');

  const sent = seen.at(-1).body;
  assert.equal(sent.model, 'soda-1');
  assert.equal(sent.stream, true);
  assert.equal(sent.max_tokens, 50);
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'Привет' }]);
});

test('uses the stored key of a saved connection', async () => {
  await t.request('/api/c/connections/mock', { method: 'PUT', body: connection() });
  await t.request('/api/secrets/conn:mock', { method: 'PUT', body: { value: 'sk-test' } });
  const res = await t.request('/api/llm/generate', { method: 'POST', body: { connectionId: 'mock', messages: [{ role: 'user', content: 'Ещё' }] } });
  const events = await readSse(res);
  assert.equal(events.filter((e) => e.t === 'delta').map((e) => e.text).join(''), 'Привет');
});

test('upstream errors come back readable', async () => {
  const res = await t.request('/api/llm/generate', {
    method: 'POST',
    body: { connection: connection(), key: 'wrong', messages: [{ role: 'user', content: 'x' }] },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Invalid API key/);
});

test('model list and connection test', async () => {
  const models = await (await t.request('/api/llm/models', { method: 'POST', body: { connection: connection(), key: 'sk-test' } })).json();
  assert.deepEqual(
    models.map((m) => (typeof m === 'string' ? m : m.id)),
    ['soda-1', 'soda-2'],
  );
  const check = await (await t.request('/api/llm/test', { method: 'POST', body: { connection: connection(), key: 'sk-test' } })).json();
  assert.equal(check.ok, true);
});

test('the request log keeps the call without the key', async () => {
  const log = await (await t.request('/api/llm/log')).json();
  assert.ok(log.length >= 1);
  assert.ok(!JSON.stringify(log).includes('sk-test'));
});

/** Minimal SOCKS5 proxy (no auth, CONNECT only) that records where it connected. */
function socks5() {
  const targets = [];
  const srv = net.createServer((client) => {
    client.once('data', () => {
      client.write(Buffer.from([0x05, 0x00]));
      client.once('data', (req) => {
        const atyp = req[3];
        let host;
        let offset;
        if (atyp === 0x01) {
          host = [...req.subarray(4, 8)].join('.');
          offset = 8;
        } else if (atyp === 0x03) {
          const len = req[4];
          host = req.subarray(5, 5 + len).toString();
          offset = 5 + len;
        } else return client.destroy();
        const port = req.readUInt16BE(offset);
        targets.push(`${host}:${port}`);
        const remote = net.connect(port, host, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          client.pipe(remote).pipe(client);
        });
        remote.on('error', () => client.destroy());
      });
    });
    client.on('error', () => {});
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, targets })));
}

test('requests can go through a SOCKS5 proxy', async () => {
  const proxy = await socks5();
  try {
    const res = await t.request('/api/llm/generate', {
      method: 'POST',
      body: {
        connection: connection({ proxy: `socks5://127.0.0.1:${proxy.port}` }),
        key: 'sk-test',
        messages: [{ role: 'user', content: 'через прокси' }],
      },
    });
    const events = await readSse(res);
    assert.equal(events.filter((e) => e.t === 'delta').map((e) => e.text).join(''), 'Привет');
    assert.deepEqual(proxy.targets, [`127.0.0.1:${upstream.port}`]);
  } finally {
    proxy.srv.close();
  }
});
