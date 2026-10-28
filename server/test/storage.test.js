import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { sanitizeProfileName } from '../src/config.js';

let t;
before(async () => (t = await startTestServer()));
after(() => t.stop());

test('profile names become safe folder names', () => {
  assert.equal(sanitizeProfileName('Мой профиль'), 'Мой профиль');
  assert.equal(sanitizeProfileName('../../etc'), 'etc');
  assert.equal(sanitizeProfileName('a/b\\c'), 'abc');
  assert.equal(sanitizeProfileName(''), 'default');
  assert.equal(sanitizeProfileName('..'), 'default');
});

test('collections: create, read, list, delete', async () => {
  const put = await t.request('/api/c/characters/rin', { method: 'PUT', body: { id: 'rin', name: 'Ханами Рин', tags: ['кафе'] } });
  assert.equal(put.status, 200);

  const got = await (await t.request('/api/c/characters/rin')).json();
  assert.equal(got.name, 'Ханами Рин');

  const list = await (await t.request('/api/c/characters')).json();
  assert.ok(list.some((c) => c.id === 'rin'));

  assert.equal((await t.request('/api/c/characters/rin', { method: 'DELETE' })).status, 200);
  const after = await (await t.request('/api/c/characters')).json();
  assert.ok(!after.some((c) => c.id === 'rin'));
});

test('unknown collections and path tricks are refused', async () => {
  const unknown = await t.request('/api/c/nope/x', { method: 'PUT', body: {} });
  assert.ok(unknown.status >= 400 && unknown.status < 500, `expected a client error, got ${unknown.status}`);
  const traversal = await t.request(`/api/c/characters/${encodeURIComponent('../secrets')}`, { method: 'PUT', body: {} });
  assert.ok(traversal.status >= 400, `expected an error, got ${traversal.status}`);
});

test('chats are stored per owner and listed with metadata', async () => {
  const chat = {
    id: 'chat1',
    ownerType: 'character',
    ownerId: 'rin',
    title: 'Ночное кафе',
    messages: [
      { id: 'm1', role: 'assistant', name: 'Рин', text: 'Привет!' },
      { id: 'm2', role: 'user', name: 'Юки', text: 'Один крем-соду, пожалуйста.' },
    ],
  };
  assert.equal((await t.request('/api/chats/chat1', { method: 'PUT', body: chat })).status, 200);
  const back = await (await t.request('/api/chats/chat1')).json();
  assert.equal(back.messages.length, 2);

  const metas = await (await t.request('/api/chats?ownerType=character&ownerId=rin')).json();
  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, 'chat1');

  assert.equal((await t.request('/api/chats/chat1', { method: 'DELETE' })).status, 200);
  assert.equal((await (await t.request('/api/chats?ownerType=character&ownerId=rin')).json()).length, 0);
});

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('uploads keep real images and neutralise disguised files', async () => {
  const png = await (await t.request('/api/files/avatars?name=rin.png', { method: 'POST', body: PNG_1x1 })).json();
  assert.match(png.url, /^\/files\/avatars\/.+\.png$/);
  const served = await t.request(png.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  // An SVG (could carry scripts) pretending to be a PNG must not be served as an image.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const fake = await (await t.request('/api/files/avatars?name=evil.png', { method: 'POST', body: svg })).json();
  assert.doesNotMatch(fake.url, /\.(png|svg|html?)$/);

  const del = await t.request(`/api/files?url=${encodeURIComponent(png.url)}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await t.request(png.url)).status, 404);
});
