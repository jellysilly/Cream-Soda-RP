import { create } from 'zustand';
import { api } from './api';
import { getState, setState, toast, activeCharacter, activePersona, setChat, updateSettings } from './store';
import { onEvent, emitEvent } from './events';
import { quietGenerate, sendUserMessage, generateReplies, macroEnvFor, utilityGenerate } from './generate';
import { registerSlashCommand, runSlash } from './slash';
import { substituteMacros } from './macros';
import { newMessage } from './defaults';

/**
 * Third-party extensions. Each one is loaded as an ES module from
 * /extensions/<name>/<manifest.js> and talks to the app through window.CreamSoda.
 * A partial window.SillyTavern.getContext() shim covers the most common calls of
 * SillyTavern extensions (chat, characters, eventSource, generateQuietPrompt…).
 */

export interface ExtensionPanel {
  id: string;
  title: string;
  extension: string;
  render: (container: HTMLElement) => void | (() => void);
}

export const useExtensionPanels = create<{ panels: ExtensionPanel[]; loaded: string[]; failed: Record<string, string> }>(() => ({
  panels: [],
  loaded: [],
  failed: {},
}));

const EVENT_TYPES = {
  APP_READY: 'app_ready',
  CHAT_CHANGED: 'chat_changed',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_SWIPED: 'message_swiped',
  GENERATION_STARTED: 'generation_started',
  CHARACTER_MESSAGE_RENDERED: 'message_received',
  USER_MESSAGE_RENDERED: 'message_sent',
  SETTINGS_UPDATED: 'settings_updated',
};

function extSettingsDoc() {
  return getState().extensionsState as Record<string, any>;
}

function saveExtensionSettings() {
  api.putDoc('extensions-state', getState().extensionsState).catch(() => {});
}

function context() {
  const s = getState();
  const char = activeCharacter(s);
  const persona = activePersona(s);
  const chat = s.chat;
  return {
    // Cream Soda names
    state: s,
    chatId: chat?.id,
    chat: chat?.messages.map((m) => ({
      name: m.name,
      is_user: m.role === 'user',
      is_system: m.role === 'system',
      mes: m.text,
      swipes: m.swipes.map((x) => x.text),
      swipe_id: m.swipeId,
      send_date: m.sendDate,
      extra: { reasoning: m.reasoning },
    })) || [],
    messages: chat?.messages || [],
    characters: s.characters,
    groups: s.groups,
    characterId: char?.id,
    groupId: chat?.ownerType === 'group' ? chat.ownerId : undefined,
    name1: persona?.name || 'Ты',
    name2: char?.name || '',
    chatMetadata: chat?.meta || {},
    variables: { local: chat?.meta.variables || {}, global: s.settings.globalVariables },
    extensionSettings: extSettingsDoc(),
    saveSettingsDebounced: saveExtensionSettings,
    saveSettings: saveExtensionSettings,
    eventSource: { on: onEvent, makeLast: onEvent, makeFirst: onEvent, emit: emitEvent, removeListener: () => {} },
    eventTypes: EVENT_TYPES,
    event_types: EVENT_TYPES,
    generateQuietPrompt: (prompt: string) => quietGenerate(prompt, { label: 'Расширение · тихая генерация' }),
    generateRaw: (prompt: string, _api?: unknown, _instruct?: unknown, _quiet?: unknown, systemPrompt?: string) =>
      utilityGenerate('utility', [...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []), { role: 'user' as const, content: prompt }], { label: 'Расширение' }),
    sendMessage: (text: string) => sendUserMessage(text),
    triggerGeneration: () => generateReplies(),
    addSystemMessage: (text: string, hidden = false) => {
      const msg = { ...newMessage({ role: 'system', name: 'Система', text }), hidden };
      setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
    },
    substituteParams: (text: string) => substituteMacros(text, macroEnvFor()),
    registerSlashCommand: (name: string, fn: (args: Record<string, string>, text: string) => unknown, _aliases?: string[], help = '') =>
      registerSlashCommand(name, async (p) => {
        const r = await fn(p.args, p.text);
        return typeof r === 'string' ? r : undefined;
      }, help),
    executeSlashCommands: (script: string) => runSlash(script),
    toast: (text: string, kind: 'info' | 'error' | 'warn' = 'info') => toast(text, kind),
    updateSettings,
  };
}

declare global {
  interface Window {
    CreamSoda: any;
    SillyTavern: any;
  }
}

export function installGlobalApi(version: string) {
  const api = {
    version,
    getContext: context,
    on: onEvent,
    emit: emitEvent,
    eventTypes: EVENT_TYPES,
    registerSlashCommand: context().registerSlashCommand,
    ui: {
      registerPanel(panel: Omit<ExtensionPanel, 'extension'> & { extension?: string }) {
        useExtensionPanels.setState((s) => ({
          panels: [...s.panels.filter((p) => p.id !== panel.id), { extension: panel.extension || 'unknown', ...panel }],
        }));
      },
      toast,
    },
    getExtensionSettings(name: string) {
      const doc = extSettingsDoc();
      if (!doc[name]) doc[name] = { enabled: true, settings: {} };
      if (!doc[name].settings) doc[name].settings = {};
      return doc[name].settings;
    },
    saveExtensionSettings,
  };
  window.CreamSoda = api;
  window.SillyTavern = { getContext: context, libs: {} };
}

export function extensionEnabled(name: string): boolean {
  return extSettingsDoc()[name]?.enabled !== false;
}

export function setExtensionEnabled(name: string, enabled: boolean) {
  setState((s) => ({ extensionsState: { ...s.extensionsState, [name]: { ...(s.extensionsState[name] || {}), enabled } } }));
  saveExtensionSettings();
}

export async function loadExtensions() {
  installGlobalApi(getState().version);
  const list = getState().extensions;
  for (const ext of list) {
    if (!extensionEnabled(ext.name) || useExtensionPanels.getState().loaded.includes(ext.name)) continue;
    try {
      if (ext.css) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `extensions/${encodeURIComponent(ext.name)}/${ext.css}`;
        link.dataset.extension = ext.name;
        document.head.appendChild(link);
      }
      if (ext.js) {
        await import(/* @vite-ignore */ `${location.origin}${location.pathname.replace(/[^/]*$/, '')}extensions/${encodeURIComponent(ext.name)}/${ext.js}`);
      }
      useExtensionPanels.setState((s) => ({ loaded: [...s.loaded, ext.name] }));
    } catch (err) {
      console.warn(`[extensions] ${ext.name}:`, err);
      useExtensionPanels.setState((s) => ({ failed: { ...s.failed, [ext.name]: (err as Error).message } }));
    }
  }
  emitEvent('app_ready');
}
