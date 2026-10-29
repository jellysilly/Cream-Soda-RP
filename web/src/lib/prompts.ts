import { getState, updateSettings } from './store';
import { t } from './i18n';

/**
 * Prompts Cream Soda itself sends to the model (Impersonate+, Memory Book,
 * translation, images, the generator). They are always English, whatever the
 * interface language, and ask the model to answer in the language of the chat.
 * Each one can be overridden in Settings → Prompts (settings.prompts); the
 * prompts of characters and presets live in the cards and presets themselves.
 *
 * {{name}} placeholders listed in `vars` are filled by the feature; the usual
 * macros ({{char}}, {{user}}, {{description}}…) work as well.
 */

const VARIANTS_FORMAT = 'Use exactly this format:\n### 1\ntext\n### 2\ntext\n…';
const THIRD_PERSON = 'Write in third person: refer to {{user}} by name or as he/she/they, never as "I".';
const CHAT_LANGUAGE = 'Write in the language of the chat.';

export const DEFAULT_PROMPTS = {
  impersonateContinue: `[Continue {{user}}'s draft reply below in the same voice: 1–3 sentences, no repetition. ${THIRD_PERSON} ${CHAT_LANGUAGE} Return only the continuation.]\nDraft: {{input}}`,
  impersonateVariants: `[Suggest {{count}} different options for {{user}}'s next reply, in {{user}}'s manner and voice. Vary the tone and the action. ${THIRD_PERSON} Do not write for {{char}}. ${CHAT_LANGUAGE} ${VARIANTS_FORMAT}]`,
  impersonateAction: `[Suggest {{count}} options for {{user}}'s next action: action only, no direct speech, in *asterisks*. ${THIRD_PERSON} ${CHAT_LANGUAGE} ${VARIANTS_FORMAT}]`,
  impersonateVoice: `[Suggest {{count}} options for {{user}}'s next reply that capture the persona's voice as closely as possible: vocabulary, rhythm and habits from the persona description. ${THIRD_PERSON} ${CHAT_LANGUAGE} ${VARIANTS_FORMAT}]`,
  impersonateDirection: 'Direction: {{direction}}',
  memorySummary:
    'You keep the Memory Book of a roleplay story. Condense the chat fragment below into a chapter entry, written in the language of the fragment.\nAnswer strictly in this format:\nTitle: a short chapter title\nSummary: 2–4 sentences in the past tense, only important events, decisions, promises and changes in relationships\nKeys: 3–5 keywords, comma-separated\n\nFragment:\n{{chunk}}',
  memoryFacts:
    'From the roleplay chat fragment below, write down up to 3 lasting facts about the characters or the world that are worth remembering for the whole story (habits, secrets, promises, plans), in the language of the fragment. One fact per line, starting with "- ". If there is nothing new, answer "none".\n\nAlready known:\n{{facts}}\n\nFragment:\n{{chunk}}',
  memoryBlock: '[Story memory]\n{{chapters}}\n[Facts]\n{{facts}}',
  translate: 'Translate this roleplay message into {{language}}. Keep the markup (*italics*, quotes, HTML tags) and the style. Return only the translation.\n\n{{text}}',
  imageScene:
    "Write a prompt for an image generator (in English, comma-separated, up to 60 words) describing the current frame of the scene from the last {{count}} messages: place, lighting, characters and their appearance, poses, emotions. {{char}}'s appearance: {{description}}. Only the prompt, no explanations.",
  imagePortrait:
    'Write a prompt for an image generator (in English, comma-separated, up to 50 words): a waist-up portrait of {{char}} with appearance, clothes and facial expression. Description: {{description}}. Only the prompt.',
  generatorSystem:
    'You are an experienced author of character cards for roleplay chats. Write all text values in {{language}}. {{size}} Use the {{char}} and {{user}} macros where appropriate. Answer ONLY with valid JSON, without explanations, following this schema:\n{{schema}}',
  generatorTask: '{{context}}Task ({{kind}}): {{request}}',
  generatorField:
    'Current result:\n{{result}}\n\nRewrite the field "{{field}}" ({{key}}) from scratch, keeping everything else consistent. Answer with JSON of the form {"{{key}}": "…"}.',
  generatorRefine: 'Current result:\n{{result}}\n\nImprove it: {{request}}. Return the full JSON in the same schema.',
  attachment: '[File "{{name}}"]\n{{text}}',
};

