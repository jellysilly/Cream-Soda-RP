/* Launcher window UI. Talks to the main process through window.launcher (preload). */
const api = window.launcher;
const $ = (id) => document.getElementById(id);

let current = null;
let busy = false;

function toast(text, ms = 4000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

function render(s) {
  current = s;
  $('version').textContent = `v${s.version}`;

  const status = $('status');
  status.classList.remove('status--busy', 'status--error');
  if (s.starting || busy) {
    status.classList.add('status--busy');
    $('status-text').textContent = 'Запускаю…';
  } else if (s.error) {
    status.classList.add('status--error');
    $('status-text').textContent = 'Не запустился';
  } else if (s.running) {
    $('status-text').textContent = `Работает · порт ${s.port}`;
  } else {
    $('status-text').textContent = 'Готово к запуску';
  }
  const err = $('error');
  err.hidden = !s.error;
  err.textContent = s.error ? `Ошибка: ${s.error}` : '';

  $('launch-text').textContent = s.running ? 'Открыть' : 'Запустить';
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
  $('lan-addr').textContent = s.lan.display || (s.running ? 'нет сети' : `порт ${s.port}`);
  $('lan-hint').textContent = !s.settings.lan
    ? 'Включи, чтобы зайти с телефона в той же Wi-Fi сети'
    : s.running
      ? 'Отсканируй QR-код в той же Wi-Fi сети'
      : 'QR-код появится после запуска';

  const sel = $('profile');
  sel.innerHTML = '';
  for (const p of s.profiles) {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = p === 'default' ? 'Основной' : p;
    sel.appendChild(o);
  }
  const add = document.createElement('option');
  add.value = '__new';
  add.textContent = '+ Новый профиль…';
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
  if (!res.ok) toast(res.error || 'Не удалось запустить сервер');
  refresh();
});

for (const b of document.querySelectorAll('.segmented button')) {
  b.addEventListener('click', () => api.settings({ mode: b.dataset.mode }).then(render));
}

$('lan').addEventListener('change', (e) => api.settings({ lan: e.target.checked }).then(render));

$('profile').addEventListener('change', async (e) => {
  let name = e.target.value;
  if (name === '__new') {
    name = (window.prompt?.('Название нового профиля') || '').trim();
    if (!name) return render(current);
    name = await api.createProfile(name);
  }
  render(await api.settings({ profile: name }));
  toast(`Профиль «${name === 'default' ? 'Основной' : name}»`);
});

$('btn-update').addEventListener('click', async () => {
  $('btn-update').disabled = true;
  toast('Проверяю обновления…', 60000);
  const r = await api.update();
  $('btn-update').disabled = false;
  toast(r.message || (r.ok ? 'Готово' : 'Не получилось'), 8000);
});

$('btn-backup').addEventListener('click', async () => {
  const r = await api.backup();
  if (r.ok) toast(`Бэкап сохранён:\n${r.file}`, 6000);
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
refresh();
