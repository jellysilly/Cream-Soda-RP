import type { ChatMessage, Lorebook, Role, WISettings, WITimedState, WorldEntry } from './types';
import { parseRegex } from './regex';
import { escapeRegex } from './utils';
import { countTokens } from './tokenizer';
import { t } from './i18n';

export const POSITION_LABELS: Record<number, string> = {
  0: t('Before the character card'),
  1: t('After the character card'),
  2: t("Author's note · top"),
  3: t("Author's note · bottom"),
  4: t('At depth in the chat'),
  5: t('Before dialogue examples'),
  6: t('After dialogue examples'),
  7: t('Into an outlet {{outlet::name}}'),
};

export const LOGIC_LABELS: Record<number, string> = {
  0: t('AND any of'),
  1: t('NOT all of'),
  2: t('NONE of'),
  3: t('AND all of'),
};

export interface WIEntryRef extends WorldEntry {
  bookId: string;
  bookName: string;
}

export interface WIResult {
  before: string;
  after: string;
  anTop: string[];
  anBottom: string[];
  depth: { content: string; depth: number; role: Role; order: number }[];
  emTop: string[];
  emBottom: string[];
  outlets: Record<string, string>;
  activated: WIEntryRef[];
  waiting: WIEntryRef[];
  tokens: number;
  timed: WITimedState;
}

interface ScanOptions {
  settings: WISettings;
  books: Lorebook[];
  messages: ChatMessage[];
  /** Total context budget, used for the WI budget percentage. */
  contextSize: number;
  /** Extra text that is always scanned (e.g. the user's pending input). */
  extraScan?: string[];
  timed?: WITimedState;
  macro?: (s: string) => string;
  /** Deterministic randomness for tests. */
  random?: () => number;
}

