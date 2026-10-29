/* Launcher window UI. Talks to the main process through window.launcher (preload). */
const api = window.launcher;
const $ = (id) => document.getElementById(id);

let current = null;
let busy = false;

// The launcher speaks the language chosen in the app (Settings → General); English by default.
const RU = {
  'Cream Soda · launcher': 'Cream Soda · лаунчер',
  Minimize: 'Свернуть',
  Close: 'Закрыть',
  'Everything you need is already inside: the engine, the server and the interface. Press “Launch”.': 'Всё нужное уже внутри: движок, сервер и интерфейс. Нажми «Запустить».',
  'A glass of cream soda': 'Бокал крем-соды',
  'Where to open': 'Где открыть',
  'In the app window': 'В окне приложения',
  'In the browser': 'В браузере',
  'QR code for the phone': 'QR-код для телефона',
  'Open from a phone': 'Открыть с телефона',
  Profile: 'Профиль',
  Update: 'Обновить',
  Backup: 'Бэкап',
  Logs: 'Логи',
  'Server logs': 'Логи сервера',
  Refresh: 'Обновить',
  'Data folder': 'Папка данных',
  'Starting…': 'Запускаю…',
  'Failed to start': 'Не запустился',
  'Running · port {port}': 'Работает · порт {port}',
  'Ready to launch': 'Готово к запуску',
  'Error: {error}': 'Ошибка: {error}',
  Open: 'Открыть',
  Launch: 'Запустить',
  'no network': 'нет сети',
  'port {port}': 'порт {port}',
  'Turn on to open it from a phone on the same Wi-Fi network': 'Включи, чтобы зайти с телефона в той же Wi-Fi сети',
  'Scan the QR code on the same Wi-Fi network': 'Отсканируй QR-код в той же Wi-Fi сети',
  'The QR code shows up after launch': 'QR-код появится после запуска',
  Main: 'Основной',
  '+ New profile…': '+ Новый профиль…',
  'Could not start the server': 'Не удалось запустить сервер',
  'Name of the new profile': 'Название нового профиля',
  'Profile “{name}”': 'Профиль «{name}»',
  'Checking for updates…': 'Проверяю обновления…',
  Done: 'Готово',
  'That did not work': 'Не получилось',
  'Backup saved:\n{file}': 'Бэкап сохранён:\n{file}',
};
let lang = 'en';
const T = (en, vars = {}) => (lang === 'ru' ? RU[en] ?? en : en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

function applyLang(next) {
  if (next === lang) return;
  lang = next === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = lang;
  document.title = T('Cream Soda · launcher');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', T(el.dataset.i18nAria));
}

function toast(text, ms = 4000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

function render(s) {
  current = s;
  applyLang(s.lang);
  $('version').textContent = `v${s.version}`;

  const status = $('status');
  status.classList.remove('status--busy', 'status--error');
  if (s.starting || busy) {
    status.classList.add('status--busy');
    $('status-text').textContent = T('Starting…');
  } else if (s.error) {
    status.classList.add('status--error');
    $('status-text').textContent = T('Failed to start');
  } else if (s.running) {
    $('status-text').textContent = T('Running · port {port}', { port: s.port });
  } else {
    $('status-text').textContent = T('Ready to launch');
  }
  const err = $('error');
  err.hidden = !s.error;
  err.textContent = s.error ? T('Error: {error}', { error: s.error }) : '';

  $('launch-text').textContent = s.running ? T('Open') : T('Launch');
  $('btn-launch').disabled = !!s.starting || busy;

  for (const b of document.querySelectorAll('.segmented button')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === s.settings.mode));
  }

  $('lan').checked = !!s.settings.lan;
  const qr = $('qr');
  if (s.running && s.settings.lan && s.lan.qr) {
    qr.innerHTML = s.lan.qr;
    qr.classList.add('qr--live');
  } else {
    qr.innerHTML = '';
    qr.classList.remove('qr--live');
  }
  $('lan-addr').textContent = s.lan.display || (s.running ? T('no network') : T('port {port}', { port: s.port }));
  $('lan-hint').textContent = !s.settings.lan
    ? T('Turn on to open it from a phone on the same Wi-Fi network')
    : s.running
      ? T('Scan the QR code on the same Wi-Fi network')
      : T('The QR code shows up after launch');

  const sel = $('profile');
  sel.innerHTML = '';
  for (const p of s.profiles) {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = p === 'default' ? T('Main') : p;
    sel.appendChild(o);
  }
  const add = document.createElement('option');
  add.value = '__new';
  add.textContent = T('+ New profile…');
  sel.appendChild(add);
  sel.value = s.settings.profile;
}

async function refresh() {
  render(await api.state());
}

$('btn-min').addEventListener('click', () => api.minimize());
$('btn-close').addEventListener('click', () => api.close());

$('btn-launch').addEventListener('click', async (e) => {
  busy = true;
  render(current);
  // Holding Shift opens the interface in safe mode (custom CSS off).
  const res = await api.launch({ safe: e.shiftKey });
  busy = false;
  if (!res.ok) toast(res.error || T('Could not start the server'));
  refresh();
});

for (const b of document.querySelectorAll('.segmented button')) {
  b.addEventListener('click', () => api.settings({ mode: b.dataset.mode }).then(render));
}

$('lan').addEventListener('change', (e) => api.settings({ lan: e.target.checked }).then(render));

$('profile').addEventListener('change', async (e) => {
  let name = e.target.value;
  if (name === '__new') {
    name = (window.prompt?.(T('Name of the new profile')) || '').trim();
    if (!name) return render(current);
    name = await api.createProfile(name);
  }
  render(await api.settings({ profile: name }));
  toast(T('Profile “{name}”', { name: name === 'default' ? T('Main') : name }));
});

$('btn-update').addEventListener('click', async () => {
  $('btn-update').disabled = true;
  toast(T('Checking for updates…'), 60000);
  const r = await api.update();
  $('btn-update').disabled = false;
  toast(r.message || (r.ok ? T('Done') : T('That did not work')), 8000);
});

$('btn-backup').addEventListener('click', async () => {
  const r = await api.backup();
  if (r.ok) toast(T('Backup saved:\n{file}', { file: r.file }), 6000);
});

async function showLogs() {
  $('logs-text').textContent = await api.logs();
  const pre = $('logs-text');
  pre.scrollTop = pre.scrollHeight;
}

$('btn-logs').addEventListener('click', async () => {
  $('logs').hidden = false;
  showLogs();
});
$('btn-logs-refresh').addEventListener('click', showLogs);
$('btn-logs-close').addEventListener('click', () => ($('logs').hidden = true));
$('btn-data').addEventListener('click', () => api.openData());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('logs').hidden = true;
});

api.onState(render);
// The language may have changed in the app window meanwhile.
window.addEventListener('focus', refresh);
refresh();
