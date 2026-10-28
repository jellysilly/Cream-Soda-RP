import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { startTestServer } from './helpers.js';

let t;
before(async () => (t = await startTestServer()));
after(() => t.stop());

test('backup → delete → restore brings data back', async () => {
  await t.request('/api/c/characters/rin', { method: 'PUT', body: { id: 'rin', name: 'Рин' } });
  await t.request('/api/secrets/conn:x', { method: 'PUT', body: { value: 'sk-secret' } });

  const zip = Buffer.from(await (await t.request('/api/backup')).arrayBuffer());
  const files = Object.keys(unzipSync(new Uint8Array(zip)));
  assert.ok(files.includes('cream-soda-backup.json'));
  assert.ok(files.some((f) => f.startsWith('characters/')));
  assert.ok(!files.includes('secrets.plain.json'), 'keys are left out unless asked for');

  await t.request('/api/c/characters/rin', { method: 'DELETE' });
  assert.equal((await (await t.request('/api/c/characters')).json()).length, 0);

  const res = await t.request('/api/backup/restore', { method: 'POST', body: zip, headers: { 'Content-Type': 'application/zip' } });
  assert.equal(res.status, 200);
  const list = await (await t.request('/api/c/characters')).json();
  assert.deepEqual(
    list.map((c) => c.name),
    ['Рин'],
  );

  // A safety copy of the state before restoring is kept.
  const backups = await (await t.request('/api/backups')).json();
  assert.ok(backups.some((b) => /^before-restore-/.test(b.name)));
});

test('restore ignores paths that escape the profile folder', async () => {
  const evil = zipSync({
    'cream-soda-backup.json': strToU8('{}'),
    '../../escaped.txt': strToU8('nope'),
    'characters/ok.json': strToU8(JSON.stringify({ id: 'ok', name: 'OK' })),
  });
  const res = await t.request('/api/backup/restore', { method: 'POST', body: evil, headers: { 'Content-Type': 'application/zip' } });
  assert.equal(res.status, 200);
  assert.ok(!fs.existsSync(path.join(t.dataRoot, 'escaped.txt')));
  assert.ok(!fs.existsSync(path.join(t.dataRoot, 'profiles', 'escaped.txt')));
  const list = await (await t.request('/api/c/characters')).json();
  assert.ok(list.some((c) => c.id === 'ok'));
});

test('restore refuses files that are not Cream Soda backups', async () => {
  const notZip = await t.request('/api/backup/restore', { method: 'POST', body: Buffer.from('hello'), headers: { 'Content-Type': 'application/zip' } });
  assert.equal(notZip.status, 400);
  const otherZip = zipSync({ 'readme.txt': strToU8('hi') });
  const res = await t.request('/api/backup/restore', { method: 'POST', body: otherZip, headers: { 'Content-Type': 'application/zip' } });
  assert.equal(res.status, 400);
});

test('saved backups can be listed and downloaded', async () => {
  const { name } = await (await t.request('/api/backup/save', { method: 'POST' })).json();
  assert.match(name, /^manual-.*\.zip$/);
  const dl = await t.request(`/api/backups/${name}`);
  assert.equal(dl.status, 200);
  const traversal = await t.request(`/api/backups/${encodeURIComponent('../../.cs-key')}`);
  assert.ok(traversal.status >= 400);
});

test('backup download works for a profile with a non-ASCII name', async () => {
  const ru = await startTestServer({ profile: 'Тест' });
  try {
    const res = await ru.request('/api/backup');
    assert.equal(res.status, 200);
    const disposition = res.headers.get('content-disposition');
    assert.match(disposition, /filename="cream-soda-____-\d{4}-\d{2}-\d{2}\.zip"/);
    const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)[1];
    assert.match(decodeURIComponent(encoded), /^cream-soda-Тест-\d{4}-\d{2}-\d{2}\.zip$/);
  } finally {
    await ru.stop();
  }
});
