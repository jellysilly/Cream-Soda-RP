import { engineReady, sendToNode, onNode, askNode, setBackground, setKeepAwake, scanQr, exportFile, readSystemLog, saveText, setAndroidLanguage } from './native.js';

const RELEASES_URL = 'https://github.com/jellysilly/Cream-Soda-RP/releases';
const $ = (id) => document.getElementById(id);

// ───────── Language ─────────
// The screen follows the language chosen in the app (Settings → General), which
// Node.js reports with every status; until then, the last one seen (English at first).

const RU = {
  'Server on the phone': 'Сервер на телефоне',
  Startup: 'Запуск',
  'Run in the background': 'Работать в фоне',
  'Keep the screen on': 'Не давать экрану гаснуть',
  'Connect to a PC': 'Подключиться к ПК',
  'Scan the QR code from the launcher on the computer': 'Сканировать QR из лаунчера на компьютере',
  Updates: 'Обновления',
  Backup: 'Бэкап',
  Logs: 'Логи',
  'Server logs': 'Логи сервера',
  Refresh: 'Обновить',
  Save: 'Сохранить',
  Close: 'Закрыть',
  'Computer address': 'Адрес компьютера',
  'The QR scanner is not available. Enter the address from the launcher on the PC: it is under the QR code, e.g. 192.168.1.12:8000.':
    'Сканер QR недоступен. Введите адрес из лаунчера на ПК — он под QR-кодом, например 192.168.1.12:8000.',
  Cancel: 'Отмена',
  Connect: 'Подключиться',
  'Close the app completely (swipe it away from the recent apps) and open it again. Details are in “Logs” at the bottom of the screen.':
    'Закройте приложение полностью (смахните из списка недавних) и откройте снова. Подробности — в «Логи» внизу экрана.',
  'The engine did not start': 'Движок не запустился',
  'Engine unpacked': 'Движок распакован',
  'Unpacking the engine…': 'Распаковываю движок…',
  'Server start': 'Запуск сервера',
  'Server started': 'Сервер запущен',
  'The server did not start': 'Сервер не запустился',
  'Starting the server…': 'Запускаю сервер…',
  'Opening the interface…': 'Открываю интерфейс…',
  'Interface ready': 'Интерфейс готов',
  'Open the interface': 'Открыть интерфейс',
  'Error: {error}': 'Ошибка: {error}',
  'Try again': 'Попробовать снова',
  Open: 'Открыть',
  'The server did not start within a minute. {hint}': 'Сервер не запустился за минуту. {hint}',
  'Node.js did not start within a minute and a half. The phone may be out of storage. {hint}': 'Node.js не запустился за полторы минуты. Возможно, не хватило места в памяти телефона. {hint}',
  'Node.js started but is not answering. {hint}': 'Node.js запущен, но не отвечает. {hint}',
  'Node.js exited (code {code})': 'Node.js завершился (код {code})',
  'Without the notification permission Android may stop the server in the background': 'Без разрешения на уведомления Android может остановить сервер в фоне',
  'Background mode: {error}': 'Фоновый режим: {error}',
  'This does not look like a Cream Soda address from a computer': 'Это не похоже на адрес Cream Soda с компьютера',
  'Connecting to the computer…': 'Подключаюсь к компьютеру…',
  'The QR scanner is still downloading from Google Play. You can enter the address by hand for now.': 'Сканер QR ещё загружается из Google Play. Пока можно ввести адрес вручную.',
  'Wait for the server to start first': 'Сначала дождитесь запуска сервера',
  'Making a backup…': 'Собираю бэкап…',
  'Backup failed: {error}': 'Бэкап не получился: {error}',
  'unknown error': 'неизвестная ошибка',
  'Backup saved:\n{where}': 'Бэкап сохранён:\n{where}',
  'The backup was created in the app data ({name}) but not copied to Downloads: {error}': 'Бэкап создан в данных приложения ({name}), но не скопирован в Загрузки: {error}',
  '── Server ──': '── Сервер ──',
  Empty: 'Пусто',
  'Collecting…': 'Собираю…',
  'Log saved:\n{where}': 'Лог сохранён:\n{where}',
  'The server is not running yet.': 'Сервер ещё не запущен.',
  'The server is not running yet': 'Сервер ещё не запущен',
  'Node.js did not answer': 'Node.js не ответил',
  'File saving is not available in this build': 'Сохранение файлов недоступно в этой сборке',
  'Could not read the Android log: {error}': 'Не удалось прочитать журнал Android: {error}',
  'The server is running: chats are available': 'Сервер работает — чаты доступны',
};
const LANG_KEY = 'cs-android-lang';
let lang = (() => {
  try {
    return localStorage.getItem(LANG_KEY) === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
})();
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const T = (en, vars = {}) => fill(lang === 'ru' ? RU[en] ?? en : en, vars);

/** Messages from Node.js and Java come in English: translate the known ones, patterns included. */
function translateMessage(message) {
  if (lang !== 'ru' || !message) return message;
  if (RU[message]) return RU[message];
  for (const [en, ru] of Object.entries(RU)) {
    if (!en.includes('{')) continue;
    const names = [];
    const source = en
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        names.push(m[1]);
        return '([\\s\\S]+?)';
      })
      .join('');
    const m = new RegExp(`^${source}$`).exec(message);
    if (m) return fill(ru, Object.fromEntries(names.map((name, i) => [name, m[i + 1]])));
  }
  return message;
}

