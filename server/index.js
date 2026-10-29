import http from 'node:http';
import { createApp } from './src/app.js';
import { resolvePaths, defaultDataRoot, VERSION } from './src/config.js';
import { LogCapture } from './src/system.js';

export { VERSION };

/**
 * Starts the Cream Soda server. Used by the CLI, the desktop launcher (Electron)
 * and the Android launcher (nodejs-mobile).
 *
 * @param {object} options
 * @param {number} [options.port=8000]
 * @param {boolean} [options.lan=false]  listen on all interfaces for phones on the same Wi-Fi
 * @param {string} [options.dataRoot]
 * @param {string} [options.profile='default']
 * @param {object} [options.launcher]    info shown in the UI (launcher kind, version)
 */
export async function startServer(options = {}) {
  const paths = resolvePaths(options.dataRoot || defaultDataRoot(), options.profile || 'default');
  const logs = new LogCapture(paths.logsDir);
  if (options.captureConsole !== false) logs.hookConsole();

  const state = {
    port: Number(options.port) || 8000,
    lan: !!options.lan,
    host: options.lan ? '0.0.0.0' : '127.0.0.1',
    allowedHosts: options.allowedHosts || [],
    launcher: options.launcher || null,
  };
  const ctx = { paths, state, logs };
  const { app, storage } = createApp(ctx);
  await storage.init();

  let server = null;
  const sockets = new Set();

  const listen = (host, port) =>
    new Promise((resolve, reject) => {
      const s = http.createServer(app);
      s.keepAliveTimeout = 65000;
      s.on('connection', (sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
      });
      s.once('error', reject);
      s.listen(port, host, () => {
        s.off('error', reject);
        resolve(s);
      });
    });

  // Try the requested port, then a few next ones if it is busy.
  let lastErr;
  for (let i = 0; i < (options.strictPort ? 1 : 20); i++) {
    try {
      server = await listen(state.host, state.port + i);
      state.port += i;
      break;
    } catch (err) {
      lastErr = err;
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  if (!server) throw lastErr;

  ctx.setLan = async (enabled) => {
    if (!!enabled === state.lan) return;
    state.lan = !!enabled;
    const host = enabled ? '0.0.0.0' : '127.0.0.1';
    if (host === state.host) return;
    const old = server;
    for (const sock of sockets) sock.destroy();
    await new Promise((r) => old.close(() => r()));
    server = await listen(host, state.port);
    state.host = host;
    console.log(`[server] network access ${enabled ? 'on' : 'off'}`);
  };

  const url = `http://127.0.0.1:${state.port}`;
  console.log(`[server] Cream Soda ${VERSION} · profile "${paths.profile}" · ${url}${state.lan ? ' · network access on' : ''}`);

  ctx.autoBackup();
  const backupTimer = setInterval(() => ctx.autoBackup(), 6 * 3600 * 1000);
  backupTimer.unref();

  return {
    url,
    get port() {
      return state.port;
    },
    paths,
    state,
    logs,
    lanToken: ctx.lanToken,
    setLan: ctx.setLan,
    async close() {
      clearInterval(backupTimer);
      for (const sock of sockets) sock.destroy();
      await new Promise((r) => server.close(() => r()));
      logs.close();
    },
  };
}
