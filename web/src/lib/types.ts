export type ID = string;
export type Role = 'system' | 'user' | 'assistant';

// ───────── Characters, personas, groups ─────────

export interface DepthPrompt {
  prompt: string;
  depth: number;
  role: Role;
}

export interface Character {
  id: ID;
  name: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  groupGreetings: string[];
  exampleMessages: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  creatorNotes: string;
  creator: string;
  characterVersion: string;
  nickname: string;
  tags: string[];
  avatar: string;
  kana: string;
  palette: number;
  fav: boolean;
  talkativeness: number;
  depthPrompt: DepthPrompt;
  /** Linked lorebooks (the first one is the card's own book). */
  worldIds: ID[];
  /** Preset that is switched on when a chat with this character opens. */
  presetId: ID;
  /** Expression sprites: emotion → image url. */
  sprites: Record<string, string>;
  /** Unknown card extensions, preserved for lossless export. */
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type PersonaPosition = 'prompt' | 'an_top' | 'an_bottom' | 'depth' | 'none';

export interface Persona {
  id: ID;
  name: string;
  title: string;
  description: string;
  avatar: string;
  kana: string;
  palette: number;
  position: PersonaPosition;
  depth: number;
  role: Role;
  /** Characters that automatically switch to this persona. */
  lockedCharIds: ID[];
  updatedAt: number;
}

export type GroupActivation = 'natural' | 'list' | 'manual' | 'pooled';

export interface Group {
  id: ID;
  name: string;
  memberIds: ID[];
  mutedIds: ID[];
  activation: GroupActivation;
  allowSelfResponses: boolean;
  generationMode: 'swap' | 'append';
  autoMode: boolean;
  autoModeDelay: number;
  scenario: string;
  avatar: string;
  fav: boolean;
  updatedAt: number;
}

// ───────── World info ─────────

/** 0 before char defs · 1 after char defs · 2 AN top · 3 AN bottom · 4 @depth · 5 before examples · 6 after examples · 7 outlet */
export type WIPosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 0 AND ANY · 1 NOT ALL · 2 NOT ANY · 3 AND ALL */
export type WILogic = 0 | 1 | 2 | 3;

export interface WorldEntry {
  uid: ID;
  comment: string;
  keys: string[];
  secondaryKeys: string[];
  selectiveLogic: WILogic;
  content: string;
  enabled: boolean;
  constant: boolean;
  position: WIPosition;
  depth: number;
  role: Role;
  order: number;
  probability: number;
  useProbability: boolean;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  scanDepth: number | null;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  sticky: number;
  cooldown: number;
  delay: number;
  outletName: string;
  extra: Record<string, unknown>;
}

export interface Lorebook {
  id: ID;
  name: string;
  description: string;
  entries: WorldEntry[];
  updatedAt: number;
}

export interface WISettings {
  scanDepth: number;
  budgetPercent: number;
  budgetCap: number;
  recursive: boolean;
  maxRecursionSteps: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  includeNames: boolean;
  minActivations: number;
  globalWorldIds: ID[];
}

// ───────── Presets ─────────

export type MarkerKind =
  | 'charCard'
  | 'charDescription'
  | 'charPersonality'
  | 'scenario'
  | 'personaDescription'
  | 'worldInfoBefore'
  | 'worldInfoAfter'
  | 'dialogueExamples'
  | 'chatHistory'
  | 'memoryBook';

export interface PromptBlock {
  id: ID;
  name: string;
  role: Role;
  content: string;
  enabled: boolean;
  marker?: MarkerKind;
  /** relative: placed in block order · depth: injected into chat history at `depth` */
  position: 'relative' | 'depth';
  depth: number;
  order: number;
  builtin?: boolean;
}

export interface Samplers {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  topA: number;
  typicalP: number;
  repetitionPenalty: number;
  repPenRange: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  contextSize: number;
  stream: boolean;
  seed: number;
  stop: string[];
  logitBias: string;
  reasoningEffort: '' | 'low' | 'medium' | 'high';
  thinkingBudget: number;
  dryMultiplier: number;
  xtcProbability: number;
  xtcThreshold: number;
}

export interface PresetUtility {
  impersonation: string;
  continueNudge: string;
  newChat: string;
  newGroupChat: string;
  newExampleChat: string;
  groupNudge: string;
  wiFormat: string;
  scenarioFormat: string;
  personalityFormat: string;
  sendIfEmpty: string;
}

export interface ReasoningSettings {
  autoParse: boolean;
  prefix: string;
  suffix: string;
  addToPrompt: boolean;
}

export interface Preset {
  id: ID;
  name: string;
  samplers: Samplers;
  prompts: PromptBlock[];
  utility: PresetUtility;
  namesBehavior: 'none' | 'default' | 'content';
  squashSystem: boolean;
  instructId: ID;
  reasoning: ReasoningSettings;
  extensions: Record<string, unknown>;
  updatedAt: number;
}

export interface InstructTemplate {
  id: ID;
  name: string;
  inputSequence: string;
  outputSequence: string;
  systemSequence: string;
  inputSuffix: string;
  outputSuffix: string;
  systemSuffix: string;
  firstOutputSequence: string;
  lastOutputSequence: string;
  stopSequence: string;
  storyStringPrefix: string;
  storyStringSuffix: string;
  wrap: boolean;
  namesBehavior: 'none' | 'force' | 'always';
  systemSameAsUser: boolean;
  builtin?: boolean;
}

// ───────── Regex ─────────

export type RegexPlacement = 1 | 2 | 3 | 5 | 6;

export interface RegexScript {
  id: ID;
  name: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: RegexPlacement[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: 0 | 1 | 2;
  minDepth: number | null;
  maxDepth: number | null;
  renderHtml: boolean;
  scope: { type: 'global' } | { type: 'character'; id: ID } | { type: 'preset'; id: ID };
  order: number;
  testInput: string;
  updatedAt: number;
}

// ───────── Chats ─────────

export interface Attachment {
  kind: 'image' | 'file';
  url: string;
  name: string;
  mime: string;
  text?: string;
}

export interface GenMeta {
  model?: string;
  api?: string;
  ms?: number;
  tokens?: number;
  finish?: string;
}

export interface Swipe {
  text: string;
  reasoning?: string;
  date: number;
  gen?: GenMeta;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'char' | 'system';
  name: string;
  charId?: ID;
  personaId?: ID;
  avatar?: string;
  text: string;
  reasoning?: string;
  swipes: Swipe[];
  swipeId: number;
  sendDate: number;
  hidden?: boolean;
  bookmark?: boolean;
  attachments?: Attachment[];
  image?: string;
  translation?: string;
  gen?: GenMeta;
}

export interface AuthorNote {
  text: string;
  depth: number;
  interval: number;
  role: Role;
  position: 'depth' | 'after_main' | 'before_main';
}

export interface MemoryChapter {
  id: ID;
  title: string;
  fromId: ID;
  toId: ID;
  summary: string;
  keys: string[];
  insertion: 'always' | 'keys' | 'off';
  importance: number;
  status: 'memory' | 'draft';
  updatedAt: number;
}

export interface MemoryFact {
  id: ID;
  text: string;
  enabled: boolean;
}

export interface MemoryBook {
  chapters: MemoryChapter[];
  facts: MemoryFact[];
}

export interface WITimedState {
  sticky: Record<string, number>;
  cooldown: Record<string, number>;
}

export interface ChatMeta {
  authorNote: AuthorNote;
  variables: Record<string, string>;
  personaId?: ID;
  worldIds: ID[];
  scenarioOverride?: string;
  background?: string;
  memory: MemoryBook;
  wiTimed?: WITimedState;
  sceneImage?: string;
  plotId?: ID;
}

export interface Chat {
  id: ID;
  ownerType: 'character' | 'group';
  ownerId: ID;
  title: string;
  createdAt: number;
  updatedAt: number;
  parentId?: ID | null;
  branchPoint?: number | null;
  messages: ChatMessage[];
  meta: ChatMeta;
}

export interface ChatSummary {
  id: ID;
  ownerType: 'character' | 'group';
  ownerId: ID;
  title: string;
  createdAt: number;
  updatedAt: number;
  parentId: ID | null;
  branchPoint: number | null;
  messageCount: number;
  preview: string;
  size: number;
}

// ───────── Plots (сюжеты) ─────────

export interface Plot {
  id: ID;
  title: string;
  premise: string;
  scenario: string;
  firstMessage: string;
  tags: string[];
  charIds: ID[];
  updatedAt: number;
}

// ───────── Connections ─────────

export type ApiType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'textcompletion' | 'ollama' | 'custom';

export interface ConnectionProfile {
  id: ID;
  name: string;
  api: ApiType;
  baseUrl: string;
  model: string;
  /** For text completion backends: wire format. */
  tcFlavor: 'openai' | 'kobold';
  /** Chat Completion vs Text Completion for Ollama / custom. */
  mode: 'chat' | 'text';
  proxy: string;
  timeout: number;
  headers: { name: string; value: string }[];
  extraBody: string;
  contextOverride: number;
  vision: boolean;
  status?: { ok: boolean; latency: number; at: number; error?: string };
  updatedAt: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number | null;
  vision?: boolean;
}

// ───────── Themes ─────────

export interface ThemeTokens {
  bg: string;
  bgSolid: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  link: string;
  bubbleChar: string;
  bubbleUser: string;
  em: string;
  card: string;
  cardText: string;
  cardLabel: string;
  cardBorder: string;
  field: string;
  fieldBorder: string;
  chip: string;
  mint: string;
}

export interface Theme {
  id: ID;
  name: string;
  note: string;
  dark: boolean;
  builtin?: boolean;
  tokens: ThemeTokens;
  radius: number;
  blur: number;
  grain: number;
  glow: number;
  fontHeading: string;
  fontBody: string;
  fontUrl: string;
  chatView: 'bubbles' | 'document' | 'vn';
  background: 'gradient' | 'image' | 'scene';
  backgroundImage: string;
  css: { theme: string; chat: string; mobile: string };
  updatedAt: number;
}

// ───────── Quick replies ─────────

export interface QuickReply {
  id: ID;
  label: string;
  message: string;
  title: string;
  autoOnNewChat: boolean;
  autoOnUser: boolean;
  autoOnAi: boolean;
}

export interface QuickReplySet {
  id: ID;
  name: string;
  enabled: boolean;
  replies: QuickReply[];
  updatedAt: number;
}

// ───────── Settings ─────────

export type ImpersonateMode = 'continue' | 'variants' | 'action' | 'voice';

export interface ImageSettings {
  format: 'custom' | 'a1111' | 'comfy' | 'openai';
  endpoint: string;
  bodyTemplate: string;
  workflow: string;
  responsePath: string;
  model: string;
  negative: string;
  styles: { id: ID; label: string; prompt: string }[];
  styleId: ID;
  width: number;
  height: number;
  steps: number;
  seed: string;
  count: number;
  cfg: number;
  sampler: string;
  proxy: string;
  sceneMessages: number;
  scenePrompt: string;
  portraitPrompt: string;
  autoSceneEvery: number;
}

export interface Settings {
  activeCharacterId: ID;
  activeGroupId: ID;
  activeChatId: ID;
  activePersonaId: ID;
  activePresetId: ID;
  profileFor: {
    chat: ID;
    impersonate: ID;
    memory: ID;
    generator: ID;
    utility: ID;
  };
  theme: {
    dayId: ID;
    nightId: ID;
    mode: 'day' | 'night' | 'auto';
    applyImmediately: boolean;
    customCss: boolean;
  };
  worldInfo: WISettings;
  chat: {
    sendOnEnter: 'enter' | 'ctrlEnter';
    showTimestamps: boolean;
    showTokenCounts: boolean;
    showGenInfo: boolean;
    autoScroll: boolean;
    renderMarkdown: boolean;
    renderHtml: boolean;
    htmlIframe: boolean;
    confirmDelete: boolean;
    smoothStreaming: boolean;
    collapseReasoning: boolean;
    autoContinue: boolean;
    autoContinueMinChars: number;
    trimIncomplete: boolean;
    swipeAnimation: boolean;
    renderLimit: number;
    autoTitle: boolean;
  };
  impersonate: {
    mode: ImpersonateMode;
    direction: string;
    count: number;
    prompts: Record<ImpersonateMode, string>;
  };
  memory: {
    autoEvery: number;
    suggestFacts: boolean;
    budget: number;
    summaryPrompt: string;
    factsPrompt: string;
    template: string;
    depth: number;
  };
  generator: {
    language: 'ru' | 'en';
    template: 'v2' | 'compact' | 'custom';
    customTemplate: string;
    greetings: boolean;
    lore: boolean;
    avatarPrompt: boolean;
    useChat: boolean;
    useLore: boolean;
    sampleCardId: ID;
  };
  extensions: {
    enabled: Record<string, boolean>;
    tts: { voice: string; rate: number; pitch: number; auto: boolean; onlyQuotes: boolean };
    translate: { target: string; auto: boolean; showOriginal: boolean };
    dice: { showBar: boolean };
    expressions: { enabled: boolean; classify: 'keywords' | 'llm' };
  };
  backup: { auto: boolean; keep: number; includeKeys: boolean };
  globalVariables: Record<string, string>;
  tokenizer: 'auto' | 'o200k' | 'cl100k' | 'estimate';
  onboarded: boolean;
}

export interface ExtensionInfo {
  name: string;
  displayName: string;
  version: string;
  author: string;
  homePage: string;
  js: string;
  css: string;
  loadingOrder: number;
  isGit: boolean;
}

export interface RequestLogItem {
  id: ID;
  time: number;
  status: number;
  label: string;
  api: string;
  model: string;
  profile?: string;
  url?: string;
  duration?: number;
  error?: string;
  aborted?: boolean;
  request?: unknown;
  response?: string;
  usage?: Record<string, number>;
}

export interface SystemInfo {
  version: string;
  port: number;
  host: string;
  profile: string;
  profiles: string[];
  dataRoot?: string;
  launcher: { kind: string; version?: string } | null;
  lan: { enabled: boolean; addresses: string[]; url: string; display: string; qr: string };
}
