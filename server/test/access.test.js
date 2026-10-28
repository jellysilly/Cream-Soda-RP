import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, rawRequest } from './helpers.js';

let t;
before(async () => (t = await startTestServer()));
after(() => t.stop());

test('health answers with the version', async () => {
  const res = await t.request('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.version, /^\d+\.\d+\.\d+/);
});

test('unknown Host header is rejected (DNS rebinding)', async () => {
  const res = await rawRequest(`${t.base}/api/health`, { headers: { Host: 'evil.example:8000' } });
  assert.equal(res.status, 403);
});

test('IP and localhost hosts are accepted', async () => {
  for (const host of [`localhost:${t.server.port}`, `127.0.0.1:${t.server.port}`, `192.168.1.12:${t.server.port}`]) {
    const res = await rawRequest(`${t.base}/api/health`, { headers: { Host: host } });
    assert.equal(res.status, 200, host);
  }
});

test('writes from another site are rejected, same origin is fine', async () => {
  const foreign = await t.request('/api/doc/settings', { method: 'PUT', body: { a: 1 }, headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);

  const same = await t.request('/api/doc/settings', { method: 'PUT', body: { a: 1 }, headers: { Origin: t.base } });
  assert.equal(same.status, 200);

  // The Vite dev server on another loopback port is trusted too.
  const dev = await t.request('/api/doc/settings', { method: 'PUT', body: { a: 2 }, headers: { Origin: 'http://localhost:5173' } });
  assert.equal(dev.status, 200);
});

test('switching LAN access on and off keeps the server reachable locally', async () => {
  // The switch rebinds the listener and drops open sockets (browsers retry those),
  // so check with fresh connections.
  await t.server.setLan(true);
  assert.equal((await rawRequest(`${t.base}/api/health`)).status, 200);
  await t.server.setLan(false);
  assert.equal((await rawRequest(`${t.base}/api/health`)).status, 200);
});

test('secrets are never sent back in full', async () => {
  const put = await t.request('/api/secrets/conn:test', { method: 'PUT', body: { value: 'sk-very-secret-key-123456' } });
  assert.equal(put.status, 200);
  const status = await (await t.request('/api/secrets')).json();
  const dump = JSON.stringify(status);
  assert.ok(!dump.includes('sk-very-secret-key-123456'), 'status must be masked');

  // Revealing works only from this device (the test runs on loopback).
  const reveal = await (await t.request('/api/secrets/conn:test/reveal', { method: 'POST' })).json();
  assert.equal(reveal.value, 'sk-very-secret-key-123456');
});
