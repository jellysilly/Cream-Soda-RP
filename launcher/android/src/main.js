import { engineReady, sendToNode, onNode, askNode, setBackground, setKeepAwake, scanQr, exportFile } from './native.js';

const RELEASES_URL = 'https://github.com/jellysilly/Cream-Soda-RP/releases';
const $ = (id) => document.getElementById(id);

// ───────── Preferences (per device) ─────────

const PREFS_KEY = 'cs-android-launcher';
const prefs = { background: true, awake: false, ...read(PREFS_KEY) };
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private storage unavailable: preferences live for this session only */
  }
}

// Coming back from the interface (Android «Назад») must not bounce straight into it again.
const OPENED_KEY = 'cs-opened';
const alreadyOpened = () => {
  try {
    return sessionStorage.getItem(OPENED_KEY) === '1';
  } catch {
    return false;
  }
};

// ───────── UI state ─────────

// The first start unpacks ~1300 files from the APK, which takes a while on slow phones.
const ENGINE_TIMEOUT = 90000;
// A running engine answers «hello» at once and starts the server within seconds.
const REPLY_TIMEOUT = 15000;
const START_TIMEOUT = 60000;
const RESTART_HINT = 'Закройте приложение полностью (смахните из списка недавних) и откройте снова.';

let engine = 'active'; // active | done | error
let server = { stage: 'booting' };
let opening = false;
let watchdog = null;

function toast(text, ms = 4000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

function setStep(id, state, label) {
  const li = $(id);
  li.dataset.state = state;
  li.querySelector('.label').textContent = label;
}

function render() {
  if (server.version) $('version').textContent = `v${server.version}`;

  if (engine === 'error') setStep('step-engine', 'error', 'Движок не запустился');
  else setStep('step-engine', engine === 'done' ? 'done' : 'active', engine === 'done' ? 'Движок распакован' : 'Распаковываю движок…');

  const ready = server.stage === 'ready';
  if (engine !== 'done') setStep('step-server', 'idle', 'Запуск сервера');
  else if (ready) setStep('step-server', 'done', 'Сервер запущен');
  else if (server.stage === 'error') setStep('step-server', 'error', 'Сервер не запустился');
  else setStep('step-server', 'active', 'Запускаю сервер…');

  if (opening) setStep('step-ui', 'active', 'Открываю интерфейс…');
  else if (ready) setStep('step-ui', 'done', 'Интерфейс готов');
  else setStep('step-ui', 'idle', 'Открыть интерфейс');

  const progress = engine !== 'done' ? 18 : !ready ? (server.stage === 'error' ? 50 : 55) : opening ? 82 : 100;
  $('progress').style.width = `${progress}%`;
  $('progress').parentElement.setAttribute('aria-valuenow', String(progress));

  $('error').hidden = !server.error;
  $('error').textContent = server.error ? `Ошибка: ${server.error}` : '';

  // Without a live engine «Попробовать снова» can't help: only an app restart can.
  const retry = server.stage === 'error' && !server.fatal;
  $('btn-open').disabled = !ready && !retry;
  $('open-text').textContent = retry ? 'Попробовать снова' : 'Открыть';
}

function openInterface() {
  if (server.stage !== 'ready' || !server.url) return;
  opening = true;
  render();
  try {
    sessionStorage.setItem(OPENED_KEY, '1');
  } catch {
    /* ignore */
  }
  // Same WebView: Android «Назад» from the interface returns here.
  setTimeout(() => location.assign(`${server.url}/`), 450);
}

// ───────── Server lifecycle ─────────

function fail(message, fatal = false) {
  clearTimeout(watchdog);
  server = { ...server, stage: 'error', error: message, fatal };
  render();
}

/** Fails with `message` unless a status arrives within `ms`. */
function expectStatus(ms, message) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => fail(message, true), ms);
}

function startServer() {
  server = { ...server, stage: 'starting', error: '' };
  render();
  expectStatus(START_TIMEOUT, `Сервер не запустился за минуту. ${RESTART_HINT}`);
  sendToNode('start', { port: 8000 }).catch((err) => fail(err.message || String(err)));
}

function onStatus(s) {
  clearTimeout(watchdog);
  const was = server.stage;
  server = s;
  if (s.stage === 'idle') startServer();
  else if (s.stage === 'starting') expectStatus(START_TIMEOUT, `Сервер не запустился за минуту. ${RESTART_HINT}`);
  render();
  if (server.stage === 'ready' && was !== 'ready') {
    if (prefs.background) applyBackground(true);
    if (!alreadyOpened()) openInterface();
  }
}

