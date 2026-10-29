import type {
  Character,
  Chat,
  ChatMessage,
  ConnectionProfile,
  ImageSettings,
  InstructTemplate,
  Lorebook,
  Persona,
  Plot,
  Preset,
  PromptBlock,
  QuickReplySet,
  RegexScript,
  Samplers,
  Settings,
  Theme,
  ThemeTokens,
  WorldEntry,
  Group,
} from './types';
import { uid } from './utils';
import { t } from './i18n';
import { DEFAULT_PROMPTS, type PromptKey } from './prompts';

const now = () => Date.now();

// ───────── Factories ─────────

export function newCharacter(patch: Partial<Character> = {}): Character {
  return {
    id: uid(),
    name: t('New character'),
    tagline: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    groupGreetings: [],
    exampleMessages: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    creatorNotes: '',
    creator: '',
    characterVersion: '',
    nickname: '',
    tags: [],
    avatar: '',
    kana: '',
    palette: -1,
    fav: false,
    talkativeness: 0.5,
    depthPrompt: { prompt: '', depth: 4, role: 'system' },
    worldIds: [],
    presetId: '',
    sprites: {},
    extensions: {},
    createdAt: now(),
    updatedAt: now(),
    ...patch,
  };
}

export function newPersona(patch: Partial<Persona> = {}): Persona {
  return {
    id: uid(),
    name: t('Me'),
    title: '',
    description: '',
    avatar: '',
    kana: '',
    palette: 1,
    position: 'prompt',
    depth: 2,
    role: 'system',
    lockedCharIds: [],
    updatedAt: now(),
    ...patch,
  };
}

export function newGroup(patch: Partial<Group> = {}): Group {
  return {
    id: uid(),
    name: t('New group'),
    memberIds: [],
    mutedIds: [],
    activation: 'natural',
    allowSelfResponses: false,
    generationMode: 'swap',
    autoMode: false,
    autoModeDelay: 5,
    scenario: '',
    avatar: '',
    fav: false,
    updatedAt: now(),
    ...patch,
  };
}

export function newWorldEntry(patch: Partial<WorldEntry> = {}): WorldEntry {
  return {
    uid: uid(),
    comment: t('New entry'),
    keys: [],
    secondaryKeys: [],
    selectiveLogic: 0,
    content: '',
    enabled: true,
    constant: false,
    position: 0,
    depth: 4,
    role: 'system',
    order: 100,
    probability: 100,
    useProbability: false,
    caseSensitive: null,
    matchWholeWords: null,
    scanDepth: null,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    outletName: '',
    extra: {},
    ...patch,
  };
}

export function newLorebook(patch: Partial<Lorebook> = {}): Lorebook {
  return { id: uid(), name: t('New lorebook'), description: '', entries: [], updatedAt: now(), ...patch };
}

export function newPlot(patch: Partial<Plot> = {}): Plot {
  return { id: uid(), title: t('New plot'), premise: '', scenario: '', firstMessage: '', tags: [], charIds: [], updatedAt: now(), ...patch };
}

export function newRegex(patch: Partial<RegexScript> = {}): RegexScript {
  return {
    id: uid(),
    name: t('New regex'),
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    renderHtml: false,
    scope: { type: 'global' },
    order: 100,
    testInput: '',
    updatedAt: now(),
    ...patch,
  };
}

export function newConnection(patch: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    id: uid(),
    name: t('New profile'),
    api: 'openai',
    baseUrl: '',
    model: '',
    tcFlavor: 'openai',
    mode: 'chat',
    proxy: '',
    timeout: 120,
    headers: [],
    extraBody: '',
    contextOverride: 0,
    vision: false,
    updatedAt: now(),
    ...patch,
  };
}

export function newQuickReplySet(patch: Partial<QuickReplySet> = {}): QuickReplySet {
  return { id: uid(), name: t('Quick replies'), enabled: true, replies: [], updatedAt: now(), ...patch };
}

export function newMessage(patch: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'name' | 'text'>): ChatMessage {
  const date = patch.sendDate || now();
  return {
    id: uid(),
    swipes: [{ text: patch.text, date, reasoning: patch.reasoning, gen: patch.gen }],
    swipeId: 0,
    sendDate: date,
    ...patch,
  };
}

