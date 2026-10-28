/**
 * Cream Soda desktop launcher (Electron main process).
 * Starts the bundled server in-process and opens the interface either in an app
 * window or in the default browser. Also shows the QR code for phones on the same
 * Wi-Fi, switches data profiles, makes backups and shows logs.
 */
import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeImage } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Staged build: <app>/launcher/main.mjs next to <app>/server. Dev: launcher/desktop/main.mjs.
const ROOT = fs.existsSync(path.join(here, '..', 'server', 'index.js')) ? path.resolve(here, '..') : path.resolve(here, '..', '..');
const RELEASES_URL = 'https://github.com/jellysilly/Cream-Soda-RP/releases';

const serverModule = () => import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
const configModule = () => import(pathToFileURL(path.join(ROOT, 'server', 'src', 'config.js')).href);

function dataRoot() {
  if (process.env.CREAM_SODA_DATA) return process.env.CREAM_SODA_DATA;
  if (!app.isPackaged) return path.join(ROOT, 'data');
  // The portable .exe unpacks to a temp folder; keep data next to the .exe itself.
  if (process.env.PORTABLE_EXECUTABLE_DIR) return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Cream Soda data');
  // Portable mode for unpacked builds: a «portable» file next to the executable keeps data beside it.
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, 'portable')) || fs.existsSync(path.join(exeDir, 'portable.txt'))) return path.join(exeDir, 'data');
  return path.join(app.getPath('userData'), 'data');
}

const DATA = dataRoot();
const SETTINGS_FILE = path.join(DATA, 'launcher.json');
const DEFAULTS = { mode: 'window', lan: false, profile: 'default', port: 8000 };

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = readSettings();
function saveSettings() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

let launcherWin = null;
let appWin = null;
let server = null;
let starting = null;
let lastError = '';

const iconPath = path.join(ROOT, 'assets', 'brand', 'icon-512.png');
const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

async function lanInfo() {
  if (!server) return { display: '', url: '', qr: '' };
  const { lanAddresses, qrSvg } = await import(pathToFileURL(path.join(ROOT, 'server', 'src', 'system.js')).href);
  const ip = lanAddresses()[0]?.address;
  if (!ip) return { display: '', url: '', qr: '' };
  const url = `http://${ip}:${server.port}/?k=${server.lanToken}`;
  return { display: `${ip}:${server.port}`, url, qr: server.state.lan ? await qrSvg(url) : '' };
}

async function state() {
  const { listProfiles, VERSION } = await configModule();
  const profiles = listProfiles(DATA);
  if (!profiles.includes(settings.profile)) profiles.unshift(settings.profile);
  return {
    version: VERSION,
    running: !!server,
    starting: !!starting,
    url: server?.url || '',
    port: server?.port || settings.port,
    error: lastError,
    lan: await lanInfo(),
    profiles,
    settings,
    dataRoot: DATA,
    packaged: app.isPackaged,
    platform: process.platform,
  };
}

function notify() {
  if (!launcherWin || launcherWin.isDestroyed()) return;
  state().then((s) => launcherWin.webContents.send('state', s));
}

async function startServer() {
  if (server) return server;
  if (starting) return starting;
  lastError = '';
  starting = (async () => {
    try {
      const { startServer: start } = await serverModule();
      server = await start({
        port: settings.port,
        lan: settings.lan,
        dataRoot: DATA,
        profile: settings.profile,
        launcher: { kind: 'desktop', version: app.getVersion() },
      });
      return server;
    } catch (err) {
      console.error('[launcher] сервер не запустился:', err);
      lastError = err.message;
      throw err;
    } finally {
      starting = null;
      notify();
    }
  })();
  notify();
  return starting;
}

async function stopServer() {
  if (appWin && !appWin.isDestroyed()) appWin.close();
  if (server) {
    const s = server;
    server = null;
    await s.close().catch(() => {});
  }
  notify();
}

function openAppWindow(url) {
  if (appWin && !appWin.isDestroyed()) {
    appWin.loadURL(url);
    appWin.show();
    appWin.focus();
    return;
  }
  appWin = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 380,
    minHeight: 560,
    title: 'Cream Soda',
    icon: appIcon,
    backgroundColor: '#FBE2EC',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  appWin.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(server?.url || 'http://127.0.0.1')) return { action: 'allow' };
    shell.openExternal(target);
    return { action: 'deny' };
  });
  appWin.webContents.on('will-navigate', (e, target) => {
    if (server && !target.startsWith(server.url)) {
      e.preventDefault();
      shell.openExternal(target);
    }
  });
  appWin.on('closed', () => {
    appWin = null;
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.show();
  });
  appWin.loadURL(url);
  launcherWin?.minimize();
}

