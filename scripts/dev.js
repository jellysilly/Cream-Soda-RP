#!/usr/bin/env node
/**
 * Development mode: the server on :8000 and Vite with hot reload on :5173
 * (Vite proxies /api, /files and /extensions to the server).
 *   npm run dev
 * Open http://localhost:5173. Extra arguments go to the server, e.g. `npm run dev -- --lan`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const procs = [
  ['server', process.execPath, ['server/cli.js', '--port', '8000', '--strict-port', ...process.argv.slice(2)], '\x1b[35m'],
  ['web', isWin ? 'npm.cmd' : 'npm', ['--prefix', 'web', 'run', 'dev'], '\x1b[36m'],
].map(([name, cmd, args, color]) => {
  const child = spawn(cmd, args, { cwd: root, env: process.env, shell: isWin && cmd.endsWith('.cmd') });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) out.write(tag + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}остановлен (код ${code})`);
    stopAll(code ?? 0);
  });
  return child;
});

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