export function newChat(ownerType: 'character' | 'group', ownerId: string, title: string): Chat {
  return {
    id: uid(),
    ownerType,
    ownerId,
    title,
    createdAt: now(),
    updatedAt: now(),
    parentId: null,
    branchPoint: null,
    messages: [],
    meta: {
      authorNote: { text: '', depth: 4, interval: 1, role: 'system', position: 'depth' },
      variables: {},
      worldIds: [],
      memory: { chapters: [], facts: [] },
    },
  };
}

// ───────── Presets ─────────

export const DEFAULT_SAMPLERS: Samplers = {
  temperature: 1.05,
  topP: 0.92,
  topK: 0,
  minP: 0,
  topA: 0,
  typicalP: 1,
  repetitionPenalty: 1.08,
  repPenRange: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 600,
  contextSize: 32768,
  stream: true,
  seed: -1,
  stop: [],
  logitBias: '',
  reasoningEffort: '',
  thinkingBudget: 0,
  dryMultiplier: 0,
  xtcProbability: 0,
  xtcThreshold: 0.1,
};

function block(id: string, name: string, patch: Partial<PromptBlock> = {}): PromptBlock {
  return { id, name, role: 'system', content: '', enabled: true, position: 'relative', depth: 4, order: 100, ...patch };
}

export const MARKER_LABELS: Record<string, string> = {
  charCard: t('card marker'),
  charDescription: t('description from the card'),
  charPersonality: t('personality from the card'),
  scenario: t('scenario from the card'),
  personaDescription: t('persona marker'),
  worldInfoBefore: t('lorebook before the card'),
  worldInfoAfter: t('lorebook after the card'),
  dialogueExamples: t('from the card'),
  chatHistory: t('chat messages'),
  memoryBook: t('chapters and facts'),
};

// Preset prompts go to the model as they are, so they are English.
export const MAIN_PROMPTS = {
  romance:
    'You are the narrator of a roleplay story. Write in third person, in short paragraphs, and never decide for {{user}}. Put actions and descriptions in *italics* and speech in "quotes". Write in the language of the story.',
  noir: 'You are the narrator of a slow-burning noir story. Write in third person, in dense atmospheric prose: rain, neon, shadows, things left unsaid. Never decide or speak for {{user}}. Write in the language of the story.',
  quest:
    'You are the game master of a text adventure. Describe the surroundings and the consequences of the actions of {{user}} and of the characters of the world. End every reply with a short list of what {{user}} can do next. Never act for {{user}}. Write in the language of the story.',
};

export const STYLE_PROMPTS = {
  romance: 'Style: gentle humor, sensory details, no pathos.',
  noir: "Style: slow pace, short sharp lines, details of the city. Don't rush events.",
  quest: 'Style: clear descriptions, concrete details, honest consequences. Keep the tension.',
};

export const POST_INSTRUCTION = '[Continue the scene as {{char}}. Do not write for {{user}}. Length: 2–4 paragraphs.]';

export function defaultPromptBlocks(variant: 'romance' | 'noir' | 'quest' = 'romance'): PromptBlock[] {
  return [
    block('main', 'Main prompt', { content: MAIN_PROMPTS[variant], builtin: true }),
    block('charCard', 'Character description · {{char}}', { marker: 'charCard', builtin: true }),
    block('personaDescription', 'Persona · {{user}}', { marker: 'personaDescription', builtin: true }),
    block('worldInfoBefore', 'Lorebook · before the story', { marker: 'worldInfoBefore', builtin: true }),
    block('worldInfoAfter', 'Lorebook · after the card', { marker: 'worldInfoAfter', builtin: true }),
    block('memoryBook', 'Memory Book', { marker: 'memoryBook', builtin: true }),
    block('dialogueExamples', 'Dialogue examples', { marker: 'dialogueExamples', builtin: true, enabled: false }),
    block('chatHistory', 'Chat history', { marker: 'chatHistory', builtin: true }),
    block('style', variant === 'romance' ? 'Style · soft romance' : variant === 'noir' ? 'Style · noir' : 'Style · quest', {
      content: STYLE_PROMPTS[variant],
      position: 'depth',
      depth: 2,
    }),
    block('jailbreak', 'Post-history instruction', { role: 'user', content: POST_INSTRUCTION, builtin: true }),
    block('prefill', 'Response prefill', { role: 'assistant', content: '', enabled: false, builtin: true }),
  ];
}

