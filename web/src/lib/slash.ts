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
  if (!getState().chat) throw new Error('Нет открытого чата');
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
    help: '/send текст — добавить сообщение от персоны без ответа',
    fn: (p, pipe) => {
      const persona = activePersona();
      const text = applyRegex(p.text || pipe, displayRegexScripts(), { placement: PLACEMENT.SLASH_COMMAND, env: macroEnvFor() });
      addMessage('user', persona?.name || 'Ты', text, { personaId: persona?.id });
    },
  },
  sendas: {
    help: '/sendas name=Имя текст — сообщение от лица персонажа',
    fn: (p, pipe) => {
      const name = p.args.name || activeCharacter()?.name || 'Персонаж';
      const c = getState().characters.find((x) => x.name.toLowerCase() === name.toLowerCase());
      addMessage('char', c?.name || name, p.text || pipe, { charId: c?.id });
    },
  },
  sys: {
    aliases: ['narrate', 'nar'],
    help: '/sys текст — сообщение рассказчика (видно модели)',
    fn: (p, pipe) => {
      addMessage('system', 'Рассказчик', p.text || pipe);
    },
  },
  comment: {
    help: '/comment текст — заметка в чате, скрытая от модели',
    fn: (p, pipe) => {
      addMessage('system', 'Заметка', p.text || pipe, { hidden: true });
    },
  },
  trigger: {
    help: '/trigger [имя] — запросить ответ (в группе — конкретного участника)',
    fn: async (p) => {
      const name = p.text.trim();
      const c = name ? getState().characters.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase())) : undefined;
      await generateReplies(c?.id);
    },
  },
  continue: { help: '/continue — продолжить последний ответ', aliases: ['cont'], fn: () => continueMessage() },
  regen: { help: '/regen — перегенерировать последний ответ', aliases: ['regenerate', 'swipe'], fn: () => regenerateLast() },
  impersonate: {
    help: '/impersonate [continue|variants|action|voice] — Impersonate+',
    aliases: ['imp'],
    fn: (p) => impersonate((['continue', 'variants', 'action', 'voice'].includes(p.text) ? p.text : undefined) as ImpersonateMode | undefined),
  },
  gen: {
    help: '/gen инструкция — тихая генерация с контекстом чата, результат в {{pipe}}',
    fn: async (p, pipe) => quietGenerate(p.text || pipe, { label: '/gen' }),
  },
  genraw: {
    help: '/genraw промпт — генерация без контекста чата',
    fn: async (p, pipe) => utilityGenerate('utility', [{ role: 'user', content: p.text || pipe }], { label: '/genraw' }),
  },
  del: {
    help: '/del N — удалить N последних сообщений',
    fn: (p) => {
      const n = Math.max(1, Number(p.text) || 1);
      const msgs = getState().chat?.messages || [];
      deleteMessages(msgs.slice(-n).map((m) => m.id));
    },
  },
  cut: {
    help: '/cut 3 или /cut 3-5 — удалить сообщения по номерам (с нуля)',
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      deleteMessages(parseRange(p.text, msgs.length).map((i) => msgs[i].id));
    },
  },
  hide: {
    help: '/hide 3-5 — скрыть сообщения от модели',
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      setHidden(parseRange(p.text || '-1', msgs.length).map((i) => msgs[i].id), true);
    },
  },
  unhide: {
    help: '/unhide 3-5 — вернуть сообщения в контекст',
    fn: (p) => {
      const msgs = getState().chat?.messages || [];
      setHidden(parseRange(p.text || '-1', msgs.length).map((i) => msgs[i].id), false);
    },
  },
  echo: { help: '/echo текст — показать уведомление', fn: (p, pipe) => toast(p.text || pipe) },
  setvar: {
    help: '/setvar key=имя значение',
    fn: (p, pipe) => setVar(p.args.key || p.args.name || '', p.text || pipe),
  },
  getvar: { help: '/getvar имя', fn: (p) => vars()[p.args.key || p.text] ?? '' },
  addvar: {
    help: '/addvar key=имя число',
    fn: (p, pipe) => {
      const k = p.args.key || '';
      const cur = vars()[k] ?? '';
      const add = p.text || pipe;
      setVar(k, Number.isFinite(Number(cur || 0)) && Number.isFinite(Number(add)) ? String(Number(cur || 0) + Number(add)) : cur + add);
    },
  },
  incvar: { help: '/incvar имя', fn: (p) => setVar(p.text, String((Number(vars()[p.text]) || 0) + 1)) },
  decvar: { help: '/decvar имя', fn: (p) => setVar(p.text, String((Number(vars()[p.text]) || 0) - 1)) },
  flushvar: {
    help: '/flushvar имя — удалить переменную',
    fn: (p) => setChat((c) => {
      const v = { ...c.meta.variables };
      delete v[p.text];
      return { ...c, meta: { ...c.meta, variables: v } };
    }),
  },
  setglobalvar: { help: '/setglobalvar key=имя значение', fn: (p, pipe) => setVar(p.args.key || '', p.text || pipe, true) },
  getglobalvar: { help: '/getglobalvar имя', fn: (p) => getState().settings.globalVariables[p.args.key || p.text] ?? '' },
  listvar: {
    help: '/listvar — показать переменные чата',
    fn: () => {
      const v = vars();
      toast(Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k} = ${x}`).join('\n') : 'Переменных нет');
    },
  },
  roll: {
    help: '/roll 2d6+1 — бросок кубиков',
    aliases: ['r'],
    fn: (p) => {
      const r = rollDice(p.text || '1d20');
      if (!r) throw new Error('Формат: /roll 2d6+1');
      const persona = activePersona();
      addMessage('system', 'Кубики', `🎲 ${persona?.name || 'Ты'} бросает ${p.text || '1d20'}: **${r.total}** (${r.detail})`);
      return String(r.total);
    },
  },
  persona: {
    help: '/persona имя — сменить персону',
    fn: (p) => {
      const found = getState().personas.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(`Персона «${p.text}» не найдена`);
      updateSettings({ activePersonaId: found.id });
    },
  },
  preset: {
    help: '/preset имя — сменить пресет',
    fn: (p) => {
      const found = getState().presets.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(`Пресет «${p.text}» не найден`);
      updateSettings({ activePresetId: found.id });
    },
  },
  profile: {
    help: '/profile имя — сменить подключение для чата',
    fn: (p) => {
      const found = getState().connections.find((x) => x.name.toLowerCase() === p.text.toLowerCase());
      if (!found) throw new Error(`Профиль «${p.text}» не найден`);
      updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: found.id } }));
    },
  },
  go: {
    help: '/go имя — открыть персонажа',
    aliases: ['char'],
    fn: async (p) => {
      const found = getState().characters.find((x) => x.name.toLowerCase().includes(p.text.toLowerCase()));
      if (!found) throw new Error(`Персонаж «${p.text}» не найден`);
      await openCharacter(found.id);
    },
  },
  newchat: {
    help: '/newchat — начать новый чат',
    aliases: ['new'],
    fn: async () => {
      const chat = getState().chat;
      if (chat) await startNewChat(chat.ownerType, chat.ownerId);
    },
  },
  bg: {
    help: '/bg ссылка|none — фон этого чата',
    aliases: ['background'],
    fn: (p) => setChat((c) => ({ ...c, meta: { ...c.meta, background: p.text === 'none' ? undefined : p.text } })),
  },
  memory: { help: '/memory — сжать текущую главу в Memory Book', fn: () => summarizeChapter() },
  image: {
    help: '/image [scene|portrait|промпт] — сгенерировать картинку',
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
    help: '/translate [номер] — перевести сообщение',
    fn: async (p) => {
      const msgs = getState().chat?.messages || [];
      const idx = p.text ? parseRange(p.text, msgs.length)[0] : msgs.length - 1;
      if (msgs[idx]) await translateMessage(msgs[idx].id);
    },
  },
  speak: {
    help: '/speak [текст] — озвучить',
    aliases: ['tts'],
    fn: async (p) => {
      const { speak } = await import('./tts');
      const msgs = getState().chat?.messages || [];
      speak(p.text || msgs[msgs.length - 1]?.text || '');
    },
  },
  theme: {
    help: '/theme day|night — день или ночь',
    fn: (p) => updateSettings((s) => ({ theme: { ...s.theme, mode: p.text === 'night' ? 'night' : 'day' } })),
  },
  input: {
    help: '/input вопрос — спросить значение у игрока',
    fn: (p) => window.prompt(p.text || 'Введите значение') ?? '',
  },
  open: {
    help: '/open раздел — открыть раздел (library, presets, memory…)',
    fn: (p) => navigate((p.text || 'chat') as Parameters<typeof navigate>[0]),
  },
  help: {
    help: '/help — список команд',
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
      toast(`Неизвестная команда /${p.name}. Список: /help`, 'warn');
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
