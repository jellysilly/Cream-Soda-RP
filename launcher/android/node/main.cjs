/**
 * Entry point of the Node.js project that runs on the phone (Node.js for Mobile Apps
 * via capacitor-nodejs). Starts the Cream Soda server on 127.0.0.1 and reports its
 * state to the launcher screen over the built-in `bridge` channel.
 *
 * Messages from the launcher: hello, start {port}, logs, backup.
 * Messages to the launcher:   status {stage, version, url, port, error, lang}, logs <text>, backup {ok, path, name, error}.
 */
// stdout/stderr of Node.js go to the Android log (tag NodeJS-Engine), which the
// launcher's «Logs» can show even when this script is not answering.
const trace = (...args) => console.error('[android]', ...args);
trace(`main.cjs: Node.js ${process.version}, ${process.platform}/${process.arch}`);

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { channel, getDataPath } = require('bridge');
trace('bridge loaded');

process.on('exit', (code) => trace('Node.js is exiting, code', code));

// Messages cross JNI as "modified UTF-8", which has no 4-byte sequences: drop emoji and co.
const jniSafe = (text) => String(text).replace(/[\u{10000}-\u{10FFFF}]/gu, '?');

const here = __dirname;
const DATA = path.join(getDataPath(), 'cream-soda');
const load = (rel) => import(pathToFileURL(path.join(here, rel)).href);

let server = null;
let starting = null;

/** Interface language chosen in the app (Settings → General): the launcher screen follows it. */
function language() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(DATA, 'profiles', 'default', 'settings.json'), 'utf8'));
    if (settings?.language === 'ru' || settings?.language === 'en') return settings.language;
    // Saved before languages existed, by the Russian-only interface (same rule as the web app).
    return settings && Object.keys(settings).length ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}
let status = { stage: 'booting', version: require('./package.json').version };

function report(patch) {
  status = { ...status, ...patch };
  if (status.error) status.error = jniSafe(status.error);
  trace('status →', status.stage, status.error || '');
  channel.send('status', { ...status, lang: language() });
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
      console.error('[android] the server did not start:', err);
      report({ stage: 'error', error: err.message });
    })
    .finally(() => {
      starting = null;
    });
}

channel.addListener('hello', () => {
  trace('hello ←');
  channel.send('status', { ...status, lang: language() });
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
    : status.error || 'The server is not running yet.';
  channel.send('logs', text);
});

channel.addListener('backup', async () => {
  try {
    if (!server) throw new Error('The server is not running yet');
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
  console.error('[android] unhandled error:', err);
  report({ stage: server ? 'ready' : 'error', error: err.message });
});

report({ stage: 'idle' });
