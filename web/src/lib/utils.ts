export function uid(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const nf = new Intl.NumberFormat('ru-RU');
export function fmtNum(n: number): string {
  return nf.format(Math.round(n || 0));
}

/** 32768 → 32k, 6412 → 6,4k */
export function fmtK(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k >= 10 ? Math.floor(k) : k.toFixed(1).replace('.', ',').replace(',0', '')}k`;
}

export function fmtTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `сегодня, ${fmtTime(ts)}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${fmtTime(ts)}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  const wrapped = ((...args: any[]) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs;
      lastArgs = null;
      fn(...(a || []));
    }, ms);
  }) as T & { flush: () => void; cancel: () => void };
  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      const a = lastArgs;
      lastArgs = null;
      fn(...(a || []));
    }
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  return wrapped;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface AndroidFiles {
  saveBase64(data: string, name: string, mime: string): string;
}

/** Present inside the Android app, whose WebView ignores <a download>. */
function androidFiles(): AndroidFiles | undefined {
  return (window as unknown as { CreamSodaAndroid?: AndroidFiles }).CreamSodaAndroid;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function download(name: string, data: BlobPart | Blob, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const android = androidFiles();
  if (android) {
    // The app shows its own toast with where the file went (or why it failed).
    blobToBase64(blob).then((b64) => android.saveBase64(b64, name, blob.type || type));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(Array.from(input.files || []));
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function readFileText(file: Blob): Promise<string> {
  return file.text();
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function safeFileName(name: string): string {
  return (name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80).trim() || 'file';
}

/** Katakana-ish decorative watermark for cards, derived from a name. */
const KANA_SYLLABLES: [RegExp, string][] = [
  [/^(shi|ши)/i, 'シ'], [/^(chi|чи)/i, 'チ'], [/^(tsu|цу)/i, 'ツ'], [/^(ka|ка)/i, 'カ'], [/^(ki|ки)/i, 'キ'], [/^(ku|ку)/i, 'ク'], [/^(ke|ке)/i, 'ケ'], [/^(ko|ко)/i, 'コ'],
  [/^(sa|са)/i, 'サ'], [/^(su|су)/i, 'ス'], [/^(se|се)/i, 'セ'], [/^(so|со)/i, 'ソ'], [/^(ta|та)/i, 'タ'], [/^(te|те)/i, 'テ'], [/^(to|то)/i, 'ト'],
  [/^(na|на)/i, 'ナ'], [/^(ni|ни)/i, 'ニ'], [/^(nu|ну)/i, 'ヌ'], [/^(ne|не)/i, 'ネ'], [/^(no|но)/i, 'ノ'], [/^(ha|ха)/i, 'ハ'], [/^(hi|хи)/i, 'ヒ'],
  [/^(fu|фу)/i, 'フ'], [/^(he|хе)/i, 'ヘ'], [/^(ho|хо)/i, 'ホ'], [/^(ma|ма)/i, 'マ'], [/^(mi|ми)/i, 'ミ'], [/^(mu|му)/i, 'ム'], [/^(me|ме)/i, 'メ'],
  [/^(mo|мо)/i, 'モ'], [/^(ya|я)/i, 'ヤ'], [/^(yu|ю)/i, 'ユ'], [/^(yo|ё|йо)/i, 'ヨ'], [/^(ra|ла|ра)/i, 'ラ'], [/^(ri|ли|ри)/i, 'リ'], [/^(ru|лу|ру)/i, 'ル'],
  [/^(re|ле|ре)/i, 'レ'], [/^(ro|ло|ро)/i, 'ロ'], [/^(wa|ва)/i, 'ワ'], [/^(ga|га)/i, 'ガ'], [/^(gi|ги)/i, 'ギ'], [/^(gu|гу)/i, 'グ'], [/^(ge|ге)/i, 'ゲ'],
  [/^(go|го)/i, 'ゴ'], [/^(za|за)/i, 'ザ'], [/^(ji|дзи|джи)/i, 'ジ'], [/^(zu|зу)/i, 'ズ'], [/^(da|да)/i, 'ダ'], [/^(de|де)/i, 'デ'], [/^(do|до)/i, 'ド'],
  [/^(ba|ба)/i, 'バ'], [/^(bi|би)/i, 'ビ'], [/^(bu|бу)/i, 'ブ'], [/^(be|бе)/i, 'ベ'], [/^(bo|бо)/i, 'ボ'], [/^(pa|па)/i, 'パ'], [/^(pi|пи)/i, 'ピ'],
  [/^(pu|пу)/i, 'プ'], [/^(pe|пе)/i, 'ペ'], [/^(po|по)/i, 'ポ'], [/^(a|а)/i, 'ア'], [/^(i|и|ы)/i, 'イ'], [/^(u|у)/i, 'ウ'], [/^(e|э|е)/i, 'エ'],
  [/^(o|о)/i, 'オ'], [/^(n|н|м|m)/i, 'ン'],
];

export function toKana(name: string, max = 4): string {
  const words = (name || '').trim().split(/[\s\-·]+/).filter((w) => /\p{L}/u.test(w));
  let s = (words[words.length - 1] || '').toLowerCase().replace(/э/g, 'е').replace(/[ьъ]/g, '');
  let out = '';
  while (s && out.length < max) {
    const hit = KANA_SYLLABLES.find(([re]) => re.test(s));
    if (hit) {
      out += hit[1];
      s = s.replace(hit[0], '');
    } else s = s.slice(1);
  }
  return out || 'ソーダ';
}

export function initialKana(name: string): string {
  return toKana(name, 1);
}

/** Card palettes from the design (gradient + avatar orb + text colour). */
export const PALETTES = [
  { bg: 'linear-gradient(160deg, #FFC2D8, #F58BB5)', orb: 'radial-gradient(circle at 35% 30%, #FFF6E3, #FFC2D8 55%, #F58BB5)', ink: '#6E0C35' },
  { bg: 'linear-gradient(160deg, #CDE9FA, #86C6EC)', orb: 'radial-gradient(circle at 35% 30%, #F2FBFF, #A9DBF7 60%, #86C6EC)', ink: '#1F4E70' },
  { bg: 'linear-gradient(160deg, #FFF0D6, #E8B66C)', orb: 'radial-gradient(circle at 35% 30%, #FFFBEF, #F3DDB0 60%, #E8B66C)', ink: '#7A3E17' },
  { bg: 'linear-gradient(160deg, #D9F7EC, #5FE0BA)', orb: 'radial-gradient(circle at 35% 30%, #F0FFF9, #A8EFD6 60%, #2ED8A6)', ink: '#0B5C46' },
  { bg: 'linear-gradient(160deg, #F0E6FB, #B08AE0)', orb: 'radial-gradient(circle at 35% 30%, #FFFFFF, #F3ECFC 60%, #D3BDF0)', ink: '#4E2A7A' },
];

export function paletteFor(index: number | undefined, seed = ''): (typeof PALETTES)[number] {
  if (typeof index === 'number' && index >= 0) return PALETTES[index % PALETTES.length];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isMobile(): boolean {
  return window.matchMedia('(max-width: 760px)').matches;
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function splitKeys(s: string): string[] {
  return s
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

export function byOrder<T extends { order?: number }>(a: T, b: T) {
  return (a.order ?? 0) - (b.order ?? 0);
}
