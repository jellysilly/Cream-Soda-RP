/**
 * Entry point of the Node.js project that runs on the phone (Node.js for Mobile Apps
 * via capacitor-nodejs). Starts the Cream Soda server on 127.0.0.1 and reports its
 * state to the launcher screen over the built-in `bridge` channel.
 *
 * Messages from the launcher: hello, start {port}, logs, backup.
 * Messages to the launcher:   status {stage, version, url, port, error}, logs <text>, backup {ok, path, name, error}.
 */
// stdout/stderr of Node.js go to the Android log (tag NodeJS-Engine), which the
// launcher's «Логи» can show even when this script is not answering.
const trace = (...args) => console.error('[android]', ...args);
trace(`main.cjs: Node.js ${process.version}, ${process.platform}/${process.arch}`);

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { channel, getDataPath } = require('bridge');
trace('bridge загружен');

process.on('exit', (code) => trace('Node.js завершается, код', code));

// Messages cross JNI as "modified UTF-8", which has no 4-byte sequences: drop emoji and co.
const jniSafe = (text) => String(text).replace(/[\u{10000}-\u{10FFFF}]/gu, '?');

const here = __dirname;
const DATA = path.join(getDataPath(), 'cream-soda');
const load = (rel) => import(pathToFileURL(path.join(here, rel)).href);

let server = null;
let starting = null;
let status = { stage: 'booting', version: require('./package.json').version };

function report(patch) {
  status = { ...status, ...patch };
  if (status.error) status.error = jniSafe(status.error);
  trace('status →', status.stage, status.error || '');
  channel.send('status', status);
}

async function start({ port = 8000 } = {}) {
  if (server || starting) return;
  report({ stage: 'starting', error: '' });
  starting = (async () => {
    const { startServer } = await load('server/index.js');
    // Bound to 127.0.0.1 only: the phone's interface talks to it locally.
    server = await startServer({ port, lan: false, dataRoot: DATA, launcher: { kind: 'android', version: status.version } });
    report({ stage: 'ready', url: server.url, port: server.port });
  })()
    .catch((err) => {
      console.error('[android] сервер не запустился:', err);
      report({ stage: 'error', error: err.message });
    })
    .finally(() => {
      starting = null;
    });
}

channel.addListener('hello', () => {
  trace('hello ←');
  channel.send('status', status);
});
channel.addListener('start', (opts) => {
  trace('start ←', JSON.stringify(opts));
  start(opts);
});

channel.addListener('logs', () => {
  const text = server
    ? server.logs
        .tail(300)
        .map((l) => `${new Date(l.time).toISOString().slice(11, 19)} [${l.level}] ${jniSafe(l.text)}`)
        .join('\n')
    : status.error || 'Сервер ещё не запущен.';
  channel.send('logs', text);
});

channel.addListener('backup', async () => {
  try {
    if (!server) throw new Error('Сервер ещё не запущен');
    const { createBackup, saveBackupFile } = await load('server/src/backup.js');
    const { Secrets } = await load('server/src/secrets.js');
    const buf = await createBackup(server.paths, new Secrets(server.paths), { includeKeys: false });
    const name = await saveBackupFile(server.paths, buf, 'manual');
    channel.send('backup', { ok: true, name, path: path.join(server.paths.backupsDir, name) });
  } catch (err) {
    channel.send('backup', { ok: false, error: err.message });
  }
});

process.on('uncaughtException', (err) => {
  console.error('[android] необработанная ошибка:', err);
  report({ stage: server ? 'ready' : 'error', error: err.message });
});

report({ stage: 'idle' });
