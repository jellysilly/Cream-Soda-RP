import { t } from './i18n';
/** Minimal PNG text-chunk reader/writer used for character cards (chara / ccv3). */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunk[] {
  if (!isPng(bytes)) throw new Error(t('This is not a PNG file'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const data = bytes.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

/** Returns tEXt (and uncompressed iTXt) keyword → text. */
export function readTextChunks(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of readChunks(bytes)) {
    if (c.type === 'tEXt') {
      const zero = c.data.indexOf(0);
      if (zero <= 0) continue;
      out[latin1(c.data.subarray(0, zero))] = latin1(c.data.subarray(zero + 1));
    } else if (c.type === 'iTXt') {
      const zero = c.data.indexOf(0);
      if (zero <= 0) continue;
      const key = latin1(c.data.subarray(0, zero));
      const compressed = c.data[zero + 1];
      if (compressed) continue;
      let p = zero + 3;
      p = c.data.indexOf(0, p) + 1; // language tag
      p = c.data.indexOf(0, p) + 1; // translated keyword
      out[key] = new TextDecoder().decode(c.data.subarray(p));
    }
  }
  return out;
}

function b64decodeUtf8(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Extracts the card JSON from a PNG (prefers V3 «ccv3», falls back to V2 «chara»). */
export function extractCardJson(bytes: Uint8Array): unknown | null {
  const text = readTextChunks(bytes);
  const raw = text.ccv3 || text.chara;
  if (!raw) return null;
  try {
    return JSON.parse(b64decodeUtf8(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function textChunk(keyword: string, text: string): Uint8Array {
  const data = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) data[i] = keyword.charCodeAt(i);
  data[keyword.length] = 0;
  for (let i = 0; i < text.length; i++) data[keyword.length + 1 + i] = text.charCodeAt(i) & 0xff;
  return makeChunk('tEXt', data);
}

/** Writes card JSON into a PNG as both «chara» (V2) and «ccv3» (V3) chunks. */
export function embedCardJson(png: Uint8Array, v2: unknown, v3?: unknown): Uint8Array {
  const chunks = readChunks(png).filter((c) => !(c.type === 'tEXt' && /^(chara|ccv3)\0/.test(latin1(c.data.subarray(0, 6)))));
  const parts: Uint8Array[] = [new Uint8Array(SIGNATURE)];
  for (const c of chunks) {
    if (c.type === 'IEND') {
      parts.push(textChunk('chara', b64encodeUtf8(JSON.stringify(v2))));
      if (v3) parts.push(textChunk('ccv3', b64encodeUtf8(JSON.stringify(v3))));
    }
    parts.push(makeChunk(c.type, c.data));
  }
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Converts any image blob into PNG bytes via canvas (cards must be PNG). */
export async function toPngBytes(src: Blob | string | null, size = 512): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  if (src) {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error(t('Could not read the image')));
        i.src = url;
      });
      canvas.width = img.naturalWidth || size;
      canvas.height = img.naturalHeight || size;
      ctx.drawImage(img, 0, 0);
    } finally {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
    }
  } else {
    canvas.width = size;
    canvas.height = Math.round(size * 1.5);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#F5AEC8');
    g.addColorStop(1, '#D3EBF8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