async function boot() {
  render();
  onNode('status', onStatus);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ENGINE_TIMEOUT);
  });
  try {
    await Promise.race([engineReady(), timeout]);
  } catch {
    engine = 'error';
    return fail(`Node.js не запустился за полторы минуты. Возможно, не хватило места в памяти телефона. ${RESTART_HINT}`, true);
  } finally {
    clearTimeout(timer);
  }
  engine = 'done';
  render();
  // Silence after «hello» means the Node.js script itself failed to load.
  expectStatus(REPLY_TIMEOUT, `Node.js запущен, но не отвечает. ${RESTART_HINT}`);
  sendToNode('hello').catch((err) => fail(err.message || String(err), true));
}

// ───────── Controls ─────────

$('btn-open').addEventListener('click', () => {
  if (server.stage === 'error') return startServer();
  openInterface();
});

async function applyBackground(on) {
  try {
    const ok = await setBackground(on);
    if (!ok) {
      toast('Без разрешения на уведомления Android может остановить сервер в фоне');
      $('background').checked = prefs.background = false;
      savePrefs();
    }
  } catch (err) {
    toast(`Фоновый режим: ${err.message || err}`);
  }
}

$('background').checked = prefs.background;
$('background').addEventListener('change', (e) => {
  prefs.background = e.target.checked;
  savePrefs();
  if (server.stage === 'ready' || !prefs.background) applyBackground(prefs.background);
});

$('awake').checked = prefs.awake;
if (prefs.awake) setKeepAwake(true).catch(() => {});
$('awake').addEventListener('change', (e) => {
  prefs.awake = e.target.checked;
  savePrefs();
  setKeepAwake(prefs.awake).catch((err) => toast(err.message || String(err)));
});

/** Accepts what the desktop launcher shows: a full URL from the QR code or «ip:port». */
function pcUrl(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

function connectTo(text) {
  const url = pcUrl(text);
  if (!url) return toast('Это не похоже на адрес Cream Soda с компьютера');
  toast('Подключаюсь к компьютеру…');
  location.assign(url);
}

$('btn-pc').addEventListener('click', async () => {
  try {
    const text = await scanQr();
    if (text) connectTo(text);
  } catch (err) {
    if (err.code === 'unavailable') toast('Сканер QR ещё загружается из Google Play. Пока можно ввести адрес вручную.', 6000);
    $('manual').hidden = false;
    $('manual-addr').focus();
  }
});

$('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('manual').hidden = true;
  connectTo($('manual-addr').value);
});
$('btn-manual-cancel').addEventListener('click', () => ($('manual').hidden = true));

$('btn-updates').addEventListener('click', () => {
  // Not in allowNavigation, so Capacitor hands it to the system browser.
  location.assign(RELEASES_URL);
});

$('btn-backup').addEventListener('click', async () => {
  if (server.stage !== 'ready') return toast('Сначала дождитесь запуска сервера');
  toast('Собираю бэкап…', 30000);
  // Big galleries take a while to zip.
  const res = await askNode('backup', 'backup', undefined, 5 * 60000).catch((err) => ({ ok: false, error: err.message }));
  if (!res?.ok) return toast(`Бэкап не получился: ${res?.error || 'неизвестная ошибка'}`, 6000);
  try {
    const where = exportFile(res.path, `cream-soda-${res.name}`, 'application/zip');
    toast(`Бэкап сохранён:\n${where}`, 6000);
  } catch (err) {
    toast(`Бэкап создан в данных приложения (${res.name}), но не скопирован в Загрузки: ${err.message}`, 8000);
  }
});

async function showLogs() {
  const pre = $('logs-text');
  pre.textContent = (await askNode('logs', 'logs').catch((err) => `Логи недоступны: ${err.message}`)) || 'Пусто';
  pre.scrollTop = pre.scrollHeight;
}
$('btn-logs').addEventListener('click', () => {
  $('logs').hidden = false;
  showLogs();
});
$('btn-logs-refresh').addEventListener('click', showLogs);
$('btn-logs-close').addEventListener('click', () => ($('logs').hidden = true));

boot().catch((err) => fail(err.message || String(err), true));