export const DEFAULT_UTILITY = {
  impersonation:
    "[Write {{user}}'s next reply in third person, in {{user}}'s manner and voice: refer to {{user}} by name or as he/she/they, never as \"I\". Do not write for {{char}} or describe {{char}}'s reaction. Only the reply itself.]",
  continueNudge: '[Continue your last reply from where it stopped, without repeating what is already written.]',
  newChat: '[Start a new chat]',
  newGroupChat: '[Start a new group chat. Group members: {{group}}]',
  newExampleChat: '[Example chat]',
  groupNudge: '[Write the next reply only as {{char}}.]',
  wiFormat: '{0}',
  scenarioFormat: 'Scenario: {{scenario}}',
  personalityFormat: "{{char}}'s personality: {{personality}}",
  sendIfEmpty: '',
};

export function newPreset(patch: Partial<Preset> = {}, variant: 'romance' | 'noir' | 'quest' = 'romance'): Preset {
  return {
    id: uid(),
    name: t('New preset'),
    samplers: { ...DEFAULT_SAMPLERS },
    prompts: defaultPromptBlocks(variant),
    utility: { ...DEFAULT_UTILITY },
    namesBehavior: 'default',
    squashSystem: false,
    instructId: 'chatml',
    reasoning: { autoParse: true, prefix: '<think>', suffix: '</think>', addToPrompt: false },
    extensions: {},
    updatedAt: now(),
    ...patch,
  };
}

export function seedPresets(): Preset[] {
  return [
    newPreset({ id: 'sweet-romance', name: 'Sweet Romance v3' }, 'romance'),
    newPreset(
      { id: 'noir-slow', name: 'Noir · slow burn', samplers: { ...DEFAULT_SAMPLERS, temperature: 0.9, maxTokens: 450 } },
      'noir',
    ),
    newPreset(
      { id: 'text-quest', name: 'Text quest', samplers: { ...DEFAULT_SAMPLERS, temperature: 0.8, topP: 0.95, maxTokens: 700 } },
      'quest',
    ),
  ];
}

// ───────── Instruct templates (Text Completion) ─────────

function tpl(id: string, name: string, p: Partial<InstructTemplate>): InstructTemplate {
  return {
    id,
    name,
    inputSequence: '',
    outputSequence: '',
    systemSequence: '',
    inputSuffix: '',
    outputSuffix: '',
    systemSuffix: '',
    firstOutputSequence: '',
    lastOutputSequence: '',
    stopSequence: '',
    storyStringPrefix: '',
    storyStringSuffix: '',
    wrap: true,
    namesBehavior: 'force',
    systemSameAsUser: false,
    builtin: true,
    ...p,
  };
}

