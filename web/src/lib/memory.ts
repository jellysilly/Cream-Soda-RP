import { prompt } from './prompts';
import type { Chat, ChatMessage, MemoryBook, MemoryChapter, Settings } from './types';
import { countTokens } from './tokenizer';
import { t } from './i18n';

/** Index range [from, to] of a chapter inside the chat, or null if its messages are gone. */
export function chapterRange(chat: Chat, ch: MemoryChapter): [number, number] | null {
  const from = chat.messages.findIndex((m) => m.id === ch.fromId);
  const to = chat.messages.findIndex((m) => m.id === ch.toId);
  if (from === -1 || to === -1) return null;
  return [Math.min(from, to), Math.max(from, to)];
}

export function chapterLabel(chat: Chat, ch: MemoryChapter): string {
  const r = chapterRange(chat, ch);
  return r ? `#${r[0] + 1}–${r[1] + 1}` : '#?';
}

/** Messages after the last summarised chapter — the chapter being written now. */
export function pendingRange(chat: Chat): { start: number; count: number } {
  let start = 0;
  for (const ch of chat.meta.memory?.chapters || []) {
    if (ch.status !== 'memory') continue;
    const r = chapterRange(chat, ch);
    if (r) start = Math.max(start, r[1] + 1);
  }
  return { start, count: Math.max(0, chat.messages.length - start) };
}

export function chapterNumber(memory: MemoryBook | undefined): number {
  return (memory?.chapters.filter((c) => c.status === 'memory').length || 0) + 1;
}

function keyHit(keys: string[], text: string): boolean {
  const low = text.toLowerCase();
  return keys.some((k) => k.trim() && low.includes(k.trim().toLowerCase()));
}

/**
 * Builds the «Memory Book» prompt block: summaries of finished chapters (brief or
 * full when their keys appear in recent messages) plus pinned facts, within budget.
 */
export function buildMemoryText(chat: Chat, settings: Settings['memory'], recentText: string): { text: string; tokens: number } {
  const mem = chat.meta.memory;
  if (!mem) return { text: '', tokens: 0 };
  const chapters = mem.chapters
    .filter((c) => c.status === 'memory' && c.insertion !== 'off' && c.summary.trim())
    .filter((c) => c.insertion === 'always' || keyHit(c.keys, recentText));
  const facts = mem.facts.filter((f) => f.enabled && f.text.trim());
  if (!chapters.length && !facts.length) return { text: '', tokens: 0 };

  // Keep the most important (then most recent) chapters within the budget.
  const ranked = chapters
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.importance - a.c.importance || b.i - a.i);
  const budget = Math.max(100, settings.budget || 1500);
  const factsText = facts.map((f) => `- ${f.text.trim()}`).join('\n');
  let used = countTokens(factsText);
  const keep = new Set<string>();
  for (const { c } of ranked) {
    const tokens = countTokens(c.summary) + 8;
    if (used + tokens > budget) continue;
    used += tokens;
    keep.add(c.id);
  }
  const chaptersText = chapters
    .filter((c) => keep.has(c.id))
    .map((c, i) => `Chapter ${i + 1} · "${c.title}": ${c.summary.trim()}`)
    .join('\n');
  const text = prompt('memoryBlock', { chapters: chaptersText || '—', facts: factsText || '—' }).trim();
  return { text, tokens: countTokens(text) };
}

export function memoryTokens(chat: Chat): number {
  const mem = chat.meta.memory;
  if (!mem) return 0;
  return (
    mem.chapters.filter((c) => c.status === 'memory' && c.insertion !== 'off').reduce((a, c) => a + countTokens(c.summary), 0) +
    mem.facts.filter((f) => f.enabled).reduce((a, f) => a + countTokens(f.text), 0)
  );
}

export function messagesToTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((m) => !m.hidden)
    .map((m) => `${m.name}: ${m.text}`)
    .join('\n\n');
}

/** Parses «Title: … / Summary: … / Keys: …» answers, also the Russian labels of older prompts (tolerant to formatting). */
export function parseSummary(text: string): { title: string; summary: string; keys: string[] } {
  const clean = text.replace(/\*\*/g, '');
  const grab = (label: RegExp) => {
    const m = label.exec(clean);
    return m ? m[1].trim() : '';
  };
  const title = grab(/(?:название|title)\s*[:：]\s*(.+)/i);
  const keysRaw = grab(/(?:ключи|keys|ключевые слова)\s*[:：]\s*(.+)/i);
  let summary = '';
  const sm = /(?:конспект|summary)\s*[:：]\s*([\s\S]+?)(?:\n\s*(?:ключи|keys|ключевые слова)\s*[:：]|$)/i.exec(clean);
  if (sm) summary = sm[1].trim();
  if (!summary) summary = clean.replace(/(?:название|title)\s*[:：].+/i, '').replace(/(?:ключи|keys)\s*[:：].+/i, '').trim();
  return {
    title: title.replace(/^[«"]|[»"]$/g, '') || t('Untitled'),
    summary,
    keys: keysRaw
      .split(/[,;]/)
      .map((k) => k.trim().replace(/\.$/, ''))
      .filter(Boolean)
      .slice(0, 8),
  };
}

export function parseFacts(text: string): string[] {
  if (/^\s*(?:нет|none|no)\.?\s*$/i.test(text)) return [];
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim())
    .filter((l) => l.length > 3 && !/^(?:нет|none)\.?$/i.test(l))
    .slice(0, 5);
}
