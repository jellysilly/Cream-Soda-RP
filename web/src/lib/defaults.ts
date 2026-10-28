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

const now = () => Date.now();

// ───────── Factories ─────────

export function newCharacter(patch: Partial<Character> = {}): Character {
  return {
    id: uid(),
    name: 'Новый персонаж',
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
    name: 'Я',
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
    name: 'Новая группа',
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
    comment: 'Новая запись',
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
  return { id: uid(), name: 'Новый лорбук', description: '', entries: [], updatedAt: now(), ...patch };
}

export function newPlot(patch: Partial<Plot> = {}): Plot {
  return { id: uid(), title: 'Новый сюжет', premise: '', scenario: '', firstMessage: '', tags: [], charIds: [], updatedAt: now(), ...patch };
}

export function newRegex(patch: Partial<RegexScript> = {}): RegexScript {
  return {
    id: uid(),
    name: 'Новый регекс',
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
    name: 'Новый профиль',
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
  return { id: uid(), name: 'Быстрые ответы', enabled: true, replies: [], updatedAt: now(), ...patch };
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
  charCard: 'маркер карточки',
  charDescription: 'описание из карточки',
  charPersonality: 'характер из карточки',
  scenario: 'сценарий из карточки',
  personaDescription: 'маркер персоны',
  worldInfoBefore: 'лорбук до карточки',
  worldInfoAfter: 'лорбук после карточки',
  dialogueExamples: 'из карточки',
  chatHistory: 'сообщения чата',
  memoryBook: 'главы и факты',
};

export function defaultPromptBlocks(variant: 'romance' | 'noir' | 'quest' = 'romance'): PromptBlock[] {
  const main = {
    romance:
      'Ты — рассказчик ролевой истории. Пиши от третьего лица, короткими абзацами, не решай за {{user}}. Действия и описания выделяй *курсивом*, реплики — «кавычками».',
    noir:
      'Ты — рассказчик неспешной нуарной истории. Пиши от третьего лица, плотной атмосферной прозой: дождь, неон, тени, недосказанность. Не решай и не говори за {{user}}.',
    quest:
      'Ты — ведущий текстового квеста. Описывай окружение, последствия действий {{user}} и персонажей мира. В конце каждого ответа кратко перечисли, что {{user}} может сделать дальше. Никогда не действуй за {{user}}.',
  }[variant];
  const style = {
    romance: 'Стиль: мягкий юмор, сенсорные детали, без пафоса.',
    noir: 'Стиль: медленный темп, короткие хлёсткие реплики, детали города. Не торопи события.',
    quest: 'Стиль: ясные описания, конкретные детали, честные последствия. Держи напряжение.',
  }[variant];
  return [
    block('main', 'Основной промпт', { content: main, builtin: true }),
    block('charCard', 'Описание персонажа · {{char}}', { marker: 'charCard', builtin: true }),
    block('personaDescription', 'Персона · {{user}}', { marker: 'personaDescription', builtin: true }),
    block('worldInfoBefore', 'Лорбук · до истории', { marker: 'worldInfoBefore', builtin: true }),
    block('worldInfoAfter', 'Лорбук · после карточки', { marker: 'worldInfoAfter', builtin: true }),
    block('memoryBook', 'Memory Book', { marker: 'memoryBook', builtin: true }),
    block('dialogueExamples', 'Примеры диалогов', { marker: 'dialogueExamples', builtin: true, enabled: false }),
    block('chatHistory', 'История чата', { marker: 'chatHistory', builtin: true }),
    block('style', variant === 'romance' ? 'Стиль · мягкий роман' : variant === 'noir' ? 'Стиль · нуар' : 'Стиль · квест', {
      content: style,
      position: 'depth',
      depth: 2,
    }),
    block('jailbreak', 'Пост-инструкция', {
      role: 'user',
      content: '[Продолжи сцену от лица {{char}}. Не пиши за {{user}}. Объём — 2–4 абзаца.]',
      builtin: true,
    }),
    block('prefill', 'Префилл ответа', { role: 'assistant', content: '', enabled: false, builtin: true }),
  ];
}

export const DEFAULT_UTILITY = {
  impersonation:
    '[Напиши следующую реплику за {{user}} — от первого лица, в его манере и голосе. Не пиши за {{char}} и не описывай его реакцию. Только текст реплики.]',
  continueNudge: '[Продолжи свой последний ответ с того места, где он оборвался, не повторяя уже написанное.]',
  newChat: '[Начало нового чата]',
  newGroupChat: '[Начало нового группового чата. Участники: {{group}}]',
  newExampleChat: '[Пример диалога]',
  groupNudge: '[Напиши следующий ответ только от лица {{char}}.]',
  wiFormat: '{0}',
  scenarioFormat: 'Сценарий: {{scenario}}',
  personalityFormat: 'Характер {{char}}: {{personality}}',
  sendIfEmpty: '',
};

export function newPreset(patch: Partial<Preset> = {}, variant: 'romance' | 'noir' | 'quest' = 'romance'): Preset {
  return {
    id: uid(),
    name: 'Новый пресет',
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
    newPreset({ id: 'sweet-romance', name: 'Сладкий роман v3' }, 'romance'),
    newPreset(
      { id: 'noir-slow', name: 'Нуар · медленный', samplers: { ...DEFAULT_SAMPLERS, temperature: 0.9, maxTokens: 450 } },
      'noir',
    ),
    newPreset(
      { id: 'text-quest', name: 'Текстовый квест', samplers: { ...DEFAULT_SAMPLERS, temperature: 0.8, topP: 0.95, maxTokens: 700 } },
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
  tpl('plain', 'Без шаблона (Имя: текст)', { namesBehavior: 'always', inputSuffix: '\n', outputSuffix: '\n', systemSuffix: '\n' }),
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
  theme('cream-soda', 'Cream Soda', 'день', false, CREAM_TOKENS),
  theme('midnight-soda', 'Midnight Soda', 'ночь', true, MIDNIGHT_TOKENS),
  theme('strawberry', 'Клубничный торт', 'день', false, {
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
  theme('pudding', 'Пудинг', 'вечер', false, {
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
  { key: 'accent', label: 'Акцент' },
  { key: 'text', label: 'Текст' },
  { key: 'muted', label: 'Приглушённый' },
  { key: 'bubbleChar', label: 'Пузырь чара' },
  { key: 'bubbleUser', label: 'Пузырь игрока' },
  { key: 'card', label: 'HTML-карточки' },
  { key: 'cardText', label: 'Текст карточек' },
  { key: 'surface', label: 'Панели' },
  { key: 'border', label: 'Обводка' },
  { key: 'accentText', label: 'Текст на акценте' },
  { key: 'em', label: 'Курсив (действия)' },
  { key: 'link', label: 'Ссылки' },
  { key: 'field', label: 'Поля ввода' },
  { key: 'fieldBorder', label: 'Обводка полей' },
  { key: 'chip', label: 'Чипы и вкладки' },
  { key: 'mint', label: 'Мятный (статусы)' },
  { key: 'bgSolid', label: 'Фон (сплошной)' },
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
    { id: 'pastel', label: 'Пастель', prompt: 'soft pastel colors, dreamy light, gentle shading' },
    { id: 'anime', label: 'Аниме', prompt: 'anime style, clean lineart, cel shading' },
    { id: 'watercolor', label: 'Акварель', prompt: 'watercolor painting, paper texture, soft bleeding edges' },
    { id: 'film', label: 'Плёнка', prompt: '35mm film photo, grain, natural colors, shallow depth of field' },
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
  scenePrompt:
    'Составь промпт для генератора изображений (на английском, через запятую, до 60 слов), описывающий текущий кадр сцены: место, освещение, персонажей и их внешность, позы, эмоции. Внешность {{char}}: {{description}}. Только промпт, без пояснений.',
  portraitPrompt:
    'Составь промпт для генератора изображений (на английском, через запятую, до 50 слов): портрет {{char}} по пояс, внешность, одежда, выражение лица. Описание: {{description}}. Только промпт.',
  autoSceneEvery: 0,
};

// ───────── Settings ─────────

export const IMPERSONATE_PROMPTS = {
  continue:
    '[Продолжи черновик реплики {{user}} ниже — тем же голосом, 1–3 предложения, без повторов. Верни только продолжение.]\nЧерновик: {{input}}',
  variants:
    '[Предложи {{count}} разных варианта следующей реплики {{user}} — от первого лица, в его манере. Разнообразь тон и действие. Формат строго:\n### 1\nтекст\n### 2\nтекст\n…]',
  action:
    '[Предложи {{count}} варианта следующего действия {{user}} — только действие, без прямой речи, курсивом между *звёздочками*, от первого лица. Формат строго:\n### 1\nтекст\n### 2\nтекст\n…]',
  voice:
    '[Предложи {{count}} варианта реплики {{user}}, максимально точно передающих голос персоны: лексику, ритм, привычки из её описания. Формат строго:\n### 1\nтекст\n### 2\nтекст\n…]',
};

export const MEMORY_SUMMARY_PROMPT =
  'Ты ведёшь «Memory Book» ролевой истории. Сожми фрагмент чата ниже в запись главы.\nОтветь строго в формате:\nНазвание: короткое название главы\nКонспект: 2–4 предложения в прошедшем времени, только важные события, решения, обещания и изменения отношений\nКлючи: 3–5 ключевых слов через запятую\n\nФрагмент:\n{{chunk}}';

export const MEMORY_FACTS_PROMPT =
  'Выпиши из фрагмента ролевого чата ниже до 3 устойчивых фактов о персонажах или мире, которые стоит помнить всю историю (привычки, тайны, обещания, планы). Каждый факт — одной строкой, начиная с «- ». Если ничего нового нет — ответь «нет».\n\nУже известно:\n{{facts}}\n\nФрагмент:\n{{chunk}}';

export function defaultSettings(): Settings {
  return {
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
    },
    impersonate: { mode: 'variants', direction: '', count: 3, prompts: { ...IMPERSONATE_PROMPTS } },
    memory: {
      autoEvery: 20,
      suggestFacts: true,
      budget: 1500,
      summaryPrompt: MEMORY_SUMMARY_PROMPT,
      factsPrompt: MEMORY_FACTS_PROMPT,
      template: '[Память истории]\n{{chapters}}\n[Факты]\n{{facts}}',
      depth: 0,
    },
    generator: {
      language: 'ru',
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
      translate: { target: 'ru', auto: false, showOriginal: true },
      dice: { showBar: true },
      expressions: { enabled: false, classify: 'keywords' },
    },
    backup: { auto: true, keep: 7, includeKeys: false },
    globalVariables: {},
    tokenizer: 'auto',
    onboarded: false,
  };
}

/** Fills in fields added in newer versions so old saved settings keep working. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  const s = (saved || {}) as any;
  const out: any = { ...d, ...s };
  for (const key of ['profileFor', 'theme', 'worldInfo', 'chat', 'impersonate', 'memory', 'generator', 'backup'] as const) {
    out[key] = { ...(d as any)[key], ...(s[key] || {}) };
  }
  out.impersonate.prompts = { ...d.impersonate.prompts, ...(s.impersonate?.prompts || {}) };
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
    name: 'Ночной Сибуя',
    description: 'Места и люди вокруг кафе «Кристалл».',
    entries: [
      newWorldEntry({
        comment: 'Кафе «Кристалл»',
        keys: ['кафе', 'стойка', 'Кристалл'],
        content:
          'Кафе «Кристалл» — крошечное ночное кафе в переулке Сибуи: шесть мест у стойки, витрина с десертами, неоновая вывеска в форме бокала крем-соды. Закрывается в полночь. Фирменный напиток — голубая крем-сода с ванильным мороженым и вишней.',
        order: 100,
      }),
      newWorldEntry({
        comment: 'Станция Сибуя',
        keys: ['станция', 'электричка', 'метро'],
        content: 'До станции Сибуя от кафе семь минут пешком под навесами. Последняя электричка Рин уходит в 00:24.',
        order: 90,
      }),
      newWorldEntry({
        comment: 'Семья Рин',
        keys: ['семья', 'родители', 'мама'],
        secondaryKeys: ['Рин', 'Хоккайдо'],
        selectiveLogic: 0,
        content: 'Родители Рин живут на Хоккайдо и держат молочную ферму. Рин не видела их три года и копит на поездку домой.',
        order: 80,
      }),
    ],
  });
  const rin = newCharacter({
    id: 'hanami-rin',
    name: 'Ханами Рин',
    tagline: 'night barista',
    kana: 'リン',
    palette: 0,
    tags: ['романтика', 'быт'],
    description:
      '24 года, бариста ночного кафе «Кристалл» в Сибуе. Мягкая, ироничная, к полуночи устаёт и становится честнее. Копит на поездку на Хоккайдо. Розовое каре, фартук с вышитой вишней, привычка говорить с кофемашиной.',
    personality: 'тёплая, ироничная, наблюдательная, немного одинокая; боится грома, но не признаётся днём',
    scenario: 'Дождливая ночь, кафе вот-вот закроется. {{user}} — постоянный поздний гость.',
    firstMessage:
      '*Рин ставит перед тобой высокий бокал: голубая газировка, шарик ванильного мороженого и вишенка, которая вот-вот соскользнёт.* «За счёт заведения. Ты опять пришёл за пять минут до закрытия, {{user}}». *Она опирается на стойку и смотрит на дождь за витриной.* «В такие ночи мне кажется, что кафе плывёт по городу, как аквариум».\n\n[status|23:40 · ливень|Кафе «Кристалл»|тёплая усталость|62]',
    alternateGreetings: [
      '*Свет в кафе мигает, и Рин замирает с чашкой в руках.* «…Только не гроза. Пожалуйста, скажи, что это просто фура проехала».',
      '*Рин дописывает мелом на доске «Сегодня: крем-сода без льда» и оборачивается.* «Угадала? Ты ведь всегда заказываешь без льда».',
    ],
    exampleMessages:
      '<START>\n{{user}}: Что посоветуешь сегодня?\n{{char}}: *Рин задумчиво постукивает ложечкой по стойке.* «Сегодня дождь, значит — что-то тёплое внутри и холодное сверху. Крем-сода, но я подогрею тебе вишню».',
    creator: 'Cream Soda',
    characterVersion: '1.0',
    worldIds: [lore.id],
    presetId: 'sweet-romance',
    creatorNotes: 'Демо-персонаж Cream Soda. Можно смело редактировать или удалить.',
  });
  const yuki = newPersona({
    id: 'yuki',
    name: 'Юки',
    kana: 'ユ',
    palette: 1,
    description: 'Юки, 26 лет, дизайнер интерфейсов. Задерживается на работе и заходит в «Кристалл» перед последней электричкой. Спокойный, наблюдательный, носит большой синий зонт.',
  });
  const guest = newPersona({ id: 'night-guest', name: 'Ночной гость', kana: 'ヨ', palette: 2, description: 'Безымянный путник, который заходит туда, где горит свет.' });
  const narrator = newPersona({ id: 'narrator', name: 'Рассказчик', kana: 'カ', palette: 3, description: 'Наблюдатель со стороны, описывающий события от третьего лица.' });
  return { lore, rin, personas: [yuki, guest, narrator] };
}

export function demoRegexes(): RegexScript[] {
  return [
    newRegex({
      id: 'scene-status',
      name: 'Статус сцены',
      findRegex: '/\\[status\\|(.+?)\\|(.+?)\\|(.+?)\\|(\\d+)\\]/g',
      replaceString:
        '<div class="cs-ticket cs-status">\n  <div class="cs-ticket__band"></div>\n  <div class="cs-status__grid">\n    <div><b>Время</b><span>$1</span></div>\n    <div><b>Место</b><span>$2</span></div>\n    <div><b>Настроение</b><span>$3</span></div>\n    <div><b>Симпатия · $4</b><meter value="$4" max="100"></meter></div>\n  </div>\n</div>',
      placement: [2],
      markdownOnly: true,
      renderHtml: true,
      scope: { type: 'global' },
      order: 10,
      testInput: '…как аквариум».\n[status|23:40 · ливень|Кафе «Кристалл»|тёплая усталость|62]',
    }),
    newRegex({
      id: 'no-sighs',
      name: 'Убрать «*вздыхает*»',
      findRegex: '/\\*\\s*вздыхает\\s*\\*\\s*/gi',
      replaceString: '',
      placement: [2],
      order: 20,
      testInput: '*вздыхает* Ну что ж.',
    }),
    newRegex({
      id: 'thoughts-italic',
      name: 'Мысли курсивом',
      findRegex: '/\\(\\((.+?)\\)\\)/g',
      replaceString: '<i class="cs-thought">$1</i>',
      placement: [1, 2],
      markdownOnly: true,
      renderHtml: true,
      order: 30,
      testInput: '((Интересно, она заметила?)) «Привет».',
    }),
    newRegex({
      id: 'clean-markdown',
      name: 'Чистка markdown',
      findRegex: '/^#{1,6}\\s+/gm',
      replaceString: '',
      placement: [1, 2],
      promptOnly: true,
      disabled: true,
      order: 40,
      testInput: '## Заголовок\nТекст',
    }),
    newRegex({
      id: 'phone-chat',
      name: 'Телефонный чат',
      findRegex: '/\\[phone\\|(.+?)\\|(.+?)\\]/g',
      replaceString: '<div class="cs-phone"><b>$1</b><p>$2</p></div>',
      placement: [2],
      markdownOnly: true,
      renderHtml: true,
      scope: { type: 'character', id: 'hanami-rin' },
      order: 50,
      testInput: '[phone|Рин|Ты дошёл? Зонт не забыл?]',
    }),
  ];
}

export function demoQuickReplies(): QuickReplySet {
  return newQuickReplySet({
    id: 'default-qr',
    name: 'Основные',
    replies: [
      { id: uid(), label: 'Дальше', message: '/continue', title: 'Продолжить ответ', autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
      { id: uid(), label: 'Описать сцену', message: '/sys *Камера отъезжает: опиши окружение и настроение сцены.*|/trigger', title: '', autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
      { id: uid(), label: 'Бросок d20', message: '/roll 1d20', title: 'Кубик d20', autoOnNewChat: false, autoOnUser: false, autoOnAi: false },
    ],
  });
}