export const BUILTIN_INSTRUCT: InstructTemplate[] = [
  tpl('chatml', 'ChatML', {
    inputSequence: '<|im_start|>user\n',
    inputSuffix: '<|im_end|>\n',
    outputSequence: '<|im_start|>assistant\n',
    outputSuffix: '<|im_end|>\n',
    systemSequence: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    stopSequence: '<|im_end|>',
    wrap: false,
  }),
  tpl('llama3', 'Llama 3 Instruct', {
    inputSequence: '<|start_header_id|>user<|end_header_id|>\n\n',
    inputSuffix: '<|eot_id|>',
    outputSequence: '<|start_header_id|>assistant<|end_header_id|>\n\n',
    outputSuffix: '<|eot_id|>',
    systemSequence: '<|start_header_id|>system<|end_header_id|>\n\n',
    systemSuffix: '<|eot_id|>',
    stopSequence: '<|eot_id|>',
    storyStringPrefix: '<|begin_of_text|>',
    wrap: false,
  }),
  tpl('mistral-v7', 'Mistral V7 (Tekken)', {
    inputSequence: '[INST] ',
    inputSuffix: '[/INST]',
    outputSequence: '',
    outputSuffix: '</s>',
    systemSequence: '[SYSTEM_PROMPT] ',
    systemSuffix: '[/SYSTEM_PROMPT]',
    stopSequence: '</s>',
    wrap: false,
  }),
  tpl('gemma', 'Gemma 2/3', {
    inputSequence: '<start_of_turn>user\n',
    inputSuffix: '<end_of_turn>\n',
    outputSequence: '<start_of_turn>model\n',
    outputSuffix: '<end_of_turn>\n',
    systemSameAsUser: true,
    stopSequence: '<end_of_turn>',
    wrap: false,
  }),
  tpl('alpaca', 'Alpaca', {
    inputSequence: '### Instruction:',
    outputSequence: '### Response:',
    systemSequence: '',
    inputSuffix: '\n\n',
    outputSuffix: '\n\n',
    systemSuffix: '\n\n',
    stopSequence: '###',
  }),
  tpl('metharme', 'Metharme / Pygmalion', {
    inputSequence: '<|user|>',
    outputSequence: '<|model|>',
    systemSequence: '<|system|>',
    stopSequence: '</s>',
    wrap: false,
  }),
  tpl('glm4', 'GLM-4', {
    inputSequence: '<|user|>\n',
    outputSequence: '<|assistant|>\n',
    systemSequence: '<|system|>\n',
    storyStringPrefix: '[gMASK]<sop>',
    stopSequence: '<|user|>',
    wrap: false,
  }),
  tpl('plain', 'No template (Name: text)', { namesBehavior: 'always', inputSuffix: '\n', outputSuffix: '\n', systemSuffix: '\n' }),
];

// ───────── Themes ─────────

export const CREAM_TOKENS: ThemeTokens = {
  bg: 'linear-gradient(180deg, #F5AEC8 0%, #F8C6D8 40%, #FBE2EC 72%, #D3EBF8 100%)',
  bgSolid: '#FBE2EC',
  surface: 'rgba(255,255,255,0.62)',
  surfaceStrong: 'rgba(255,255,255,0.78)',
  border: 'rgba(255,255,255,0.9)',
  text: '#47162F',
  muted: '#85395E',
  accent: '#D6216A',
  accentText: '#FFFFFF',
  link: '#A3134F',
  bubbleChar: '#FFFFFF',
  bubbleUser: '#FFDCE9',
  em: '#85395E',
  card: '#FFF6E3',
  cardText: '#47162F',
  cardLabel: '#7A3E17',
  cardBorder: '#F3DDB0',
  field: '#FFFFFF',
  fieldBorder: '#F8C6D8',
  chip: '#FCE4EE',
  mint: '#2ED8A6',
};

export const MIDNIGHT_TOKENS: ThemeTokens = {
  bg: 'linear-gradient(180deg, #160C26 0%, #22102F 45%, #1B1236 75%, #0E1B33 100%)',
  bgSolid: '#1B1030',
  surface: 'rgba(255,255,255,0.06)',
  surfaceStrong: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.12)',
  text: '#FCE8F1',
  muted: '#C9A3BC',
  accent: '#FF5FA2',
  accentText: '#2A0A1A',
  link: '#FF8CBE',
  bubbleChar: '#2A1A3D',
  bubbleUser: '#4A1838',
  em: '#E6A9C8',
  card: '#2E2016',
  cardText: '#FFE9C4',
  cardLabel: '#F3C989',
  cardBorder: '#5A3E24',
  field: '#1E1230',
  fieldBorder: 'rgba(255,140,190,0.3)',
  chip: 'rgba(255,255,255,0.08)',
  mint: '#3EE6B5',
};

function theme(id: string, name: string, note: string, dark: boolean, tokens: ThemeTokens, patch: Partial<Theme> = {}): Theme {
  return {
    id,
    name,
    note,
    dark,
    builtin: true,
    tokens,
    radius: 28,
    blur: dark ? 16 : 14,
    grain: dark ? 22 : 16,
    glow: dark ? 45 : 0,
    fontHeading: 'M PLUS Rounded 1c',
    fontBody: 'Nunito',
    fontUrl: '',
    chatView: 'bubbles',
    background: 'gradient',
    backgroundImage: '',
    css: { theme: '', chat: '', mobile: '' },
    updatedAt: 0,
    ...patch,
  };
}

