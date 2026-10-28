#!/usr/bin/env node
import { exec } from 'node:child_process';
import { startServer } from './index.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, inline] = a.slice(2).split('=');
    const next = argv[i + 1];
    if (inline !== undefined) out[k] = inline;
    else if (next && !next.startsWith('--')) {
      out[k] = next;
      i++;
    } else out[k] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Cream Soda — сервер ролевых чатов

  --port <n>        порт (по умолчанию 8000)
  --lan             разрешить вход с телефона в той же Wi-Fi сети
  --data <путь>     папка с данными (по умолчанию ./data)
  --profile <имя>   профиль данных (по умолчанию default)
  --open            открыть интерфейс в браузере
`);
  process.exit(0);
}

const server = await startServer({
  port: Number(args.port) || Number(process.env.PORT) || 8000,
  lan: !!args.lan || process.env.CREAM_SODA_LAN === '1',
  dataRoot: typeof args.data === 'string' ? args.data : undefined,
  profile: typeof args.profile === 'string' ? args.profile : undefined,
  strictPort: !!args['strict-port'],
});

if (args.lan) console.log(`[server] вход с телефона: http://<ip-компьютера>:${server.port}/?k=${server.lanToken}`);

if (args.open) {
  const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} ${server.url}`);
}

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