function applyLang(next) {
  const target = next === 'ru' ? 'ru' : 'en';
  try {
    localStorage.setItem(LANG_KEY, target);
  } catch {
    /* no storage: the screen follows Node.js each time */
  }
  setAndroidLanguage(target);
  if (target === lang && document.documentElement.lang === target) return;
  lang = target;
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', T(el.dataset.i18nAria));
}

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

// Coming back from the interface (Android «Back») must not bounce straight into it again.
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
const RESTART_HINT = () => T('Close the app completely (swipe it away from the recent apps) and open it again. Details are in “Logs” at the bottom of the screen.');

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

  if (engine === 'error') setStep('step-engine', 'error', T('The engine did not start'));
  else setStep('step-engine', engine === 'done' ? 'done' : 'active', engine === 'done' ? T('Engine unpacked') : T('Unpacking the engine…'));

  const ready = server.stage === 'ready';
  if (engine !== 'done') setStep('step-server', 'idle', T('Server start'));
  else if (ready) setStep('step-server', 'done', T('Server started'));
  else if (server.stage === 'error') setStep('step-server', 'error', T('The server did not start'));
  else setStep('step-server', 'active', T('Starting the server…'));

  if (opening) setStep('step-ui', 'active', T('Opening the interface…'));
  else if (ready) setStep('step-ui', 'done', T('Interface ready'));
  else setStep('step-ui', 'idle', T('Open the interface'));

  const progress = engine !== 'done' ? 18 : !ready ? (server.stage === 'error' ? 50 : 55) : opening ? 82 : 100;
  $('progress').style.width = `${progress}%`;
  $('progress').parentElement.setAttribute('aria-valuenow', String(progress));

  $('error').hidden = !server.error;
  $('error').textContent = server.error ? T('Error: {error}', { error: translateMessage(server.error) }) : '';

  // Without a live engine «Try again» can't help: only an app restart can.
  const retry = server.stage === 'error' && !server.fatal;
  $('btn-open').disabled = !ready && !retry;
  $('open-text').textContent = retry ? T('Try again') : T('Open');
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
  // Same WebView: Android «Back» from the interface returns here.
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
  expectStatus(START_TIMEOUT, T('The server did not start within a minute. {hint}', { hint: RESTART_HINT() }));
  sendToNode('start', { port: 8000 }).catch((err) => fail(err.message || String(err)));
  watchStatus();
}

function onStatus(s) {
  if (!s) return;
  if (s.lang) applyLang(s.lang);
  const was = server.stage;
  // A late «idle» (the answer to a «hello» sent before «start») changes nothing.
  if (s.stage === 'idle' && was === 'starting') return;
  // A repeated «starting» keeps the start timeout running; anything else answers it.
  if (!(s.stage === 'starting' && was === 'starting')) clearTimeout(watchdog);
  server = s;
  if (s.stage === 'idle') startServer();
  else if (s.stage === 'starting' && was !== 'starting') expectStatus(START_TIMEOUT, T('The server did not start within a minute. {hint}', { hint: RESTART_HINT() }));
  render();
  if (server.stage === 'ready' && was !== 'ready') {
    if (prefs.background) applyBackground(true);
    if (!alreadyOpened()) openInterface();
  }
}

// Capacitor drops every plugin listener when the WebView reports «page started»
// (Bridge.reset), and on some phones that report comes after this script has
// subscribed, so a long-lived «status» subscription can silently vanish. Until
// the server is up, ask for the status every second over a fresh subscription.
let statusHandle = null;
async function listenStatus() {
  const old = statusHandle;
  statusHandle = await onNode('status', onStatus);
  await old?.remove().catch(() => {});
}