export const BUILTIN_THEMES: Theme[] = [
  theme('cream-soda', 'Cream Soda', t('day'), false, CREAM_TOKENS),
  theme('midnight-soda', 'Midnight Soda', t('night'), true, MIDNIGHT_TOKENS),
  theme('strawberry', t('Strawberry Cake'), t('day'), false, {
    ...CREAM_TOKENS,
    bg: 'linear-gradient(180deg, #FFC9DE 0%, #FFE0EC 55%, #FFF1F6 100%)',
    bgSolid: '#FFE3EE',
    surface: 'rgba(255,255,255,0.7)',
    surfaceStrong: 'rgba(255,255,255,0.82)',
    text: '#3B1027',
    muted: '#8A2F5A',
    accent: '#C8186A',
    link: '#A3134F',
    bubbleUser: '#CFF7E8',
    em: '#8A2F5A',
    card: '#E2FAF1',
    cardText: '#3B1027',
    cardLabel: '#0B6B50',
    cardBorder: '#B5EBD6',
    fieldBorder: '#F6B9D1',
    chip: '#FFE0EC',
  }),
  theme('pudding', t('Pudding'), t('evening'), false, {
    ...CREAM_TOKENS,
    bg: 'linear-gradient(180deg, #FFF1D6 0%, #F8E2BE 55%, #F3D3A2 100%)',
    bgSolid: '#F8E2BE',
    surface: 'rgba(255,255,255,0.6)',
    surfaceStrong: 'rgba(255,255,255,0.75)',
    border: 'rgba(255,255,255,0.85)',
    text: '#3E220F',
    muted: '#7A4A22',
    accent: '#8B4A1F',
    link: '#8B4A1F',
    bubbleUser: '#F3D6A8',
    em: '#7A4A22',
    card: '#FFF8EA',
    cardText: '#3E220F',
    cardLabel: '#7A3E17',
    cardBorder: '#EBCF9E',
    fieldBorder: '#E9C995',
    chip: '#F7E3C2',
    mint: '#3FBF8F',
  }),
];

export const THEME_TOKEN_LABELS: { key: keyof ThemeTokens; label: string }[] = [
  { key: 'accent', label: t('Accent') },
  { key: 'text', label: t('Text') },
  { key: 'muted', label: t('Muted') },
  { key: 'bubbleChar', label: t('Character bubble') },
  { key: 'bubbleUser', label: t('Player bubble') },
  { key: 'card', label: t('HTML cards') },
  { key: 'cardText', label: t('Card text') },
  { key: 'surface', label: t('Panels') },
  { key: 'border', label: t('Outline') },
  { key: 'accentText', label: t('Text on accent') },
  { key: 'em', label: t('Italics (actions)') },
  { key: 'link', label: t('Links') },
  { key: 'field', label: t('Input fields') },
  { key: 'fieldBorder', label: t('Field outline') },
  { key: 'chip', label: t('Chips and tabs') },
  { key: 'mint', label: t('Mint (statuses)') },
  { key: 'bgSolid', label: t('Background (solid)') },
];

export const UI_CLASSES = [
  '.cs-app',
  '.cs-rail',
  '.cs-panel',
  '.cs-chat',
  '.cs-message',
  '.is-char',
  '.is-user',
  '.cs-bubble',
  '.cs-name',
  '.cs-status',
  '.cs-composer',
  '.cs-impersonate',
  '.cs-avatar',
  '.cs-msg-text',
  '.cs-ticket',
];

