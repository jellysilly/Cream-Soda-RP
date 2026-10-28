import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Storage, COLLECTIONS, DOCS, UPLOAD_KINDS, httpError, isValidId } from './storage.js';
import { Secrets, mask } from './secrets.js';
import { handleGenerate, listModels, testConnection, RequestLog, upstreamFetch } from './llm/index.js';
import { generateImages, testImageApi } from './imagegen.js';
import { Extensions } from './extensions.js';
import { createBackup, restoreBackup, saveBackupFile, listBackups, backupPath, runAutoBackup } from './backup.js';
import { lanAddresses, loadLanToken, qrSvg } from './system.js';
import { VERSION, WEB_DIST, listProfiles } from './config.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopbackHost(host) {
  const h = String(host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}

function isIpLiteral(host) {
  const h = String(host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^[0-9a-f:]+$/i.test(h);
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(ctx) {
  const { paths, state } = ctx;
  const storage = new Storage(paths);
  const secrets = new Secrets(paths);
  const extensions = new Extensions(paths);
  const requestLog = new RequestLog();
  const lanToken = loadLanToken(paths.lanTokenFile);
  Object.assign(ctx, { storage, secrets, extensions, requestLog, lanToken });

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  // ───────── Access control ─────────
  // Loopback is always trusted. Other devices (a phone on the same Wi-Fi) need the
  // LAN switch on and the token from the launcher's QR code. Host and Origin checks
  // stop DNS-rebinding and cross-site requests from random web pages.
  app.use((req, res, next) => {
    const local = LOOPBACK.has(req.socket.remoteAddress);
    req.isLocal = local;
    const host = req.headers.host || '';
    if (!isLoopbackHost(host) && !isIpLiteral(host) && !(state.allowedHosts || []).includes(host.replace(/:\d+$/, ''))) {
      return res.status(403).type('text/plain; charset=utf-8').send('Cream Soda: неизвестный адрес хоста. Откройте приложение по IP-адресу.');
    }
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      let ok = false;
      try {
        const o = new URL(origin);
        ok = o.host === host || (local && isLoopbackHost(o.host));
      } catch {
        ok = false;
      }
      if (!ok) return res.status(403).json({ error: 'Запрос с чужого сайта отклонён' });
    }
    if (local) return next();
    if (!state.lan) return res.status(403).type('text/plain; charset=utf-8').send('Cream Soda: доступ из сети выключен в лаунчере.');
    const cookieToken = /(?:^|;\s*)cs_lan=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const queryToken = typeof req.query.k === 'string' ? req.query.k : '';
    const headerToken = req.headers['x-cs-token'];
    if (queryToken === lanToken) {
      res.setHeader('Set-Cookie', `cs_lan=${lanToken}; Path=/; Max-Age=31536000; SameSite=Strict; HttpOnly`);
      if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect(req.path);
      return next();
    }
    if (cookieToken === lanToken || headerToken === lanToken) return next();
    res.status(401).type('text/html; charset=utf-8').send(lockedPage());
  });

  const json = express.json({ limit: '64mb' });
  const raw = express.raw({ type: () => true, limit: '200mb' });
  const localOnly = (req, res, next) => (req.isLocal ? next() : next(httpError(403, 'Доступно только на этом устройстве')));

  // ───────── Bootstrap ─────────
  app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION }));

  app.get(
    '/api/bootstrap',
    asyncRoute(async (req, res) => {
      const collections = {};
      await Promise.all([...COLLECTIONS].map(async (c) => (collections[c] = await storage.list(c))));
      const docs = {};
      await Promise.all([...DOCS].map(async (d) => (docs[d] = await storage.getDoc(d))));
      res.json({
        version: VERSION,
        profile: paths.profile,
        profiles: listProfiles(paths.root),
        isLocal: req.isLocal,
        collections,
        docs,
        secrets: await secrets.status(),
        extensions: await extensions.list(),
      });
    }),
  );

  // ───────── Collections & documents ─────────
  app.get('/api/c/:collection', asyncRoute(async (req, res) => res.json(await storage.list(req.params.collection))));
  app.get('/api/c/:collection/:id', asyncRoute(async (req, res) => res.json(await storage.get(req.params.collection, req.params.id))));
  app.put(
    '/api/c/:collection/:id',
    json,
    asyncRoute(async (req, res) => {
      const item = await storage.put(req.params.collection, req.params.id, req.body);
      res.json(item);
    }),
  );
  app.delete(
    '/api/c/:collection/:id',
    asyncRoute(async (req, res) => {
      const { collection, id } = req.params;
      await storage.remove(collection, id);
      if (req.query.withChats === '1' && (collection === 'characters' || collection === 'groups')) {
        await storage.removeOwnerChats(collection === 'characters' ? 'character' : 'group', id);
      }
      if (collection === 'connections') await secrets.set(`conn:${id}`, '');
      res.json({ ok: true });
    }),
  );
  app.get('/api/doc/:name', asyncRoute(async (req, res) => res.json(await storage.getDoc(req.params.name))));
  app.put('/api/doc/:name', json, asyncRoute(async (req, res) => res.json(await storage.putDoc(req.params.name, req.body))));

  // ───────── Chats ─────────
  app.get(
    '/api/chats',
    asyncRoute(async (req, res) => {
      const { ownerType, ownerId } = req.query;
      if (!ownerType) return res.json(await storage.listAllChats());
      res.json(await storage.listChats(String(ownerType), String(ownerId)));
    }),
  );
  app.get('/api/chats/:id', asyncRoute(async (req, res) => res.json(await storage.getChat(req.params.id))));
  app.put('/api/chats/:id', json, asyncRoute(async (req, res) => res.json(await storage.putChat(req.params.id, req.body))));
  app.delete(
    '/api/chats/:id',
    asyncRoute(async (req, res) => {
      await storage.removeChat(req.params.id);
      res.json({ ok: true });
    }),
  );

  // ───────── Files ─────────
  app.post(
    '/api/files/:kind',
    raw,
    asyncRoute(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'Пустой файл');
      const dir = typeof req.query.dir === 'string' ? req.query.dir : '';
      res.json(await storage.saveUpload(req.params.kind, req.body, String(req.query.name || ''), dir));
    }),
  );
  app.get(
    '/api/files/:kind',
    asyncRoute(async (req, res) => res.json(await storage.listUploads(req.params.kind, typeof req.query.dir === 'string' ? req.query.dir : ''))),
  );
  app.delete(
    '/api/files',
    asyncRoute(async (req, res) => {
      await storage.deleteUpload(String(req.query.url || ''));
      res.json({ ok: true });
    }),
  );
  app.use(
    '/files',
    express.static(paths.filesDir, {
      fallthrough: false,
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
      },
    }),
  );

  // Download a card/lorebook/etc by URL (character hubs, direct links).
  app.post(
    '/api/import/url',
    json,
    asyncRoute(async (req, res) => {
      let url = String(req.body?.url || '').trim();
      if (!/^https?:\/\//.test(url)) throw httpError(400, 'Нужна ссылка http(s)');
      const chub = /^https?:\/\/(?:www\.)?(?:chub\.ai|characterhub\.org)\/characters\/([^/?#]+\/[^/?#]+)/.exec(url);
      if (chub) url = `https://avatars.charhub.io/avatars/${chub[1]}/chara_card_v2.png`;
      const up = await upstreamFetch(url, { timeoutMs: 60000 });
      if (!up.ok) throw httpError(up.status, `Не удалось скачать: HTTP ${up.status}`);
      const buf = Buffer.from(await up.arrayBuffer());
      if (buf.length > 50 * 1024 * 1024) throw httpError(413, 'Файл слишком большой');
      res.setHeader('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('X-File-Name', encodeURIComponent(decodeURIComponent(url.split('/').pop().split('?')[0] || 'file')));
      res.send(buf);
    }),
  );

  // ───────── Secrets ─────────
  app.get('/api/secrets', asyncRoute(async (req, res) => res.json(await secrets.status())));
  app.put(
    '/api/secrets/:name',
    json,
    asyncRoute(async (req, res) => {
      const name = req.params.name;
      if (!/^[\w:\-.]{1,120}$/.test(name)) throw httpError(400, 'Некорректное имя ключа');
      await secrets.set(name, req.body?.value || '');
      res.json({ ok: true, masked: mask(req.body?.value || '') });
    }),
  );
  app.post(
    '/api/secrets/:name/reveal',
    localOnly,
    asyncRoute(async (req, res) => res.json({ value: await secrets.get(req.params.name) })),
  );

  // ───────── LLM ─────────
  async function resolveConnection(body) {
    let conn = body.connection;
    if (!conn && body.connectionId) conn = await storage.get('connections', String(body.connectionId));
    if (!conn) throw httpError(400, 'Не выбран профиль подключения. Откройте Настройки → Подключения.');
    let key = '';
    if (typeof body.key === 'string' && body.key) key = body.key;
    else if (conn.id) key = await secrets.get(`conn:${conn.id}`);
    return { conn, key };
  }

  app.post(
    '/api/llm/generate',
    json,
    asyncRoute(async (req, res) => {
      const { conn, key } = await resolveConnection(req.body);
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        await handleGenerate({ conn, key, body: req.body, res, signal: controller.signal, log: requestLog });
      } catch (err) {
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ t: 'error', message: err.message, status: err.status || 500 })}\n\n`);
          res.end();
        } else throw err;
      }
    }),
  );
  app.post(
    '/api/llm/models',
    json,
    asyncRoute(async (req, res) => {
      const { conn, key } = await resolveConnection(req.body);
      res.json(await listModels(conn, key));
    }),
  );
  app.post(
    '/api/llm/test',
    json,
    asyncRoute(async (req, res) => {
      const { conn, key } = await resolveConnection(req.body);
      res.json(await testConnection(conn, key));
    }),
  );
  app.get('/api/llm/log', (req, res) => res.json(requestLog.list()));
  app.get('/api/llm/log/:id', (req, res) => {
    const item = requestLog.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Запись не найдена' });
    res.json(item);
  });

  // ───────── Images ─────────
  app.post(
    '/api/images/generate',
    json,
    asyncRoute(async (req, res) => {
      const cfg = { ...(await storage.getDoc('imagegen')), ...(req.body?.config || {}) };
      const key = await secrets.get('imagegen');
      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      const started = Date.now();
      const entry = requestLog.start({ label: req.body?.label || 'Картинка', api: `images:${cfg.format || 'custom'}`, model: cfg.model || '', url: cfg.endpoint, request: req.body?.params });
      try {
        const images = await generateImages(cfg, key, req.body?.params || {}, { signal: controller.signal });
        const dir = isValidId(String(req.body?.dir || '')) ? String(req.body.dir) : 'gallery';
        const saved = [];
        for (const img of images) {
          const ext = /jpe?g/.test(img.mime) ? '.jpg' : /webp/.test(img.mime) ? '.webp' : '.png';
          saved.push(await storage.saveUpload('images', img.buffer, `image${ext}`, dir));
        }
        entry.status = 200;
        entry.duration = Date.now() - started;
        entry.response = `${saved.length} изобр.`;
        res.json({ images: saved });
      } catch (err) {
        entry.status = err.status || 500;
        entry.error = err.message;
        entry.duration = Date.now() - started;
        throw err;
      }
    }),
  );
  app.post(
    '/api/images/test',
    json,
    asyncRoute(async (req, res) => {
      const cfg = { ...(await storage.getDoc('imagegen')), ...(req.body?.config || {}) };
      res.json(await testImageApi(cfg, await secrets.get('imagegen')));
    }),
  );

  // ───────── Extensions ─────────
  app.get('/api/extensions', asyncRoute(async (req, res) => res.json(await extensions.list())));
  app.post('/api/extensions/install', localOnly, json, asyncRoute(async (req, res) => res.json(await extensions.install(req.body?.url))));
  app.post('/api/extensions/:name/update', localOnly, asyncRoute(async (req, res) => res.json(await extensions.update(req.params.name))));
  app.delete(
    '/api/extensions/:name',
    localOnly,
    asyncRoute(async (req, res) => {
      await extensions.remove(req.params.name);
      res.json({ ok: true });
    }),
  );
  app.use('/extensions', express.static(paths.extensionsDir, { fallthrough: false, dotfiles: 'deny' }));

  // ───────── Backups ─────────
  app.get(
    '/api/backup',
    asyncRoute(async (req, res) => {
      const includeKeys = req.query.keys === '1' && req.isLocal;
      const buf = await createBackup(paths, secrets, { includeKeys });
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="cream-soda-${paths.profile}-${stamp}.zip"`);
      res.send(buf);
    }),
  );
  app.post(
    '/api/backup/save',
    asyncRoute(async (req, res) => {
      const name = await saveBackupFile(paths, await createBackup(paths, secrets), 'manual');
      res.json({ name });
    }),
  );
  app.get('/api/backups', asyncRoute(async (req, res) => res.json(await listBackups(paths))));
  app.get('/api/backups/:name', (req, res, next) => {
    try {
      res.download(backupPath(paths, req.params.name));
    } catch (err) {
      next(err);
    }
  });
  app.post(
    '/api/backup/restore',
    localOnly,
    raw,
    asyncRoute(async (req, res) => {
      const result = await restoreBackup(paths, secrets, req.body);
      res.json(result);
    }),
  );

  // ───────── System / launcher ─────────
  app.get(
    '/api/system/info',
    asyncRoute(async (req, res) => {
      const addresses = lanAddresses();
      const primary = addresses[0]?.address;
      const lanUrl = primary ? `http://${primary}:${state.port}/?k=${lanToken}` : '';
      res.json({
        version: VERSION,
        port: state.port,
        host: state.host,
        profile: paths.profile,
        profiles: listProfiles(paths.root),
        dataRoot: req.isLocal ? paths.root : undefined,
        launcher: state.launcher || null,
        lan: {
          enabled: !!state.lan,
          addresses: addresses.map((a) => a.address),
          url: req.isLocal ? lanUrl : '',
          display: primary ? `${primary}:${state.port}` : '',
          qr: req.isLocal && lanUrl && state.lan ? await qrSvg(lanUrl) : '',
        },
      });
    }),
  );
  app.post(
    '/api/system/lan',
    localOnly,
    json,
    asyncRoute(async (req, res) => {
      await ctx.setLan(!!req.body?.enabled);
      res.json({ enabled: !!state.lan });
    }),
  );
  app.get('/api/system/logs', localOnly, (req, res) => res.json(ctx.logs ? ctx.logs.tail(400) : []));

  // ───────── Web UI ─────────
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api\/|files\/|extensions\/).*/, (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  } else {
    app.get('/', (req, res) =>
      res
        .type('text/html; charset=utf-8')
        .send('<h1>Cream Soda</h1><p>Интерфейс ещё не собран. Выполните <code>npm run build</code> или запустите <code>npm run dev</code>.</p>'),
    );
  }

  // ───────── Errors ─────────
  app.use('/api', (req, res) => res.status(404).json({ error: 'Неизвестный адрес API' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[server]', req.method, req.path, err.message);
    if (res.headersSent) return res.end();
    res.status(status).json({ error: err.message || 'Внутренняя ошибка' });
  });

  ctx.autoBackup = async () => {
    try {
      const name = await runAutoBackup(paths, secrets, await storage.getDoc('settings'));
      if (name) console.log(`[backup] автобэкап сохранён: ${name}`);
    } catch (err) {
      console.warn('[backup] автобэкап не удался:', err.message);
    }
  };

  return { app, storage };
}

function lockedPage() {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cream Soda</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#F5AEC8,#FBE2EC 72%,#D3EBF8);font-family:system-ui,sans-serif;color:#47162F">
<div style="max-width:340px;padding:24px;border-radius:28px;background:rgba(255,255,255,.75);text-align:center">
<h1 style="margin:0 0 8px;font-size:22px">Cream Soda</h1>
<p style="margin:0;color:#85395E">Отсканируйте QR-код в лаунчере на компьютере, чтобы открыть приложение с этого устройства.</p>
</div></body></html>`;
}
