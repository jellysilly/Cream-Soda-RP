import { getState, setChat, toast, updateSettings, activeCharacter, activePersona, navigate } from './store';
import {
  generateReplies,
  continueMessage,
  impersonate,
  regenerateLast,
  quietGenerate,
  utilityGenerate,
  deleteMessages,
  setHidden,
  startNewChat,
  openCharacter,
  summarizeChapter,
  translateMessage,
  macroEnvFor,
} from './generate';
import { newMessage } from './defaults';
import { rollDice, substituteMacros } from './macros';
import { applyRegex, PLACEMENT } from './regex';
import { displayRegexScripts } from './generate';
import type { ImpersonateMode } from './types';
import { t } from './i18n';

/**
 * STscript-style slash commands: /send, /sys, /gen, /trigger, /setvar…
 * Commands are chained with «|»; {{pipe}} holds the previous command's result.
 */

interface Parsed {
  name: string;
  args: Record<string, string>;
  text: string;
}

function splitPipes(src: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '"') quote = !quote;
    if (ch === '|' && !quote) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCommand(raw: string): Parsed | null {
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(raw.trim());
  if (!m) return null;
  const args: Record<string, string> = {};
  let rest = m[2];
  // Leading key=value pairs (value may be quoted).
  const argRe = /^([\w-]+)=("([^"]*)"|\S+)\s*/;
  let am: RegExpExecArray | null;
  while ((am = argRe.exec(rest))) {
    args[am[1]] = am[3] !== undefined ? am[3] : am[2];
    rest = rest.slice(am[0].length);
  }
  let text = rest.trim();
  if (/^".*"$/s.test(text)) text = text.slice(1, -1);
  return { name: m[1].toLowerCase(), args, text };
}

function parseRange(spec: string, length: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const r = /^\s*(-?\d+)\s*(?:-\s*(-?\d+))?\s*$/.exec(part);
    if (!r) continue;
    let a = Number(r[1]);
    let b = r[2] !== undefined ? Number(r[2]) : a;
    if (a < 0) a = length + a;
    if (b < 0) b = length + b;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 0 && i < length) out.push(i);
  }
  return out;
}

function addMessage(role: 'user' | 'char' | 'system', name: string, text: string, extra: Record<string, unknown> = {}) {
  if (!getState().chat) throw new Error(t('No chat is open'));
  const msg = { ...newMessage({ role, name, text }), ...extra };
  setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
  return msg;
}

const vars = () => getState().chat?.meta.variables || {};
function setVar(name: string, value: string, global = false) {
  if (global) {
    updateSettings((s) => ({ globalVariables: { ...s.globalVariables, [name]: value } }));
  } else {
    setChat((c) => ({ ...c, meta: { ...c.meta, variables: { ...c.meta.variables, [name]: value } } }));
  }
}

type CommandFn = (p: Parsed, pipe: string) => Promise<string | void> | string | void;