// ───────── Image generation ─────────

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  format: 'custom',
  endpoint: '',
  bodyTemplate:
    '{\n  "prompt": "{{prompt}}, {{style}}",\n  "negative_prompt": "{{negative}}",\n  "width": {{width}},\n  "height": {{height}},\n  "steps": {{steps}},\n  "seed": {{seed}}\n}',
  workflow: '',
  responsePath: '$.images[0]',
  model: '',
  negative: 'lowres, bad anatomy, text, watermark',
  styles: [
    { id: 'pastel', label: t('Pastel'), prompt: 'soft pastel colors, dreamy light, gentle shading' },
    { id: 'anime', label: t('Anime'), prompt: 'anime style, clean lineart, cel shading' },
    { id: 'watercolor', label: t('Watercolor'), prompt: 'watercolor painting, paper texture, soft bleeding edges' },
    { id: 'film', label: t('Film'), prompt: '35mm film photo, grain, natural colors, shallow depth of field' },
  ],
  styleId: 'pastel',
  width: 768,
  height: 512,
  steps: 28,
  seed: '',
  count: 4,
  cfg: 7,
  sampler: 'Euler a',
  proxy: '',
  sceneMessages: 6,
  autoSceneEvery: 0,
};

// ───────── Settings ─────────

export function defaultSettings(): Settings {
  return {
    language: 'en',
    prompts: {},
    activeCharacterId: '',
    activeGroupId: '',
    activeChatId: '',
    activePersonaId: '',
    activePresetId: 'sweet-romance',
    profileFor: { chat: '', impersonate: '', memory: '', generator: '', utility: '' },
    theme: { dayId: 'cream-soda', nightId: 'midnight-soda', mode: 'day', applyImmediately: true, customCss: true },
    worldInfo: {
      scanDepth: 4,
      budgetPercent: 25,
      budgetCap: 0,
      recursive: true,
      maxRecursionSteps: 3,
      caseSensitive: false,
      matchWholeWords: false,
      includeNames: true,
      minActivations: 0,
      globalWorldIds: [],
    },
    chat: {
      sendOnEnter: 'enter',
      showTimestamps: true,
      showTokenCounts: false,
      showGenInfo: true,
      autoScroll: true,
      renderMarkdown: true,
      renderHtml: true,
      htmlIframe: true,
      confirmDelete: true,
      smoothStreaming: true,
      collapseReasoning: true,
      autoContinue: false,
      autoContinueMinChars: 200,
      trimIncomplete: false,
      swipeAnimation: true,
      renderLimit: 80,
      autoTitle: true,
      allowScripts: false,
    },
    impersonate: { mode: 'variants', direction: '', count: 3, hidden: false },
    memory: {
      autoEvery: 20,
      suggestFacts: true,
      budget: 1500,
      depth: 0,
    },
    generator: {
      language: 'en',
      template: 'v2',
      customTemplate: '',
      greetings: true,
      lore: true,
      avatarPrompt: false,
      useChat: true,
      useLore: true,
      sampleCardId: '',
    },
    extensions: {
      enabled: { memory: true, impersonate: true, images: true, tts: false, translate: false, dice: false, expressions: false, quickreplies: true },
      tts: { voice: '', rate: 1, pitch: 1, auto: false, onlyQuotes: true },
      translate: { target: '', auto: false, showOriginal: true },
      dice: { showBar: true },
      expressions: { enabled: false, classify: 'keywords' },
    },
    backup: { auto: true, keep: 7, includeKeys: false },
    globalVariables: {},
    tokenizer: 'auto',
    onboarded: false,
  };
}

/**
 * Prompts used to live inside their feature settings and were Russian by default.
 * Carry over only the ones a user rewrote in another language: Russian texts
 * are the old defaults, and prompts are English now.
 */
const LEGACY_PROMPT_FIELDS: [string, string, PromptKey][] = [
  ['impersonate', 'prompts.continue', 'impersonateContinue'],
  ['impersonate', 'prompts.variants', 'impersonateVariants'],
  ['impersonate', 'prompts.action', 'impersonateAction'],
  ['impersonate', 'prompts.voice', 'impersonateVoice'],
  ['memory', 'summaryPrompt', 'memorySummary'],
  ['memory', 'factsPrompt', 'memoryFacts'],
  ['memory', 'template', 'memoryBlock'],
];

export function migrateLegacyPrompt(prompts: Record<string, string>, key: PromptKey, value: unknown) {
  if (typeof value !== 'string' || !value.trim() || /[А-Яа-яЁё]/.test(value)) return;
  if (value !== DEFAULT_PROMPTS[key] && !prompts[key]) prompts[key] = value;
}

