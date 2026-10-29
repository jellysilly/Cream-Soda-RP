import type { ChatMessage } from './types';
import { t } from './i18n';

/**
 * SillyTavern-compatible macro engine: {{user}}, {{char}}, {{random::a::b}},
 * {{roll:2d6}}, {{setvar::name::value}}, {{time}}, {{// comment}} and friends.
 */
export interface MacroEnv {
  user: string;
  char: string;
  group?: string;
  groupNotMuted?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  persona?: string;
  mesExamples?: string;
  mesExamplesRaw?: string;
  charPrompt?: string;
  charInstruction?: string;
  charVersion?: string;
  creatorNotes?: string;
  charDepthPrompt?: string;
  model?: string;
  input?: string;
  original?: string;
  maxPrompt?: number;
  messages?: ChatMessage[];
  chatId?: string;
  idleSince?: number;
  lastGenerationType?: string;
  /** Mutable variable stores; setvar macros write into them. */
  localVars?: Record<string, string>;
  globalVars?: Record<string, string>;
  onVarsChanged?: () => void;
  extra?: Record<string, string>;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number) {
  let m = seed + 0x6d2b79f5;
  m = Math.imul(m ^ (m >>> 15), m | 1);
  m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
  return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
}

function splitList(raw: string): string[] {
  if (raw.startsWith('::')) return raw.slice(2).split('::');
  const body = raw.startsWith(':') ? raw.slice(1) : raw;
  // Commas can be escaped as \, inside the list.
  return body
    .replace(/\\,/g, '\u0000')
    .split(',')
    .map((s) => s.replace(/\u0000/g, ',').trim());
}

export function rollDice(expr: string): { total: number; detail: string } | null {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr.trim().replace(/^(\d+)$/, '1d$1'));
  if (!m) return null;
  const count = Math.min(100, Number(m[1] || 1));
  const sides = Math.max(1, Math.min(1000, Number(m[2])));
  const mod = m[3] ? Number(m[3].replace(/\s+/g, '')) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  return { total, detail: `${rolls.join(' + ')}${mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : ''}` };
}

function lastBy(messages: ChatMessage[] | undefined, pred: (m: ChatMessage) => boolean): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) if (pred(messages[i])) return messages[i].text;
  return '';
}

/** For {{idle_duration}}: English, like everything else that reaches the model. */
function humanizeDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (min < 60) return unit(min, 'minute');
  const h = Math.round(min / 60);
  if (h < 24) return unit(h, 'hour');
  return unit(Math.round(h / 24), 'day');
}

function formatDate(fmt: string, d = new Date()): string {
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    hh: pad(d.getHours() % 12 || 12),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
    dddd: d.toLocaleDateString('en-US', { weekday: 'long' }),
    MMMM: d.toLocaleDateString('en-US', { month: 'long' }),
  };
  return fmt.replace(/YYYY|YY|MMMM|MM|DD|dddd|HH|hh|mm|ss/g, (token) => map[token] ?? token);
}

function varOp(store: Record<string, string> | undefined, op: string, name: string, value: string, env: MacroEnv): string {
  if (!store) return '';
  const cur = store[name] ?? '';
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  switch (op) {
    case 'get':
      return cur;
    case 'set':
      store[name] = value;
      env.onVarsChanged?.();
      return '';
    case 'add': {
      const isNum = cur === '' || Number.isFinite(Number(cur));
      store[name] = isNum && Number.isFinite(Number(value)) ? String(num(cur) + Number(value)) : cur + value;
      env.onVarsChanged?.();
      return '';
    }
    case 'inc':
      store[name] = String(num(cur) + 1);
      env.onVarsChanged?.();
      return store[name];
    case 'dec':
      store[name] = String(num(cur) - 1);
      env.onVarsChanged?.();
      return store[name];
    default:
      return '';
  }
}

