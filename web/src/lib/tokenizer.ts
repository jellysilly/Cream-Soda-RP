import { create } from 'zustand';

/**
 * Token counting. The real BPE tables (o200k / cl100k) are big, so they are loaded
 * lazily; until then a character-based estimate is used. Counts are cached.
 */
type Encoder = { countTokens: (text: string) => number };

export const useTokenizer = create<{ version: number; kind: string }>(() => ({ version: 0, kind: 'estimate' }));

let encoder: Encoder | null = null;
let loading: Promise<void> | null = null;
const cache = new Map<string, number>();
const CACHE_LIMIT = 4000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cyr = 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0400 && c <= 0x04ff) cyr++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) cjk++;
    else other++;
  }
  return Math.ceil(cyr / 3.4 + cjk / 1.1 + other / 3.9);
}

export function loadTokenizer(kind: 'auto' | 'o200k' | 'cl100k' | 'estimate' = 'auto'): Promise<void> {
  if (kind === 'estimate') {
    encoder = null;
    cache.clear();
    useTokenizer.setState((s) => ({ version: s.version + 1, kind: 'estimate' }));
    return Promise.resolve();
  }
  if (loading) return loading;
  loading = (kind === 'cl100k' ? import('gpt-tokenizer/encoding/cl100k_base') : import('gpt-tokenizer/encoding/o200k_base'))
    .then((mod) => {
      encoder = { countTokens: (t: string) => mod.countTokens(t) };
      cache.clear();
      useTokenizer.setState((s) => ({ version: s.version + 1, kind: kind === 'cl100k' ? 'cl100k' : 'o200k' }));
    })
    .catch(() => {
      encoder = null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  if (!encoder) return estimateTokens(text);
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let n: number;
  try {
    n = encoder.countTokens(text);
  } catch {
    n = estimateTokens(text);
  }
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(text, n);
  return n;
}

/** Rough per-message overhead of chat formats (role markers etc). */
export const MESSAGE_OVERHEAD = 4;

export function countMessages(messages: { content: string | unknown }[]): number {
  let total = 3;
  for (const m of messages) {
    total += MESSAGE_OVERHEAD + countTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
  }
  return total;
}