/** Fills in fields added in newer versions so old saved settings keep working. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  const s = (saved || {}) as any;
  const out: any = { ...d, ...s };
  // Profiles saved before languages existed were used with the Russian interface: keep it.
  if (s.language !== 'en' && s.language !== 'ru') out.language = Object.keys(s).length ? 'ru' : d.language;
  for (const key of ['profileFor', 'theme', 'worldInfo', 'chat', 'impersonate', 'memory', 'generator', 'backup'] as const) {
    out[key] = { ...(d as any)[key], ...(s[key] || {}) };
  }
  out.prompts = { ...(s.prompts || {}) };
  for (const [section, path, key] of LEGACY_PROMPT_FIELDS) {
    const value = path.split('.').reduce((o: any, k) => o?.[k], s[section]);
    migrateLegacyPrompt(out.prompts, key, value);
  }
  delete out.impersonate.prompts;
  delete out.memory.summaryPrompt;
  delete out.memory.factsPrompt;
  delete out.memory.template;
  out.extensions = {
    ...d.extensions,
    ...(s.extensions || {}),
    enabled: { ...d.extensions.enabled, ...(s.extensions?.enabled || {}) },
    tts: { ...d.extensions.tts, ...(s.extensions?.tts || {}) },
    translate: { ...d.extensions.translate, ...(s.extensions?.translate || {}) },
    dice: { ...d.extensions.dice, ...(s.extensions?.dice || {}) },
    expressions: { ...d.extensions.expressions, ...(s.extensions?.expressions || {}) },
  };
  return out as Settings;
}

// ───────── Demo content for the first launch ─────────

export function demoContent() {
  const lore = newLorebook({
    id: 'night-shibuya',
    name: 'Night Shibuya',
    description: 'Places and people around the Crystal café.',
    entries: [
      newWorldEntry({
        comment: 'Crystal café',
        keys: ['café', 'cafe', 'counter', 'Crystal'],
        content:
          'The Crystal is a tiny late-night café in a Shibuya back alley: six seats at the counter, a dessert display and a neon sign shaped like a glass of cream soda. It closes at midnight. The signature drink is a blue cream soda with vanilla ice cream and a cherry.',
        order: 100,
      }),
      newWorldEntry({
        comment: 'Shibuya Station',
        keys: ['station', 'train', 'subway'],
        content: "Shibuya Station is a seven-minute walk from the café under the awnings. Rin's last train leaves at 00:24.",
        order: 90,
      }),
      newWorldEntry({
        comment: "Rin's family",
        keys: ['family', 'parents', 'mom'],
        secondaryKeys: ['Rin', 'Hokkaido'],
        selectiveLogic: 0,
        content: "Rin's parents live in Hokkaido and run a dairy farm. Rin hasn't seen them in three years and is saving up for a trip home.",
        order: 80,
      }),
    ],
  });
  const rin = newCharacter({
    id: 'hanami-rin',
    name: 'Hanami Rin',
    tagline: 'night barista',
    kana: 'リン',
    palette: 0,
    tags: ['romance', 'slice of life'],
    description:
      "24, barista at the late-night Crystal café in Shibuya. Soft-spoken and wry; by midnight she gets tired and more honest. Saving up for a trip to Hokkaido. Pink bob, an apron with an embroidered cherry, a habit of talking to the coffee machine.",
    personality: 'warm, wry, observant, a little lonely; afraid of thunder but would never admit it in daylight',
    scenario: 'A rainy night, the café is about to close. {{user}} is a regular late-night guest.',
    firstMessage:
      '*Rin sets a tall glass in front of you: blue soda, a scoop of vanilla ice cream and a cherry about to slide off.* "On the house. You came in five minutes before closing again, {{user}}." *She leans on the counter and watches the rain behind the window.* "On nights like this the café feels like an aquarium floating through the city."\n\n[status|23:40 · downpour|Crystal café|warm tiredness|62]',
    alternateGreetings: [
      '*The lights in the café flicker and Rin freezes with a cup in her hands.* "…Not a thunderstorm. Please tell me that was just a truck going by."',
      '*Rin finishes writing "Today: cream soda, no ice" on the chalkboard and turns around.* "Did I guess right? You always order it without ice."',
    ],
    exampleMessages:
      '<START>\n{{user}}: What would you recommend tonight?\n{{char}}: *Rin taps a spoon on the counter, thinking.* "It\'s raining, so something warm inside and cold on top. Cream soda, but I\'ll warm up the cherry for you."',
    creator: 'Cream Soda',
    characterVersion: '1.0',
    worldIds: [lore.id],
    presetId: 'sweet-romance',
    creatorNotes: 'Cream Soda demo character. Feel free to edit or delete it.',
  });
  const yuki = newPersona({
    id: 'yuki',
    name: 'Yuki',
    kana: 'ユ',
    palette: 1,
    description: 'Yuki, 26, a UI designer. Works late and drops by the Crystal before the last train. Calm and observant, carries a big blue umbrella.',
  });
  const guest = newPersona({ id: 'night-guest', name: 'Night guest', kana: 'ヨ', palette: 2, description: 'A nameless wanderer who walks in wherever the lights are on.' });
  const narrator = newPersona({ id: 'narrator', name: 'Narrator', kana: 'カ', palette: 3, description: 'An outside observer who describes events in third person.' });
  return { lore, rin, personas: [yuki, guest, narrator] };
}

export function demoRegexes(): RegexScript[] {
  return [
    newRegex({
      id: 'scene-status',
      name: t('Scene status'),
      findRegex: '/\\[status\\|(.+?)\\|(.+?)\\|(.+?)\\|(\\d+)\\]/g',
      replaceString:
        '<div class="cs-ticket cs-status">\n  <div class="cs-ticket__band"></div>\n  <div class="cs-status__grid">\n    <div><b>Time</b><span>$1</span></div>\n    <div><b>Place</b><span>$2</span></div>\n    <div><b>Mood</b><span>$3</span></div>\n    <div><b>Affection · $4</b><meter value="$4" max="100"></meter></div>\n  </div>\n</div>',
      placement: [2],
      markdownOnly: true,
      renderHtml: true,
      scope: { type: 'global' },
      order: 10,
      testInput: '…like an aquarium."\n[status|23:40 · downpour|Crystal café|warm tiredness|62]',
    }),
    newRegex({
      id: 'no-sighs',
      name: t('Remove "*sighs*"'),
      findRegex: '/\\*\\s*sighs\\s*\\*\\s*/gi',
      replaceString: '',
      placement: [2],
      order: 20,
      testInput: '*sighs* Well then.',
    }),
    newRegex({
      id: 'thoughts-italic',
      name: t('Thoughts in italics'),
      findRegex: '/\\(\\((.+?)\\)\\)/g',
      replaceString: '<i class="cs-thought">$1</i>',
      placement: [1, 2],
      markdownOnly: true,
      renderHtml: true,
      order: 30,
      testInput: '((I wonder if she noticed?)) "Hi."',
    }),
    newRegex({
      id: 'clean-markdown',
      name: t('Markdown cleanup'),
      findRegex: '/^#{1,6}\\s+/gm',
      replaceString: '',
      placement: [1, 2],
      promptOnly: true,
      disabled: true,
      order: 40,
      testInput: '## Heading\nText',
    }),
    newRegex({
      id: 'phone-chat',
      name: t('Phone chat'),
      findRegex: '/\\[phone\\|(.+?)\\|(.+?)\\]/g',
      replaceString: '<div class="cs-phone"><b>$1</b><p>$2</p></div>',
      placement: [2],
      markdownOnly: true,
      renderHtml: true,
      scope: { type: 'character', id: 'hanami-rin' },
      order: 50,
      testInput: '[phone|Rin|Did you get home? Did you remember your umbrella?]',
    }),
  ];
}

export function demoQuickReplies(): QuickReplySet {
  return newQuickReplySet({
    id: 'default-qr',
    name: t('Basics'),
    replies: [
      { id: uid(), label: t('Next'), message: '/continue', title: t('Continue the reply'), autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
      { id: uid(), label: t('Describe the scene'), message: '/sys *The camera pulls back: describe the surroundings and the mood of the scene.*|/trigger', title: '', autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
      { id: uid(), label: t('Roll d20'), message: '/roll 1d20', title: t('d20 die'), autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
    ],
  });
}
