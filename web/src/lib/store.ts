import { create } from 'zustand';
import { api } from './api';
import type {
  Character,
  Chat,
  ChatSummary,
  ConnectionProfile,
  ExtensionInfo,
  Group,
  ImageSettings,
  InstructTemplate,
  Lorebook,
  Persona,
  Plot,
  Preset,
  QuickReplySet,
  RegexScript,
  Settings,
  Theme,
} from './types';
import {
  BUILTIN_INSTRUCT,
  BUILTIN_THEMES,
  DEFAULT_IMAGE_SETTINGS,
  demoContent,
  demoQuickReplies,
  demoRegexes,
  mergeSettings,
  newPreset,
  seedPresets,
} from './defaults';
import { debounce } from './utils';

export type Route =
  | 'chat'
  | 'library'
  | 'presets'
  | 'generator'
  | 'memory'
  | 'images'
  | 'regex'
  | 'modules'
  | 'settings';

export type SettingsTab = 'connections' | 'theme' | 'data' | 'chat' | 'launcher';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'warn';
  text: string;
}

/** Collections synchronised with the server: name → state key. */
const COLLECTION_KEYS = {
  characters: 'characters',
  personas: 'personas',
  worlds: 'worlds',
  presets: 'presets',
  instruct: 'instruct',
  regex: 'regex',
  themes: 'themes',
  connections: 'connections',
  plots: 'plots',
  groups: 'groups',
  quickreplies: 'quickreplies',
} as const;

export type CollectionName = keyof typeof COLLECTION_KEYS;

type CollectionItem = {
  characters: Character;
  personas: Persona;
  worlds: Lorebook;
  presets: Preset;
  instruct: InstructTemplate;
  regex: RegexScript;
  themes: Theme;
  connections: ConnectionProfile;
  plots: Plot;
  groups: Group;
  quickreplies: QuickReplySet;
};

export interface GenState {
  /** What is being generated right now (null when idle). */
  kind: null | 'reply' | 'swipe' | 'continue' | 'impersonate' | 'memory' | 'image' | 'generator' | 'quiet';
  messageId?: string;
  startedAt?: number;
  charName?: string;
}

export interface AppState {
  ready: boolean;
  bootError: string;
  version: string;
  profile: string;
  profiles: string[];
  isLocal: boolean;

  route: Route;
  routeParam: string;
  settingsTab: SettingsTab;

  settings: Settings;
  imageSettings: ImageSettings;
  extensionsState: Record<string, { enabled: boolean }>;
  secrets: Record<string, string>;
  extensions: ExtensionInfo[];

  characters: Character[];
  personas: Persona[];
  worlds: Lorebook[];
  presets: Preset[];
  instruct: InstructTemplate[];
  regex: RegexScript[];
  themes: Theme[];
  connections: ConnectionProfile[];
  plots: Plot[];
  groups: Group[];
  quickreplies: QuickReplySet[];

  chat: Chat | null;
  chatList: ChatSummary[];
  gen: GenState;
  streamText: string;
  streamReasoning: string;
  /** Lore entries activated by the last generation (for «Активный лор»). */
  activeLore: { uid: string; title: string; keys: string; state: 'active' | 'waiting' }[];
  lastPrompt: { messages: { role: string; content: string }[]; tokens: number; breakdown: Record<string, number> } | null;
  contextTokens: number;
  impersonateVariants: string[];
  composerDraft: string;

  toasts: Toast[];
  nightPreview: boolean;
}

export const useStore = create<AppState>(() => ({
  ready: false,
  bootError: '',
  version: '',
  profile: 'default',
  profiles: [],
  isLocal: true,

  route: 'chat',
  routeParam: '',
  settingsTab: 'connections',

  settings: mergeSettings(undefined),
  imageSettings: { ...DEFAULT_IMAGE_SETTINGS },
  extensionsState: {},
  secrets: {},
  extensions: [],

  characters: [],
  personas: [],
  worlds: [],
  presets: [],
  instruct: [],
  regex: [],
  themes: [],
  connections: [],
  plots: [],
  groups: [],
  quickreplies: [],

  chat: null,
  chatList: [],
  gen: { kind: null },
  streamText: '',
  streamReasoning: '',
  activeLore: [],
  lastPrompt: null,
  contextTokens: 0,
  impersonateVariants: [],
  composerDraft: '',

  toasts: [],
  nightPreview: false,
}));

export const getState = useStore.getState;
export const setState = useStore.setState;

// ───────── Toasts ─────────