async function launch({ safe = false } = {}) {
  const s = await startServer();
  const url = `${s.url}/${safe ? '?safe=1' : ''}`;
  if (settings.mode === 'browser') await shell.openExternal(url);
  else openAppWindow(url);
}

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 960,
    height: 620,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: process.platform !== 'linux',
    backgroundColor: process.platform === 'linux' ? '#F8C6D8' : '#00000000',
    title: 'Cream Soda · лаунчер',
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  launcherWin.loadFile(path.join(here, 'ui', 'index.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('close', (e) => {
    // With the app window open, closing the launcher just tucks it away.
    if (appWin && !appWin.isDestroyed() && !app.isQuitting) {
      e.preventDefault();
      launcherWin.hide();
    }
  });
  launcherWin.on('closed', () => {
    launcherWin = null;
  });
}

// ───────── IPC ─────────

ipcMain.handle('state', () => state());

ipcMain.handle('launch', async (_e, opts) => {
  try {
    await launch(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('stop', async () => {
  await stopServer();
  return { ok: true };
});

ipcMain.handle('settings', async (_e, patch) => {
  const prev = settings;
  settings = { ...settings, ...patch };
  saveSettings();
  if (server && patch.lan !== undefined && patch.lan !== prev.lan) await server.setLan(!!patch.lan);
  if (server && patch.profile && patch.profile !== prev.profile) {
    // A different profile means a different data folder: restart the server.
    const reopen = !!(appWin && !appWin.isDestroyed());
    await stopServer();
    if (reopen) await launch();
  }
  notify();
  return state();
});

ipcMain.handle('create-profile', async (_e, name) => {
  const { sanitizeProfileName } = await configModule();
  const clean = sanitizeProfileName(name);
  fs.mkdirSync(path.join(DATA, 'profiles', clean), { recursive: true });
  return clean;
});

ipcMain.handle('backup', async () => {
  const { resolvePaths } = await configModule();
  const { createBackup } = await import(pathToFileURL(path.join(ROOT, 'server', 'src', 'backup.js')).href);
  const { Secrets } = await import(pathToFileURL(path.join(ROOT, 'server', 'src', 'secrets.js')).href);
  const paths = resolvePaths(DATA, settings.profile);
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(launcherWin, {
    title: 'Сохранить бэкап',
    defaultPath: path.join(app.getPath('documents'), `cream-soda-${paths.profile}-${stamp}.zip`),
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  const buf = await createBackup(paths, new Secrets(paths), { includeKeys: false });
  await fsp.writeFile(res.filePath, buf);
  shell.showItemInFolder(res.filePath);
  return { ok: true, file: res.filePath };
});

ipcMain.handle('logs', async () => {
  if (server) return server.logs.tail(400).map((l) => `${new Date(l.time).toLocaleTimeString('ru-RU')} [${l.level}] ${l.text}`).join('\n');
  try {
    const text = await fsp.readFile(path.join(DATA, 'logs', 'server.log'), 'utf8');
    return text.split('\n').slice(-400).join('\n');
  } catch {
    return 'Логов пока нет — сервер ещё не запускался.';
  }
});

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (err) => resolve({ code: -1, out: err.message }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

ipcMain.handle('update', async () => {
  if (app.isPackaged || !fs.existsSync(path.join(ROOT, '.git'))) {
    await shell.openExternal(RELEASES_URL);
    return { ok: true, message: 'Открыла страницу релизов — скачайте новую версию.' };
  }
  const pull = await run('git', ['pull', '--ff-only'], ROOT);
  if (pull.code !== 0) return { ok: false, message: pull.out.trim() };
  if (/Already up to date|Уже актуально/i.test(pull.out)) return { ok: true, message: 'Уже последняя версия.' };
  const install = await run('npm', ['install', '--no-audit', '--no-fund'], ROOT);
  const build = install.code === 0 ? await run('npm', ['run', 'build'], ROOT) : install;
  return {
    ok: build.code === 0,
    message: build.code === 0 ? 'Обновлено. Перезапустите лаунчер.' : build.out.trim().split('\n').slice(-8).join('\n'),
  };
});

ipcMain.handle('open-data', () => shell.openPath(DATA));
ipcMain.handle('open-url', (_e, url) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : null));
ipcMain.on('window', (_e, action) => {
  if (!launcherWin) return;
  if (action === 'minimize') launcherWin.minimize();
  if (action === 'close') launcherWin.close();
});

// ───────── Lifecycle ─────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = appWin && !appWin.isDestroyed() ? appWin : launcherWin;
    if (w) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createLauncher();
    if (process.argv.includes('--autostart')) launch().catch(() => {});
    app.on('activate', () => {
      if (!launcherWin) createLauncher();
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('window-all-closed', async () => {
    await stopServer();
    app.quit();
  });
}
