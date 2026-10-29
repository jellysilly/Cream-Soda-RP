import type { Preset } from './types';
import { DEFAULT_UTILITY, MAIN_PROMPTS, POST_INSTRUCTION, STYLE_PROMPTS } from './defaults';

/**
 * Presets saved before prompts became English still carry the old Russian
 * defaults. A text that is exactly an old default is replaced with the English
 * one; anything the user changed stays as it is. The old texts are kept only
 * for this comparison.
 */
const OLD_TEXTS: Record<string, string> = {
  "Ты — рассказчик ролевой истории. Пиши от третьего лица, короткими абзацами, не решай за {{user}}. Действия и описания выделяй *курсивом*, реплики — «кавычками».": MAIN_PROMPTS.romance,
  "Ты — рассказчик неспешной нуарной истории. Пиши от третьего лица, плотной атмосферной прозой: дождь, неон, тени, недосказанность. Не решай и не говори за {{user}}.": MAIN_PROMPTS.noir,
  "Ты — ведущий текстового квеста. Описывай окружение, последствия действий {{user}} и персонажей мира. В конце каждого ответа кратко перечисли, что {{user}} может сделать дальше. Никогда не действуй за {{user}}.": MAIN_PROMPTS.quest,
  "Стиль: мягкий юмор, сенсорные детали, без пафоса.": STYLE_PROMPTS.romance,
  "Стиль: медленный темп, короткие хлёсткие реплики, детали города. Не торопи события.": STYLE_PROMPTS.noir,
  "Стиль: ясные описания, конкретные детали, честные последствия. Держи напряжение.": STYLE_PROMPTS.quest,
  "[Продолжи сцену от лица {{char}}. Не пиши за {{user}}. Объём — 2–4 абзаца.]": POST_INSTRUCTION,
  "[Напиши следующую реплику за {{user}} — от первого лица, в его манере и голосе. Не пиши за {{char}} и не описывай его реакцию. Только текст реплики.]": DEFAULT_UTILITY.impersonation,
  "[Продолжи свой последний ответ с того места, где он оборвался, не повторяя уже написанное.]": DEFAULT_UTILITY.continueNudge,
  "[Начало нового чата]": DEFAULT_UTILITY.newChat,
  "[Начало нового группового чата. Участники: {{group}}]": DEFAULT_UTILITY.newGroupChat,
  "[Пример диалога]": DEFAULT_UTILITY.newExampleChat,
  "[Напиши следующий ответ только от лица {{char}}.]": DEFAULT_UTILITY.groupNudge,
  "Сценарий: {{scenario}}": DEFAULT_UTILITY.scenarioFormat,
  "Характер {{char}}: {{personality}}": DEFAULT_UTILITY.personalityFormat,
};

const OLD_NAMES: Record<string, string> = {
  'Основной промпт': 'Main prompt',
  'Описание персонажа · {{char}}': 'Character description · {{char}}',
  'Персона · {{user}}': 'Persona · {{user}}',
  'Лорбук · до истории': 'Lorebook · before the story',
  'Лорбук · после карточки': 'Lorebook · after the card',
  'Примеры диалогов': 'Dialogue examples',
  'История чата': 'Chat history',
  'Стиль · мягкий роман': 'Style · soft romance',
  'Стиль · нуар': 'Style · noir',
  'Стиль · квест': 'Style · quest',
  'Пост-инструкция': 'Post-history instruction',
  'Префилл ответа': 'Response prefill',
  'Сладкий роман v3': 'Sweet Romance v3',
  'Нуар · медленный': 'Noir · slow burn',
  'Текстовый квест': 'Text quest',
};

/** Returns the preset with old default texts replaced, or the same object if nothing changed. */
export function migratePreset(p: Preset): Preset {
  let changed = false;
  const swap = (text: string, table: Record<string, string>) => {
    const next = table[text];
    if (next === undefined) return text;
    changed = true;
    return next;
  };
  const prompts = p.prompts.map((b) => ({ ...b, name: swap(b.name, OLD_NAMES), content: swap(b.content, OLD_TEXTS) }));
  const utility = Object.fromEntries(Object.entries(p.utility).map(([k, v]) => [k, typeof v === 'string' ? swap(v, OLD_TEXTS) : v])) as Preset['utility'];
  const name = swap(p.name, OLD_NAMES);
  return changed ? { ...p, name, prompts, utility } : p;
}