let toastSeq = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4200) {
  const id = toastSeq++;
  setState((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function toastError(err: unknown, prefix = '') {
  const msg = err instanceof Error ? err.message : String(err);
  toast(prefix ? `${prefix}: ${msg}` : msg, 'error', 7000);
}

// ───────── Routing (hash based: #/library, #/settings/theme) ─────────

export function navigate(route: Route, param = '') {
  const hash = `#/${route}${param ? `/${param}` : ''}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  applyHash();
}

export function applyHash() {
  const [, route = 'chat', param = ''] = location.hash.split('/');
  const known: Route[] = ['chat', 'library', 'presets', 'generator', 'memory', 'images', 'regex', 'modules', 'settings'];
  const r = (known.includes(route as Route) ? route : 'chat') as Route;
  const patch: Partial<AppState> = { route: r, routeParam: decodeURIComponent(param) };
  if (r === 'settings' && param) patch.settingsTab = param as SettingsTab;
  setState(patch);
}

// ───────── Persistence ─────────

const pending = new Map<string, ReturnType<typeof debounce>>();

function persistItem(collection: CollectionName, item: { id: string }) {
  const key = `${collection}:${item.id}`;
  let fn = pending.get(key);
  if (!fn) {
    fn = debounce((data: { id: string }) => {
      api.put(collection, data.id, data).catch((err) => toastError(err, 'Не удалось сохранить'));
    }, 450);
    pending.set(key, fn);
  }
  fn(item);
}

export function flushPending() {
  for (const fn of pending.values()) fn.flush();
  saveSettingsNow();
  saveChatNow();
}

/** Inserts or replaces an item in a synced collection and saves it on the server. */
export function upsert<C extends CollectionName>(collection: C, item: CollectionItem[C]) {
  const key = COLLECTION_KEYS[collection];
  const stamped = { ...item, updatedAt: Date.now() } as CollectionItem[C];
  setState((s) => {
    const list = (s as any)[key] as { id: string }[];
    const idx = list.findIndex((x) => x.id === stamped.id);
    const next = idx === -1 ? [...list, stamped] : list.map((x, i) => (i === idx ? stamped : x));
    return { [key]: next } as any;
  });
  persistItem(collection, stamped);
  return stamped;
}

export function patchItem<C extends CollectionName>(collection: C, id: string, patch: Partial<CollectionItem[C]>) {
  const list = (getState() as any)[COLLECTION_KEYS[collection]] as CollectionItem[C][];
  const item = list.find((x: any) => x.id === id);
  if (!item) return;
  upsert(collection, { ...item, ...patch });
}

export async function removeItem(collection: CollectionName, id: string, withChats = false) {
  const key = COLLECTION_KEYS[collection];
  pending.get(`${collection}:${id}`)?.cancel();
  setState((s) => ({ [key]: ((s as any)[key] as { id: string }[]).filter((x) => x.id !== id) }) as any);
  await api.remove(collection, id, withChats);
}

// Settings are one document; saved debounced.
const saveSettingsDebounced = debounce(() => {
  api.putDoc('settings', getState().settings).catch((err) => toastError(err, 'Настройки не сохранились'));
}, 600);

function saveSettingsNow() {
  saveSettingsDebounced.flush();
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  setState((st) => {
    const p = typeof patch === 'function' ? patch(st.settings) : patch;
    return { settings: { ...st.settings, ...p } };
  });
  saveSettingsDebounced();
}

export function updateSettingsSection<K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) {
  updateSettings((s) => ({ [key]: { ...(s[key] as object), ...(patch as object) } }) as Partial<Settings>);
}

const saveImageSettings = debounce(() => {
  api.putDoc('imagegen', getState().imageSettings).catch((err) => toastError(err, 'Настройки картинок не сохранились'));
}, 600);

export function updateImageSettings(patch: Partial<ImageSettings>) {
  setState((s) => ({ imageSettings: { ...s.imageSettings, ...patch } }));
  saveImageSettings();
}

// ───────── Chat persistence ─────────

const saveChatDebounced = debounce(() => {
  const chat = getState().chat;
  if (!chat) return;
  api.putChat(chat).catch((err) => toastError(err, 'Чат не сохранился'));
}, 700);

function saveChatNow() {
  saveChatDebounced.flush();
}

export function setChat(updater: (c: Chat) => Chat, save = true) {
  const chat = getState().chat;
  if (!chat) return;
  const next = { ...updater(chat), updatedAt: Date.now() };
  setState({ chat: next });
  if (save) saveChatDebounced();
}

export function saveChatImmediately() {
  saveChatDebounced.cancel();
  const chat = getState().chat;
  if (chat) return api.putChat(chat).catch((err) => toastError(err, 'Чат не сохранился'));
}

window.addEventListener('beforeunload', () => {
  for (const fn of pending.values()) fn.flush();
  saveSettingsDebounced.flush();
  const chat = getState().chat;
  if (chat && saveChatDebounced) {
    saveChatDebounced.cancel();
    api.putChat(chat, true).catch(() => {});
  }
});

// ───────── Boot ─────────

export async function boot() {
  try {
    const data = await api.bootstrap();
    const c = data.collections;
    const settings = mergeSettings(data.docs.settings);
    const state: Partial<AppState> = {
      version: data.version,
      profile: data.profile,
      profiles: data.profiles,
      isLocal: data.isLocal,
      settings,
      imageSettings: { ...DEFAULT_IMAGE_SETTINGS, ...(data.docs.imagegen || {}) },
      extensionsState: data.docs['extensions-state'] || {},
      secrets: data.secrets,
      extensions: data.extensions,
      characters: c.characters || [],
      personas: c.personas || [],
      worlds: c.worlds || [],
      presets: c.presets || [],
      instruct: [...BUILTIN_INSTRUCT, ...(c.instruct || []).filter((t: InstructTemplate) => !BUILTIN_INSTRUCT.some((b) => b.id === t.id))],
      regex: c.regex || [],
      themes: [...BUILTIN_THEMES.filter((t) => !(c.themes || []).some((x: Theme) => x.id === t.id)), ...(c.themes || [])],
      connections: c.connections || [],
      plots: c.plots || [],
      groups: c.groups || [],
      quickreplies: c.quickreplies || [],
    };
    setState(state);
    if (!settings.onboarded) await seedFirstRun();
    if (!getState().presets.length) upsert('presets', newPreset({ id: 'sweet-romance', name: 'Сладкий роман v3' }));
    setState({ ready: true });
  } catch (err) {
    setState({ bootError: err instanceof Error ? err.message : String(err) });
  }
}

/** First launch: demo character, lorebook, personas, presets, regexes. */
async function seedFirstRun() {
  const s = getState();
  if (!s.presets.length) for (const p of seedPresets()) upsert('presets', p);
  if (!s.characters.length && !s.worlds.length) {
    const demo = demoContent();
    upsert('worlds', demo.lore);
    upsert('characters', demo.rin);
    for (const p of demo.personas) upsert('personas', p);
    updateSettings({ activePersonaId: demo.personas[0].id });
  }
  if (!s.regex.length) for (const r of demoRegexes()) upsert('regex', r);
  if (!s.quickreplies.length) upsert('quickreplies', demoQuickReplies());
  updateSettings({ onboarded: true });
}

// ───────── Selectors ─────────

export function activeCharacter(s: AppState = getState()): Character | undefined {
  if (s.chat?.ownerType === 'character') return s.characters.find((c) => c.id === s.chat!.ownerId);
  return s.characters.find((c) => c.id === s.settings.activeCharacterId);
}

export function activeGroup(s: AppState = getState()): Group | undefined {
  if (s.chat?.ownerType === 'group') return s.groups.find((g) => g.id === s.chat!.ownerId);
  return undefined;
}

export function activePersona(s: AppState = getState()): Persona | undefined {
  const chatPersona = s.chat?.meta.personaId;
  const id = chatPersona || s.settings.activePersonaId;
  return s.personas.find((p) => p.id === id) || s.personas[0];
}

export function activePreset(s: AppState = getState()): Preset {
  return s.presets.find((p) => p.id === s.settings.activePresetId) || s.presets[0] || newPreset({ id: 'fallback', name: 'Пресет' });
}

export function connectionFor(task: keyof Settings['profileFor'], s: AppState = getState()): ConnectionProfile | undefined {
  const id = s.settings.profileFor[task] || s.settings.profileFor.chat;
  return s.connections.find((c) => c.id === id) || s.connections.find((c) => c.id === s.settings.profileFor.chat) || s.connections[0];
}

export function isNight(s: AppState = getState()): boolean {
  const mode = s.settings.theme.mode;
  if (mode === 'auto') {
    const h = new Date().getHours();
    return h >= 21 || h < 7;
  }
  return mode === 'night';
}

export function currentThemeId(s: AppState = getState()): string {
  return isNight(s) ? s.settings.theme.nightId : s.settings.theme.dayId;
}

export function extEnabled(name: string, s: AppState = getState()): boolean {
  return !!s.settings.extensions.enabled[name];
}
