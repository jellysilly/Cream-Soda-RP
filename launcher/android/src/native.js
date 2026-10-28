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

/** Sends a message and resolves with the first reply of the given event. */
export function askNode(eventName, replyEvent, arg) {
  return new Promise((resolve) => {
    let handle;
    Promise.resolve(
      NodeJS.addListener(replyEvent, (event) => {
        handle?.remove();
        resolve(event.args[0]);
      }),
    ).then((h) => (handle = h));
    sendToNode(eventName, arg);
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

// ───────── Files ─────────

/** Copies a file from the app's private data into Downloads/Cream Soda (MainActivity bridge). */
export function exportFile(path, name, mime) {
  const bridge = window.CreamSodaAndroid;
  if (!bridge?.exportFile) throw new Error('Сохранение файлов недоступно в этой сборке');
  const res = String(bridge.exportFile(path, name, mime));
  if (res.startsWith('error:')) throw new Error(res.slice(6));
  return res;
}