const settled = () => server.stage === 'ready' || server.stage === 'error';
let watching = false;
async function watchStatus() {
  if (watching) return;
  watching = true;
  try {
    while (!settled()) {
      onStatus(await askNode('hello', 'status', undefined, 2000).catch(() => null));
      if (!settled()) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    watching = false;
  }
  // For news that come unasked later (Node.js stopping), subscribe once more now that the page has settled.
  listenStatus().catch(() => {});
}

async function boot() {
  applyLang(lang);
  render();
  if (document.readyState !== 'complete') await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  await listenStatus();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ENGINE_TIMEOUT);
  });
  try {
    await Promise.race([engineReady(), timeout]);
  } catch {
    engine = 'error';
    return fail(T('Node.js did not start within a minute and a half. The phone may be out of storage. {hint}', { hint: RESTART_HINT() }), true);
  } finally {
    clearTimeout(timer);
  }
  engine = 'done';
  render();
  // Silence after «hello» means the Node.js script itself failed to load.
  expectStatus(REPLY_TIMEOUT, T('Node.js started but is not answering. {hint}', { hint: RESTART_HINT() }));
  watchStatus();
}

// ───────── Controls ─────────

$('btn-open').addEventListener('click', () => {
  if (server.stage === 'error') return startServer();
  openInterface();
});

async function applyBackground(on) {
  try {
    const ok = await setBackground(on, T('The server is running: chats are available'));
    if (!ok) {
      toast(T('Without the notification permission Android may stop the server in the background'));
      $('background').checked = prefs.background = false;
      savePrefs();
    }
  } catch (err) {
    toast(T('Background mode: {error}', { error: err.message || err }));
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
  if (!url) return toast(T('This does not look like a Cream Soda address from a computer'));
  toast(T('Connecting to the computer…'));
  location.assign(url);
}

$('btn-pc').addEventListener('click', async () => {
  try {
    const text = await scanQr();
    if (text) connectTo(text);
  } catch (err) {
    if (err.code === 'unavailable') toast(T('The QR scanner is still downloading from Google Play. You can enter the address by hand for now.'), 6000);
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
  if (server.stage !== 'ready') return toast(T('Wait for the server to start first'));
  toast(T('Making a backup…'), 30000);
  // Big galleries take a while to zip.
  const res = await askNode('backup', 'backup', undefined, 5 * 60000).catch((err) => ({ ok: false, error: err.message }));
  if (!res?.ok) return toast(T('Backup failed: {error}', { error: translateMessage(res?.error) || T('unknown error') }), 6000);
  try {
    const where = exportFile(res.path, `cream-soda-${res.name}`, 'application/zip');
    toast(T('Backup saved:\n{where}', { where }), 6000);
  } catch (err) {
    toast(T('The backup was created in the app data ({name}) but not copied to Downloads: {error}', { name: res.name, error: err.message }), 8000);
  }
});

/** Server log (when Node.js answers) plus the app's Android log, which works even when it doesn't. */
async function collectLogs() {
  const parts = [];
  if (engine === 'done') {
    const serverLog = await askNode('logs', 'logs', undefined, 3000).catch(() => '');
    if (serverLog) parts.push(`${T('── Server ──')}\n${T(serverLog)}`);
  }
  let system = '';
  try {
    system = readSystemLog();
  } catch (err) {
    system = T('Could not read the Android log: {error}', { error: err.message });
  }
  if (system) parts.push(`── Android ──\n${system}`);
  return parts.join('\n\n') || T('Empty');
}

async function showLogs() {
  const pre = $('logs-text');
  pre.textContent = T('Collecting…');
  pre.textContent = await collectLogs();
  pre.scrollTop = pre.scrollHeight;
}
$('btn-logs').addEventListener('click', () => {
  $('logs').hidden = false;
  showLogs();
});
$('btn-logs-refresh').addEventListener('click', showLogs);
$('btn-logs-save').addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  try {
    const where = saveText(`cream-soda-log-${stamp}.txt`, $('logs-text').textContent);
    toast(T('Log saved:\n{where}', { where }), 6000);
  } catch (err) {
    toast(err.message || String(err), 6000);
  }
});
$('btn-logs-close').addEventListener('click', () => ($('logs').hidden = true));

boot().catch((err) => fail(err.message || String(err), true));
