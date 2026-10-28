import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';

export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(docker|br-|veth|vmnet|vboxnet|utun|tun)/i.test(name)) continue;
      out.push({ iface: name, address: a.address });
    }
  }
  // Prefer typical home networks first.
  return out.sort((a, b) => rank(a.address) - rank(b.address));
}

function rank(ip) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

export function loadLanToken(file) {
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (t.length >= 16) return t;
  } catch {
    /* create below */
  }
  const token = crypto.randomBytes(18).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

export async function qrSvg(text) {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#47162F', light: '#FFFFFF' },
  });
}

let consoleHooked = false;
let activeCapture = null;

/** Captures console output into a ring buffer + log file (for «Логи» in the launcher). */
export class LogCapture {
  constructor(logsDir, limit = 800) {
    this.lines = [];
    this.limit = limit;
    this.listeners = new Set();
    fs.mkdirSync(logsDir, { recursive: true });
    this.file = path.join(logsDir, 'server.log');
    try {
      const st = fs.statSync(this.file);
      if (st.size > 5 * 1024 * 1024) fs.renameSync(this.file, `${this.file}.1`);
    } catch {
      /* no log yet */
    }
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
  }

  /**
   * Mirrors console output into this capture. The console is patched once per
   * process; a restarted server (e.g. after a profile switch) just takes over.
   */
  hookConsole() {
    if (!consoleHooked) {
      consoleHooked = true;
      for (const level of ['log', 'info', 'warn', 'error']) {
        const original = console[level].bind(console);
        console[level] = (...args) => {
          original(...args);
          activeCapture?.push(level, args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeJson(a))).join(' '));
        };
      }
    }
    activeCapture = this;
  }

  close() {
    if (activeCapture === this) activeCapture = null;
    this.listeners.clear();
    this.stream.end();
  }

  push(level, text) {
    const line = { time: Date.now(), level, text };
    this.lines.push(line);
    if (this.lines.length > this.limit) this.lines.shift();
    this.stream.write(`${new Date(line.time).toISOString()} [${level}] ${text}\n`);
    for (const fn of this.listeners) fn(line);
  }

  tail(n = 300) {
    return this.lines.slice(-n);
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
