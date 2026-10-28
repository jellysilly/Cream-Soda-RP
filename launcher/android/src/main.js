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

let engine = 'active'; // active | done
let server = { stage: 'booting' };
let opening = false;

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

  setStep('step-engine', engine === 'done' ? 'done' : 'active', engine === 'done' ? 'Движок распакован' : 'Распаковываю движок…');

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

  $('btn-open').disabled = !ready && server.stage !== 'error';
  $('open-text').textContent = server.stage === 'error' ? 'Попробовать снова' : 'Открыть';
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

function onStatus(s) {
  const was = server.stage;
  server = s;
  if (s.stage === 'idle') {
    sendToNode('start', { port: 8000 });
    server = { ...s, stage: 'starting' };
  }
  render();
  if (server.stage === 'ready' && was !== 'ready') {
    if (prefs.background) applyBackground(true);
    if (!alreadyOpened()) openInterface();
  }
}

async function boot() {
  render();
  onNode('status', onStatus);
  await engineReady();
  engine = 'done';
  render();
  sendToNode('hello');
}

// ───────── Controls ─────────

$('btn-open').addEventListener('click', () => {
  if (server.stage === 'error') {
    server = { ...server, stage: 'starting', error: '' };
    render();
    sendToNode('start', { port: 8000 });
    return;
  }
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
  const res = await askNode('backup', 'backup');
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
  pre.textContent = (await askNode('logs', 'logs')) || 'Пусто';
  pre.scrollTop = pre.scrollHeight;
}
$('btn-logs').addEventListener('click', () => {
  $('logs').hidden = false;
  showLogs();
});
$('btn-logs-refresh').addEventListener('click', showLogs);
$('btn-logs-close').addEventListener('click', () => ($('logs').hidden = true));

boot().catch((err) => {
  server = { ...server, stage: 'error', error: err.message || String(err) };
  render();
});
