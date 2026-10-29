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
  console.log(`Cream Soda — roleplay chat server

  --port <n>        port (default 8000)
  --lan             allow phones on the same Wi-Fi network to connect
  --data <path>     data folder (default ./data)
  --profile <name>  data profile (default "default")
  --open            open the interface in the browser
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

if (args.lan) console.log(`[server] open from a phone: http://<computer-ip>:${server.port}/?k=${server.lanToken}`);

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
