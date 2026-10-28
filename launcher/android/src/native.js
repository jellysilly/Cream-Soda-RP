/**
 * Thin wrappers over the Capacitor plugins the launcher uses, so main.js only
 * deals with plain async functions.
 */
import { NodeJS } from 'capacitor-nodejs';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

// ───────── Node.js runtime ─────────

export const engineReady = () => NodeJS.whenReady();

export function sendToNode(eventName, arg) {
  return NodeJS.send({ eventName, args: arg === undefined ? [] : [arg] });
}

export function onNode(eventName, fn) {
  return NodeJS.addListener(eventName, (event) => fn(event.args[0]));
}

/** Sends a message and resolves with the first reply of the given event (rejects after `timeoutMs`). */
export function askNode(eventName, replyEvent, arg, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let handle;
    const done = () => {
      clearTimeout(timer);
      handle?.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('Node.js не ответил'));
    }, timeoutMs);
    Promise.resolve(
      NodeJS.addListener(replyEvent, (event) => {
        done();
        resolve(event.args[0]);
      }),
    ).then((h) => (handle = h));
    sendToNode(eventName, arg).catch((err) => {
      done();
      reject(err);
    });
  });
}

// ───────── Background work and screen ─────────

const NOTIFICATION_ID = 8000;

export async function setBackground(enabled) {
  if (!enabled) {
    await ForegroundService.stopForegroundService().catch(() => {});
    return true;
  }
  const perm = await ForegroundService.checkPermissions().catch(() => ({ display: 'granted' }));
  if (perm.display !== 'granted') {
    const req = await ForegroundService.requestPermissions().catch(() => ({ display: 'denied' }));
    if (req.display !== 'granted') return false;
  }
  await ForegroundService.startForegroundService({
    id: NOTIFICATION_ID,
    title: 'Cream Soda',
    body: 'Сервер работает — чаты доступны',
    smallIcon: 'ic_stat_soda',
    silent: true,
  });
  return true;
}

export async function setKeepAwake(enabled) {
  if (enabled) await KeepAwake.keepAwake();
  else await KeepAwake.allowSleep();
}

// ───────── QR scanner ─────────

/**
 * Scans a QR code with Google's code scanner (no camera permission needed).
 * Resolves with the text, null when cancelled, or throws 'unavailable'.
 */
export async function scanQr() {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: false }));
  if (!available) {
    // Starts a background download from Google Play services; works on the next try.
    await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
    const err = new Error('unavailable');
    err.code = 'unavailable';
    throw err;
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue || null;
  } catch (err) {
    if (/cancel/i.test(err?.message || '')) return null;
    throw err;
  }
}

// ───────── Files and logs ─────────

const LOG_TAGS = /^\S+ \S+ [VDIWEF]\/(NodeJS-Engine|CreamSoda\/Node|Capacitor[^(]*|AndroidRuntime|System\.err|DEBUG|libc|linker)\s*\(/;

/** This app's Android log (Node.js output, plugin and crash messages), or '' outside the app. */
export function readSystemLog(maxLines = 400) {
  const bridge = window.CreamSodaAndroid;
  if (!bridge?.readLogs) return '';
  const raw = String(bridge.readLogs());
  if (raw.startsWith('error:')) return `Не удалось прочитать журнал Android: ${raw.slice(6)}`;
  const lines = raw.split('\n').filter((line) => LOG_TAGS.test(line));
  return lines.slice(-maxLines).join('\n');
}

/** Saves text into Downloads/Cream Soda (MainActivity bridge) and returns where it went. */
export function saveText(name, text) {
  const bridge = window.CreamSodaAndroid;
  if (!bridge?.saveBase64) throw new Error('Сохранение файлов недоступно в этой сборке');
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const res = String(bridge.saveBase64(btoa(binary), name, 'text/plain'));
  if (res.startsWith('error:')) throw new Error(res.slice(6));
  return res;
}

/** Copies a file from the app's private data into Downloads/Cream Soda (MainActivity bridge). */
export function exportFile(path, name, mime) {
  const bridge = window.CreamSodaAndroid;
  if (!bridge?.exportFile) throw new Error('Сохранение файлов недоступно в этой сборке');
  const res = String(bridge.exportFile(path, name, mime));
  if (res.startsWith('error:')) throw new Error(res.slice(6));
  return res;
}