export function substituteMacros(input: string, env: MacroEnv): string {
  if (!input || !input.includes('{{') && !/<(USER|BOT|CHAR)>/i.test(input)) return input;
  let text = input;

  // Legacy Tavern placeholders.
  text = text.replace(/<USER>/gi, '{{user}}').replace(/<BOT>|<CHAR>/gi, '{{char}}');
  // Comments vanish entirely.
  text = text.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');
  text = text.replace(/\{\{banned\s+"[\s\S]*?"\}\}/gi, '');

  // Variables are evaluated left to right so setvar affects later getvar.
  text = text.replace(
    /\{\{(get|set|add|inc|dec)(global)?var::([^:}]+?)(?:::([\s\S]*?))?\}\}/gi,
    (_, op: string, global: string, name: string, value = '') => {
      const store = global ? env.globalVars : env.localVars;
      return varOp(store, op.toLowerCase(), name.trim(), value, env);
    },
  );

  const messages = env.messages || [];
  const now = new Date();
  const simple: Record<string, () => string> = {
    user: () => env.user,
    char: () => env.char,
    group: () => env.group || env.char,
    groupnotmuted: () => env.groupNotMuted || env.group || env.char,
    charifnotgroup: () => (env.group ? env.group : env.char),
    description: () => env.description || '',
    personality: () => env.personality || '',
    scenario: () => env.scenario || '',
    persona: () => env.persona || '',
    mesexamples: () => env.mesExamples || '',
    mesexamplesraw: () => env.mesExamplesRaw || env.mesExamples || '',
    charprompt: () => env.charPrompt || '',
    charinstruction: () => env.charInstruction || '',
    charjailbreak: () => env.charInstruction || '',
    charversion: () => env.charVersion || '',
    char_version: () => env.charVersion || '',
    creatornotes: () => env.creatorNotes || '',
    chardepthprompt: () => env.charDepthPrompt || '',
    model: () => env.model || '',
    input: () => env.input || '',
    original: () => env.original || '',
    maxprompt: () => String(env.maxPrompt || ''),
    lastmessage: () => lastBy(messages, () => true),
    lastmessageid: () => String(Math.max(0, messages.length - 1)),
    lastusermessage: () => lastBy(messages, (m) => m.role === 'user'),
    lastcharmessage: () => lastBy(messages, (m) => m.role === 'char'),
    lastchatmessage: () => lastBy(messages, () => true),
    firstincludedmessageid: () => '0',
    currentswipeid: () => String((messages[messages.length - 1]?.swipeId ?? 0) + 1),
    lastswipeid: () => String(messages[messages.length - 1]?.swipes.length ?? 0),
    lastgenerationtype: () => env.lastGenerationType || 'normal',
    time: () => now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    date: () => now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
    weekday: () => now.toLocaleDateString('en-US', { weekday: 'long' }),
    isotime: () => formatDate('HH:mm', now),
    isodate: () => formatDate('YYYY-MM-DD', now),
    idle_duration: () => (env.idleSince ? humanizeDuration(Date.now() - env.idleSince) : 'just now'),
    newline: () => '\n',
    noop: () => '',
    space: () => ' ',
  };

  let occurrence = 0;
  const seedBase = env.chatId || 'cream-soda';
  for (let pass = 0; pass < 4; pass++) {
    const before = text;
    text = text.replace(/\{\{([^{}]*?)\}\}/g, (whole, inner: string) => {
      const raw = inner.trim();
      const lower = raw.toLowerCase();
      if (lower in simple) return simple[lower]();
      if (env.extra && raw in env.extra) return env.extra[raw];

      let m = /^random\s*(::?[\s\S]*)$/i.exec(raw);
      if (m) {
        const list = splitList(m[1]);
        return list[Math.floor(Math.random() * list.length)] ?? '';
      }
      m = /^pick\s*(::?[\s\S]*)$/i.exec(raw);
      if (m) {
        const list = splitList(m[1]);
        const r = seededRandom(hashString(`${seedBase}|${raw}|${occurrence++}`));
        return list[Math.floor(r * list.length)] ?? '';
      }
      m = /^roll[:\s]+(.+)$/i.exec(raw);
      if (m) return String(rollDice(m[1])?.total ?? '');
      m = /^reverse:([\s\S]*)$/i.exec(raw);
      if (m) return Array.from(m[1]).reverse().join('');
      m = /^datetimeformat\s+(.+)$/i.exec(raw);
      if (m) return formatDate(m[1], now);
      m = /^time_utc([+-]\d+)$/i.exec(raw);
      if (m) {
        const d = new Date(Date.now() + Number(m[1]) * 3600000);
        return d.toISOString().slice(11, 16);
      }
      if (lower === 'trim') return '\u0001TRIM\u0001';
      return whole;
    });
    if (text === before) break;
  }

  if (text.includes('\u0001TRIM\u0001')) text = text.replace(/\s*\u0001TRIM\u0001\s*/g, '');
  return text;
}

export const MACRO_HELP: { name: string; desc: string }[] = [
  { name: '{{user}}', desc: t("player's persona name") },
  { name: '{{char}}', desc: t('character name') },
  { name: '{{description}} · {{personality}} · {{scenario}}', desc: t('card fields') },
  { name: '{{persona}}', desc: t('persona description') },
  { name: '{{mesExamples}}', desc: t('dialogue examples') },
  { name: '{{lastMessage}} · {{lastUserMessage}} · {{lastCharMessage}}', desc: t('latest messages') },
  { name: '{{time}} · {{date}} · {{weekday}}', desc: t('current time and date') },
  { name: t('{{random::a::b::c}}'), desc: t('a random option on every generation') },
  { name: t('{{pick::a::b}}'), desc: t('an option that stays the same within the chat') },
  { name: '{{roll:2d6+1}}', desc: t('dice roll') },
  { name: t('{{setvar::name::value}} · {{getvar::name}}'), desc: t('chat variables') },
  { name: t('{{addvar::name::1}} · {{incvar::name}} · {{decvar::name}}'), desc: t('variable arithmetic') },
  { name: '{{setglobalvar::…}} · {{getglobalvar::…}}', desc: t('global variables') },
  { name: '{{idle_duration}}', desc: t('time since the last message') },
  { name: t('{{// comment}}'), desc: t('removed from the prompt') },
  { name: '{{trim}} · {{newline}}', desc: t('whitespace control') },
];