function keyMatcher(key: string, caseSensitive: boolean, wholeWords: boolean): (text: string) => boolean {
  const k = key.trim();
  if (!k) return () => false;
  if (/^\/[\s\S]+\/[dgimsuvy]*$/.test(k)) {
    const re = parseRegex(k);
    if (!re) return () => false;
    return (text) => {
      re.lastIndex = 0;
      return re.test(text);
    };
  }
  if (wholeWords && !/\s/.test(k)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(k)}(?![\\p{L}\\p{N}_])`, caseSensitive ? 'u' : 'iu');
    return (text) => re.test(text);
  }
  if (caseSensitive) return (text) => text.includes(k);
  const lower = k.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}

function entryMatches(e: WorldEntry, text: string, s: WISettings): { primary: boolean; full: boolean } {
  const cs = e.caseSensitive ?? s.caseSensitive;
  const ww = e.matchWholeWords ?? s.matchWholeWords;
  const primary = e.keys.some((k) => keyMatcher(k, cs, ww)(text));
  if (!primary) return { primary: false, full: false };
  const sec = e.secondaryKeys.filter((k) => k.trim());
  if (!sec.length) return { primary: true, full: true };
  const hits = sec.map((k) => keyMatcher(k, cs, ww)(text));
  const any = hits.some(Boolean);
  const all = hits.every(Boolean);
  let ok = false;
  switch (e.selectiveLogic) {
    case 0:
      ok = any;
      break;
    case 1:
      ok = !all;
      break;
    case 2:
      ok = !any;
      break;
    case 3:
      ok = all;
      break;
  }
  return { primary: true, full: ok };
}

function scanText(messages: ChatMessage[], depth: number, includeNames: boolean): string {
  const visible = messages.filter((m) => !m.hidden);
  return visible
    .slice(-Math.max(0, depth))
    .map((m) => (includeNames ? `${m.name}: ${m.text}` : m.text))
    .join('\n');
}

export function collectEntries(books: Lorebook[]): WIEntryRef[] {
  const seen = new Set<string>();
  const out: WIEntryRef[] = [];
  for (const b of books) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    for (const e of b.entries) out.push({ ...e, bookId: b.id, bookName: b.name });
  }
  return out;
}

export function scanWorldInfo(o: ScanOptions): WIResult {
  const s = o.settings;
  const rnd = o.random || Math.random;
  const macro = o.macro || ((x: string) => x);
  const all = collectEntries(o.books).filter((e) => e.enabled && (e.content || '').trim());
  const turn = o.messages.length;
  const timed: WITimedState = {
    sticky: { ...(o.timed?.sticky || {}) },
    cooldown: { ...(o.timed?.cooldown || {}) },
  };

  const activated = new Map<string, WIEntryRef>();
  const waiting = new Map<string, WIEntryRef>();

  const baseText = [scanText(o.messages, s.scanDepth, s.includeNames), ...(o.extraScan || [])].join('\n');
  const textFor = (e: WorldEntry) =>
    e.scanDepth !== null && e.scanDepth !== undefined && e.scanDepth >= 0
      ? [scanText(o.messages, e.scanDepth, s.includeNames), ...(o.extraScan || [])].join('\n')
      : baseText;

  const eligible = (e: WIEntryRef) => {
    if (e.delay > 0 && turn < e.delay) return false;
    const cd = timed.cooldown[e.uid];
    if (cd !== undefined && turn < cd && !(timed.sticky[e.uid] !== undefined && turn < timed.sticky[e.uid])) return false;
    return true;
  };

  const tryActivate = (e: WIEntryRef) => {
    if (activated.has(e.uid)) return;
    if (e.useProbability && e.probability < 100 && rnd() * 100 >= e.probability) return;
    activated.set(e.uid, e);
    waiting.delete(e.uid);
  };

  // Pass 0: constants and sticky entries.
  for (const e of all) {
    if (!eligible(e)) continue;
    const stickyUntil = timed.sticky[e.uid];
    if (stickyUntil !== undefined && turn < stickyUntil) {
      activated.set(e.uid, e);
      continue;
    }
    if (e.constant) tryActivate(e);
  }

  // Pass 1: keyword scan of the chat.
  for (const e of all) {
    if (activated.has(e.uid) || e.constant || e.delayUntilRecursion || !eligible(e)) continue;
    const m = entryMatches(e, textFor(e), s);
    if (m.full) tryActivate(e);
    else if (m.primary) waiting.set(e.uid, e);
  }

  // Recursive passes: activated content can trigger more entries.
  if (s.recursive) {
    const maxSteps = s.maxRecursionSteps > 0 ? s.maxRecursionSteps : 10;
    let frontier = [...activated.values()].filter((e) => !e.preventRecursion);
    for (let step = 0; step < maxSteps && frontier.length; step++) {
      const recText = frontier.map((e) => e.content).join('\n');
      const added: WIEntryRef[] = [];
      for (const e of all) {
        if (activated.has(e.uid) || e.excludeRecursion || e.constant || !eligible(e)) continue;
        const m = entryMatches(e, recText, s);
        if (m.full) {
          tryActivate(e);
          if (activated.has(e.uid)) added.push(e);
        } else if (m.primary && !waiting.has(e.uid)) waiting.set(e.uid, e);
      }
      frontier = added.filter((e) => !e.preventRecursion);
    }
  }

  // Inclusion groups: only one entry per group survives.
  const groups = new Map<string, WIEntryRef[]>();
  for (const e of activated.values()) {
    if (!e.group?.trim()) continue;
    for (const g of e.group.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(e);
    }
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let winner: WIEntryRef;
    const overrides = members.filter((m) => m.groupOverride);
    if (overrides.length) winner = overrides.sort((a, b) => b.order - a.order)[0];
    else {
      const total = members.reduce((acc, m) => acc + Math.max(1, m.groupWeight || 100), 0);
      let r = rnd() * total;
      winner = members[members.length - 1];
      for (const m of members) {
        r -= Math.max(1, m.groupWeight || 100);
        if (r <= 0) {
          winner = m;
          break;
        }
      }
    }
    for (const m of members) if (m !== winner) activated.delete(m.uid);
  }

  // Budget: constants first, then higher order.
  const budget = Math.min(
    Math.floor((o.contextSize * Math.max(1, s.budgetPercent)) / 100),
    s.budgetCap > 0 ? s.budgetCap : Infinity,
  );
  const prioritized = [...activated.values()].sort((a, b) => Number(b.constant) - Number(a.constant) || b.order - a.order);
  const kept: { e: WIEntryRef; content: string }[] = [];
  let used = 0;
  for (const e of prioritized) {
    const content = macro(e.content).trim();
    const tokens = countTokens(content);
    if (used + tokens > budget && kept.length) continue;
    used += tokens;
    kept.push({ e, content });
  }

  // Timed effects bookkeeping for the next turn.
  for (const { e } of kept) {
    if (e.sticky > 0 && !(timed.sticky[e.uid] !== undefined && turn < timed.sticky[e.uid])) timed.sticky[e.uid] = turn + e.sticky;
    if (e.cooldown > 0) {
      const stickyEnd = timed.sticky[e.uid] ?? turn;
      if (!(timed.cooldown[e.uid] !== undefined && turn < timed.cooldown[e.uid])) timed.cooldown[e.uid] = Math.max(stickyEnd, turn) + e.cooldown;
    }
  }

  const byOrder = [...kept].sort((a, b) => a.e.order - b.e.order);
  const pick = (pos: number) => byOrder.filter((k) => k.e.position === pos).map((k) => k.content);
  const outlets: Record<string, string> = {};
  for (const k of byOrder.filter((k) => k.e.position === 7)) {
    const name = k.e.outletName || 'default';
    outlets[name] = outlets[name] ? `${outlets[name]}\n${k.content}` : k.content;
  }

  return {
    before: pick(0).join('\n'),
    after: pick(1).join('\n'),
    anTop: pick(2),
    anBottom: pick(3),
    depth: byOrder.filter((k) => k.e.position === 4).map((k) => ({ content: k.content, depth: k.e.depth, role: k.e.role, order: k.e.order })),
    emTop: pick(5),
    emBottom: pick(6),
    outlets,
    activated: kept.map((k) => k.e),
    waiting: [...waiting.values()].filter((e) => !activated.has(e.uid)),
    tokens: used,
    timed,
  };
}