export type PromptKey = keyof typeof DEFAULT_PROMPTS;

export interface PromptInfo {
  key: PromptKey;
  group: string;
  title: string;
  /** Placeholders the feature fills in. */
  vars: string[];
}

/** What the Prompts tab shows, in order. */
export const PROMPT_INFO: PromptInfo[] = [
  { key: 'impersonateContinue', group: 'Impersonate+', title: t('Continue my reply'), vars: ['input'] },
  { key: 'impersonateVariants', group: 'Impersonate+', title: t('Reply variants'), vars: ['count'] },
  { key: 'impersonateAction', group: 'Impersonate+', title: t('Action only'), vars: ['count'] },
  { key: 'impersonateVoice', group: 'Impersonate+', title: t('Persona voice'), vars: ['count'] },
  { key: 'impersonateDirection', group: 'Impersonate+', title: t('Direction line'), vars: ['direction'] },
  { key: 'memorySummary', group: 'Memory Book', title: t('Chapter summary'), vars: ['chunk'] },
  { key: 'memoryFacts', group: 'Memory Book', title: t('Fact suggestions'), vars: ['chunk', 'facts'] },
  { key: 'memoryBlock', group: 'Memory Book', title: t('Memory block in the prompt'), vars: ['chapters', 'facts'] },
  { key: 'translate', group: t('Translation'), title: t('Message translation'), vars: ['language', 'text'] },
  { key: 'imageScene', group: t('Images'), title: t('Scene frame prompt'), vars: ['count'] },
  { key: 'imagePortrait', group: t('Images'), title: t('Portrait prompt'), vars: [] },
  { key: 'generatorSystem', group: t('Generator'), title: t('System prompt'), vars: ['language', 'size', 'schema'] },
  { key: 'generatorTask', group: t('Generator'), title: t('Task'), vars: ['context', 'kind', 'request'] },
  { key: 'generatorField', group: t('Generator'), title: t('Rewrite one field'), vars: ['result', 'field', 'key'] },
  { key: 'generatorRefine', group: t('Generator'), title: t('Refine the result'), vars: ['result', 'request'] },
  { key: 'attachment', group: t('Chat'), title: t('Attached text file'), vars: ['name', 'text'] },
];

/** The prompt in effect: the user's override or the English default. */
export function getPrompt(key: PromptKey): string {
  const custom = getState().settings.prompts?.[key];
  return custom && custom.trim() ? custom : DEFAULT_PROMPTS[key];
}

export function isPromptCustom(key: PromptKey): boolean {
  const custom = getState().settings.prompts?.[key];
  return !!custom && custom.trim() !== '' && custom !== DEFAULT_PROMPTS[key];
}

/** Saves an override; the default text (or an empty one) removes it. */
export function setPrompt(key: PromptKey, text: string) {
  const prompts = { ...(getState().settings.prompts || {}) };
  if (!text.trim() || text === DEFAULT_PROMPTS[key]) delete prompts[key];
  else prompts[key] = text;
  updateSettings({ prompts });
}

/** Fills the feature's {{placeholders}}; other macros are left for substituteMacros. */
export function fillPrompt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** getPrompt + fillPrompt. */
export function prompt(key: PromptKey, vars: Record<string, string | number> = {}): string {
  return fillPrompt(getPrompt(key), vars);
}

/** English language names for prompts («translate into Russian»). */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  uk: 'Ukrainian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
};

/** Languages the generator and the translator can write in, by their own names. */
export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  uk: 'Українська',
  ja: '日本語',
  zh: '中文',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  pl: 'Polski',
};
