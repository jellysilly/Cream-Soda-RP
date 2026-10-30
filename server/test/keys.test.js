import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, listen, readSse } from './helpers.js';

let t;
let upstream;
const seen = [];

// sk-good works; sk-limited answers 429 like a provider over its rate limit.
before(async () => {
  t = await startTestServer();
  upstream = await listen((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization });
      const json = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (req.url === '/sdapi/v1/sd-models') return json(200, [{ title: 'anime.safetensors [1a2b]', model_name: 'anime' }, { title: 'real.safetensors [3c4d]', model_name: 'real' }]);
      if (req.url === '/sdapi/v1/samplers') return json(200, [{ name: 'Euler a' }, { name: 'DPM++ 2M' }]);
      if (req.url === '/object_info') {
        return json(200, {
          CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sdxl.safetensors', 'pony.safetensors']] } } },
          UNETLoader: { input: { required: { unet_name: ['COMBO', { options: ['flux1-dev.safetensors'] }] } } },
        });
      }
      if (req.url === '/v1/models') return json(200, { data: [{ id: 'gpt-4o' }, { id: 'gpt-image-1' }, { id: 'dall-e-3' }] });
      if (req.headers.authorization === 'Bearer sk-limited') return json(429, { error: { message: 'Rate limit exceeded' } });
      if (req.headers.authorization !== 'Bearer sk-good') return json(401, { error: { message: 'Invalid API key' } });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
});
after(async () => {
  await upstream.close();
  await t.stop();
});

const keys = (path = '', init = {}) => t.request(`/api/secrets/conn:multi/keys${path}`, init).then((r) => r.json());

test('a lone key becomes a one-entry list; batches are added without duplicates', async () => {
  await t.request('/api/secrets/conn:multi', { method: 'PUT', body: { value: 'sk-limited' } });
  let list = await keys();
  assert.equal(list.keys.length, 1);
  assert.equal(list.active, list.keys[0].id);

  list = await keys('', { method: 'POST', body: { value: 'sk-good\n\nsk-limited\nsk-other\n', label: 'free' } });
  assert.equal(list.added, 2);
  assert.deepEqual(
    list.keys.map((k) => k.label),
    ['', 'free 1', 'free 2'],
  );
  assert.ok(list.keys.every((k) => !('value' in k)), 'values never leave the server');
  assert.equal(list.masked, list.keys[0].masked, 'the first key stays active');

  // The plain status shows only the active key, not the list.
  const status = await (await t.request('/api/secrets')).json();
  assert.deepEqual(Object.keys(status), ['conn:multi']);
});

test('switching, renaming, revealing and deleting keys', async () => {
  let list = await keys();
  const [first, second, third] = list.keys;
  list = await keys(`/${second.id}`, { method: 'PATCH', body: { active: true, label: 'main' } });
  assert.equal(list.active, second.id);
  assert.equal(list.keys[1].label, 'main');
  assert.equal(list.masked, second.masked);
  const revealed = await keys(`/${second.id}/reveal`, { method: 'POST', body: {} });
  assert.equal(revealed.value, 'sk-good');

  list = await keys(`/${third.id}`, { method: 'DELETE' });
  assert.equal(list.keys.length, 2);
  // Deleting the active key makes a neighbour active.
  list = await keys(`/${second.id}`, { method: 'DELETE' });
  assert.equal(list.active, first.id);
  assert.equal((await keys(`/${second.id}`, { method: 'PATCH', body: { active: true } })).error, 'Key not found');

  // Typing a new key into the main field replaces the active one, not adds to the list.
  await t.request('/api/secrets/conn:multi', { method: 'PUT', body: { value: 'sk-limited-2' } });
  list = await keys();
  assert.equal(list.keys.length, 1);
  assert.equal((await keys(`/${list.active}/reveal`, { method: 'POST', body: {} })).value, 'sk-limited-2');
  await t.request('/api/secrets/conn:multi', { method: 'PUT', body: { value: 'sk-limited' } });
  list = await keys('', { method: 'POST', body: { values: ['sk-good'] } });
  assert.equal(list.keys.length, 2);
});

test('with rotation on, a 429 moves the request to the next key', async () => {
  await t.request('/api/c/connections/multi', { method: 'PUT', body: { id: 'multi', name: 'Multi', api: 'custom', baseUrl: `${upstream.url}/v1`, model: 'soda-1' } });
  const body = { connectionId: 'multi', messages: [{ role: 'user', content: 'hi' }] };

  // Rotation off: the error comes back as is.
  let res = await t.request('/api/llm/generate', { method: 'POST', body });
  assert.equal(res.status, 429);

  await t.request('/api/secrets/conn:multi/rotate', { method: 'PUT', body: { rotate: true } });
  seen.length = 0;
  res = await t.request('/api/llm/generate', { method: 'POST', body });
  assert.equal(res.status, 200);
  const events = await readSse(res);
  assert.equal(events.filter((e) => e.t === 'delta').map((e) => e.text).join(''), 'ok');
  assert.deepEqual(
    seen.map((s) => s.auth),
    ['Bearer sk-limited', 'Bearer sk-good'],
  );
  // The working key stays active for the next requests.
  const list = await keys();
  assert.equal((await keys(`/${list.active}/reveal`, { method: 'POST', body: {} })).value, 'sk-good');

  // When every key fails, the last error is returned.
  await keys(`/${list.active}`, { method: 'DELETE' });
  await keys('', { method: 'POST', body: { value: 'sk-revoked' } });
  seen.length = 0;
  res = await t.request('/api/llm/generate', { method: 'POST', body });
  assert.equal(res.status, 401);
  assert.deepEqual(
    seen.map((s) => s.auth),
    ['Bearer sk-limited', 'Bearer sk-revoked'],
  );
});

test('deleting a connection removes its whole key list', async () => {
  await t.request('/api/c/connections/multi', { method: 'DELETE' });
  const list = await keys();
  assert.equal(list.keys.length, 0);
});

test('image models: A1111 checkpoints and samplers, ComfyUI models, OpenAI image models', async () => {
  const models = (config) => t.request('/api/images/models', { method: 'POST', body: { config } }).then((r) => r.json());
  const a1111 = await models({ format: 'a1111', endpoint: upstream.url });
  assert.deepEqual(a1111.models, [
    { id: 'anime.safetensors [1a2b]', name: 'anime' },
    { id: 'real.safetensors [3c4d]', name: 'real' },
  ]);
  assert.deepEqual(a1111.samplers, ['Euler a', 'DPM++ 2M']);

  const comfy = await models({ format: 'comfy', endpoint: `${upstream.url}/prompt` });
  assert.deepEqual(
    comfy.models.map((m) => m.id),
    ['sdxl.safetensors', 'pony.safetensors', 'flux1-dev.safetensors'],
  );

  const openai = await models({ format: 'openai', endpoint: `${upstream.url}/v1` });
  assert.deepEqual(
    openai.models.map((m) => m.id),
    ['gpt-image-1', 'dall-e-3'],
  );

  const custom = await t.request('/api/images/models', { method: 'POST', body: { config: { format: 'custom', endpoint: upstream.url } } });
  assert.equal(custom.status, 400);
});