const COMMANDS: Record<string, { fn: CommandFn; help: string; aliases?: string[] }> = {
  send: {
    help: t('/send text — add a message from the persona without a reply'),
    fn: (p, pipe) => {
      const persona = activePersona();
      const text = applyRegex(p.text || pipe, displayRegexScripts(), { placement: PLACEMENT.SLASH_COMMAND, env: macroEnvFor() });
      addMessage('user', persona?.name || 'You', text, { personaId: persona?.id });
    },
  },
  sendas: {
    help: t('/sendas name=Name text — a message on behalf of a character'),
    fn: (p, pipe) => {
      const name = p.args.name || activeCharacter()?.name || 'Character';
      const c = getState().characters.find((x) => x.name.toLowerCase() === name.toLowerCase());
      addMessage('char', c?.name || name, p.text || pipe, { charId: c?.id });
    },
  },
  sys: {
    aliases: ['narrate', 'nar'],
    help: t('/sys text — a narrator message (the model sees it)'),
    fn: (p, pipe) => {
      addMessage('system', 'Narrator', p.text || pipe);
    },
  },
  comment: {
    help: t('/comment text — a note in the chat, hidden from the model'),
    fn: (p, pipe) => {
      addMessage('system', 'Note', p.text || pipe, { hidden: true });
    },
  },
  trigger: {
    help: t('/trigger [name] — ask for a reply (in a group, from a specific member)'),
    fn: async (p) => {
      const name = p.text.trim();
      const c = name ? getState().characters.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase())) : undefined;
      await generateReplies(c?.id);
    },
  },
  continue: { help: t('/continue — continue the last reply'), aliases: ['cont'], fn: () => continueMessage() },
  regen: { help: t('/regen — regenerate the last reply'), aliases: ['regenerate', 'swipe'], fn: () => regenerateLast() },
  impersonate: {
    help: '/impersonate [continue|variants|action|voice] — Impersonate+',
    aliases: ['imp'],
    fn: (p) => impersonate((['continue', 'variants', 'action', 'voice'].includes(p.text) ? p.text : undefined) as ImpersonateMode | undefined),
  },
  gen: {
    help: t('/gen instruction — quiet generation with the chat context, result in {{pipe}}'),
    fn: async (p, pipe) => quietGenerate(p.text || pipe, { label: '/gen' }),
  },
  genraw: {
    help: t('/genraw prompt — generation without the chat context'),
    fn: async (p, pipe) => utilityGenerate('utility', [{ role: 'user', content: p.text || pipe }], { label: '/genraw' }),
  },
  del: {
    help: t('/del N — delete the last N messages'),
    fn: (p) => {
      const n = Math.max(1, Number(p.text) || 1);
      const msgs = getState().chat?.messages || [];
      deleteMessages(msgs.slice(-n).map((m) => m.id));
    },
  },
  cut: {
    help: t('/cut 3 or /cut 3-5 — delete messages by number (from zero)'),
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      deleteMessages(parseRange(p.text, msgs.length).map((i) => msgs[i].id));
    },
  },
  hide: {
    help: t('/hide 3-5 — hide messages from the model'),
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      setHidden(parseRange(p.text || '-1', msgs.length).map((i) => msgs[i].id), true);
    },
  },
  unhide: {
    help: t('/unhide 3-5 — bring messages back into the context'),
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      setHidden(parseRange(p.text || '-1', msgs.length).map((i) => msgs[i].id), false);
    },
  },
  echo: { help: t('/echo text — show a notification'), fn: (p, pipe) => toast(p.text || pipe) },
  setvar: {
    help: t('/setvar key=name value'),
    fn: (p, pipe) => setVar(p.args.key || p.args.name || '', p.text || pipe),
  },
  getvar: { help: t('/getvar name'), fn: (p) => vars()[p.args.key || p.text] ?? '' },
  addvar: {
    help: t('/addvar key=name number'),
    fn: (p, pipe) => {
      const k = p.args.key || '';
      const cur = vars()[k] ?? '';
      const add = p.text || pipe;
      setVar(k, Number.isFinite(Number(cur || 0)) && Number.isFinite(Number(add)) ? String(Number(cur || 0) + Number(add)) : cur + add);
    },
  },
  incvar: { help: t('/incvar name'), fn: (p) => setVar(p.text, String((Number(vars()[p.text]) || 0) + 1)) },
  decvar: { help: t('/decvar name'), fn: (p) => setVar(p.text, String((Number(vars()[p.text]) || 0) - 1)) },
  flushvar: {
    help: t('/flushvar name — delete a variable'),
    fn: (p) => setChat((c) => {
      const v = { ...c.meta.variables };
      delete v[p.text];
      return { ...c, meta: { ...c.meta, variables: v } };
    }),
  },
  setglobalvar: { help: t('/setglobalvar key=name value'), fn: (p, pipe) => setVar(p.args.key || '', p.text || pipe, true) },
  getglobalvar: { help: t('/getglobalvar name'), fn: (p) => getState().settings.globalVariables[p.args.key || p.text] ?? '' },
  listvar: {
    help: t('/listvar — show the chat variables'),
    fn: () => {
      const v = vars();
      toast(Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k} = ${x}`).join('\n') : t('No variables'));
    },
  },
  roll: {
    help: t('/roll 2d6+1 — roll dice'),
    aliases: ['r'],
    fn: (p) => {
      const r = rollDice(p.text || '1d20');
      if (!r) throw new Error(t('Format: /roll 2d6+1'));
      const persona = activePersona();
      addMessage('system', 'Dice', `🎲 ${persona?.name || 'You'} rolls ${p.text || '1d20'}: **${r.total}** (${r.detail})`);
      return String(r.total);
    },
  },
  persona: {
    help: t('/persona name — switch the persona'),
    fn: (p) => {
      const found = getState().personas.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(t('Persona “{text}” not found', { text: p.text }));
      updateSettings({ activePersonaId: found.id });
    },
  },
  preset: {
    help: t('/preset name — switch the preset'),
    fn: (p) => {
      const found = getState().presets.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(t('Preset “{text}” not found', { text: p.text }));
      updateSettings({ activePresetId: found.id });
    },
  },
  profile: {
    help: t('/profile name — switch the connection for the chat'),
    fn: (p) => {
      const found = getState().connections.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(t('Profile “{text}” not found', { text: p.text }));
      updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: found.id } }));
    },
  },
  go: {
    help: t('/go name — open a character'),
    aliases: ['char'],
    fn: async (p) => {
      const found = getState().characters.find((x) => x.name.toLowerCase().includes(p.text.toLowerCase()));
      if (!found) throw new Error(t('Character “{text}” not found', { text: p.text }));
      await openCharacter(found.id);
    },
  },
  newchat: {
    help: t('/newchat — start a new chat'),
    aliases: ['new'],
    fn: async () => {
      const chat = getState().chat;
      if (chat) await startNewChat(chat.ownerType, chat.ownerId);
    },
  },
  bg: {
    help: t('/bg link|none — background of this chat'),
    aliases: ['background'],
    fn: (p) => setChat((c) => ({ ...c, meta: { ...c.meta, background: p.text === 'none' ? undefined : p.text } })),
  },
  memory: { help: t('/memory — condense the current chapter into the Memory Book'), fn: () => summarizeChapter() },
  image: {
    help: t('/image [scene|portrait|prompt] — generate an image'),
    aliases: ['img', 'sd'],
    fn: async (p) => {
      const { buildImagePrompt, generateImages, insertImageMessage } = await import('./images');
      const src = p.text === 'portrait' ? 'portrait' : p.text && p.text !== 'scene' ? 'free' : 'scene';
      const prompt = src === 'free' ? p.text : await buildImagePrompt(src);
      const [url] = await generateImages(prompt, 1);
      if (url) insertImageMessage(url, prompt);
      return url;
    },
  },
  translate: {
    help: t('/translate [number] — translate a message'),
    fn: async (p) => {
      const msgs = getState().chat?.messages || [];
      const idx = p.text ? parseRange(p.text, msgs.length)[0] : msgs.length - 1;
      if (msgs[idx]) await translateMessage(msgs[idx].id);
    },
  },
  speak: {
    help: t('/speak [text] — read aloud'),
    aliases: ['tts'],
    fn: async (p) => {
      const { speak } = await import('./tts');
      const msgs = getState().chat?.messages || [];
      speak(p.text || msgs[msgs.length - 1]?.text || '');
    },
  },
  theme: {
    help: t('/theme day|night — day or night'),
    fn: (p) => updateSettings((s) => ({ theme: { ...s.theme, mode: p.text === 'night' ? 'night' : 'day' } })),
  },
  input: {
    help: t('/input question — ask the player for a value'),
    fn: (p) => window.prompt(p.text || t('Enter a value')) ?? '',
  },
  open: {
    help: t('/open section — open a section (library, presets, memory…)'),
    fn: (p) => navigate((p.text || 'chat') as Parameters<typeof navigate>[0]),
  },
  help: {
    help: t('/help — list of commands'),
    fn: () => {
      toast(
        Object.values(COMMANDS)
          .map((c) => c.help)
          .join('\n'),
        'info',
        15000,
      );
    },
  },
};

const ALIASES: Record<string, string> = {};
for (const [name, c] of Object.entries(COMMANDS)) for (const a of c.aliases || []) ALIASES[a] = name;

export function slashHelp() {
  return Object.entries(COMMANDS).map(([name, c]) => ({ name, help: c.help, aliases: c.aliases || [] }));
}

export function registerSlashCommand(name: string, fn: CommandFn, help = '') {
  COMMANDS[name.toLowerCase()] = { fn, help: help || `/${name}` };
}

export async function runSlash(script: string): Promise<string> {
  let pipe = '';
  for (const part of splitPipes(script)) {
    const withPipe = part.replace(/\{\{pipe\}\}/gi, pipe);
    const p = parseCommand(substituteMacros(withPipe, { ...macroEnvFor(), extra: { pipe } }));
    if (!p) continue;
    const name = COMMANDS[p.name] ? p.name : ALIASES[p.name];
    if (!name) {
      toast(t('Unknown command /{name}. List: /help', { name: p.name }), 'warn');
      return pipe;
    }
    try {
      const r = await COMMANDS[name].fn(p, pipe);
      if (typeof r === 'string') pipe = r;
    } catch (err) {
      toast(`/${p.name}: ${(err as Error).message}`, 'error');
      return pipe;
    }
  }
  return pipe;
}
