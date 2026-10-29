import type { Character, Chat, ChatMessage, ConnectionProfile, GenMeta, Settings, Swipe, Attachment } from './types';
import {
  getState,
  setState,
  setChat,
  saveChatImmediately,
  activeCharacter,
  activeGroup,
  activePersona,
  activePreset,
  connectionFor,
  toast,
  toastError,
  updateSettings,
  navigate,
} from './store';
import { buildPrompt, samplersToParams, toWireMessages, type BuildContext, type BuildOptions, type BuiltPrompt } from './promptBuilder';
import { streamGenerate, generateOnce, api } from './api';
import { newChat, newMessage } from './defaults';
import { applyRegex, activeScripts, PLACEMENT } from './regex';
import { substituteMacros, type MacroEnv } from './macros';
import { uid } from './utils';
import { pendingRange, parseSummary, parseFacts, messagesToTranscript, chapterNumber } from './memory';
import { countTokens } from './tokenizer';
import { prompt, LANGUAGE_NAMES } from './prompts';
import { getLang, locale, t } from './i18n';
import { emitEvent } from './events';

let controller: AbortController | null = null;

export function isGenerating() {
  return getState().gen.kind !== null;
}

export function stopGeneration() {
  controller?.abort();
}

// ───────── Context helpers ─────────

function requireConnection(task: keyof Settings['profileFor'] = 'chat'): ConnectionProfile {
  const conn = connectionFor(task);
  if (!conn) {
    toast(t('Add a model connection first: Settings → Connections'), 'warn', 6000);
    navigate('settings', 'connections');
    throw new Error('no-connection');
  }
  return conn;
}

export function buildContext(speaker?: Character, conn?: ConnectionProfile): BuildContext | null {
  const s = getState();
  const chat = s.chat;
  if (!chat) return null;
  const group = activeGroup(s);
  const sp = speaker || activeCharacter(s) || (group ? s.characters.find((c) => group.memberIds.includes(c.id)) : undefined);
  if (!sp) return null;
  return {
    chat,
    characters: s.characters,
    group,
    speaker: sp,
    persona: activePersona(s),
    preset: activePreset(s),
    connection: conn || connectionFor('chat', s),
    instruct: s.instruct,
    worlds: s.worlds,
    regex: s.regex,
    settings: s.settings,
  };
}

export function previewPrompt(opts: Partial<BuildOptions> = {}): BuiltPrompt | null {
  const ctx = buildContext();
  if (!ctx) return null;
  return buildPrompt(ctx, { type: 'normal', dryRun: true, ...opts });
}

function macroEnvFor(speaker?: Character): MacroEnv {
  const s = getState();
  const persona = activePersona(s);
  const sp = speaker || activeCharacter(s);
  return {
    user: persona?.name || 'You',
    char: sp?.name || '',
    description: sp?.description,
    personality: sp?.personality,
    scenario: s.chat?.meta.scenarioOverride || sp?.scenario,
    persona: persona?.description,
    messages: s.chat?.messages,
    chatId: s.chat?.id,
    localVars: s.chat?.meta.variables,
    globalVars: s.settings.globalVariables,
  };
}

export function displayRegexScripts(): ReturnType<typeof activeScripts> {
  const s = getState();
  const group = activeGroup(s);
  const ids = group ? group.memberIds : [activeCharacter(s)?.id || ''];
  return activeScripts(s.regex, ids, activePreset(s).id);
}

// ───────── Chats ─────────

export function greetingSwipes(c: Character, isGroup = false): string[] {
  const list = [c.firstMessage, ...c.alternateGreetings, ...(isGroup ? c.groupGreetings : [])].filter((g) => g && g.trim());
  return list;
}

export async function openChat(chatId: string) {
  try {
    const chat = await api.getChat(chatId);
    migrateChat(chat);
    setState({ chat, activeLore: [], lastPrompt: null, impersonateVariants: [] });
    const patch: Partial<Settings> = { activeChatId: chat.id };
    if (chat.ownerType === 'character') {
      patch.activeCharacterId = chat.ownerId;
      patch.activeGroupId = '';
      const ch = getState().characters.find((c) => c.id === chat.ownerId);
      if (ch?.presetId && getState().presets.some((p) => p.id === ch.presetId)) patch.activePresetId = ch.presetId;
      const locked = getState().personas.find((p) => p.lockedCharIds?.includes(chat.ownerId));
      if (locked && !chat.meta.personaId) patch.activePersonaId = locked.id;
    } else {
      patch.activeGroupId = chat.ownerId;
    }
    updateSettings(patch);
    refreshChatList();
    emitEvent('chat_changed', { chatId: chat.id });
  } catch (err) {
    toastError(err, t('Could not open the chat'));
  }
}

function migrateChat(chat: Chat) {
  chat.meta = chat.meta || ({} as Chat['meta']);
  chat.meta.authorNote = chat.meta.authorNote || { text: '', depth: 4, interval: 1, role: 'system', position: 'depth' };
  chat.meta.variables = chat.meta.variables || {};
  chat.meta.worldIds = chat.meta.worldIds || [];
  chat.meta.memory = chat.meta.memory || { chapters: [], facts: [] };
  for (const m of chat.messages) {
    if (!Array.isArray(m.swipes) || !m.swipes.length) m.swipes = [{ text: m.text, date: m.sendDate }];
    if (typeof m.swipeId !== 'number') m.swipeId = 0;
  }
}

export async function refreshChatList() {
  const chat = getState().chat;
  if (!chat) return setState({ chatList: [] });
  try {
    setState({ chatList: await api.listChats(chat.ownerType, chat.ownerId) });
  } catch {
    /* ignore */
  }
}

export async function startNewChat(ownerType: 'character' | 'group', ownerId: string, opts: { title?: string; plot?: { scenario?: string; firstMessage?: string; id?: string } } = {}) {
  const s = getState();
  const date = new Date().toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
  if (ownerType === 'character') {
    const c = s.characters.find((x) => x.id === ownerId);
    if (!c) return;
    const chat = newChat('character', c.id, opts.title || `${c.name} · ${date}`);
    if (opts.plot?.scenario) chat.meta.scenarioOverride = opts.plot.scenario;
    if (opts.plot?.id) chat.meta.plotId = opts.plot.id;
    const persona = activePersona(s);
    const env: MacroEnv = { user: persona?.name || 'You', char: c.name, chatId: chat.id, localVars: chat.meta.variables, globalVars: s.settings.globalVariables };
    const greetings = opts.plot?.firstMessage ? [opts.plot.firstMessage] : greetingSwipes(c);
    if (greetings.length) {
      const swipes: Swipe[] = greetings.map((g) => ({ text: substituteMacros(g, env), date: Date.now() }));
      chat.messages.push({ ...newMessage({ role: 'char', name: c.name, charId: c.id, text: swipes[0].text }), swipes, swipeId: 0 });
    }
    await api.putChat(chat);
    await openChat(chat.id);
  } else {
    const g = s.groups.find((x) => x.id === ownerId);
    if (!g) return;
    const chat = newChat('group', g.id, opts.title || `${g.name} · ${date}`);
    const persona = activePersona(s);
    for (const id of g.memberIds) {
      const c = s.characters.find((x) => x.id === id);
      if (!c || g.mutedIds.includes(id)) continue;
      const greetings = greetingSwipes(c, true);
      if (!greetings.length) continue;
      const env: MacroEnv = { user: persona?.name || 'You', char: c.name, chatId: chat.id };
      const text = substituteMacros(c.groupGreetings[0] || greetings[0], env);
      chat.messages.push(newMessage({ role: 'char', name: c.name, charId: c.id, text }));
    }
    await api.putChat(chat);
    await openChat(chat.id);
  }
  runQuickReplyAutos('newChat');
}

/** Opens the most recent chat with a character (or starts the first one). */
export async function openCharacter(charId: string) {
  try {
    const chats = await api.listChats('character', charId);
    if (chats.length) await openChat(chats[0].id);
    else await startNewChat('character', charId);
    navigate('chat');
  } catch (err) {
    toastError(err);
  }
}

export async function openGroup(groupId: string) {
  try {
    const chats = await api.listChats('group', groupId);
    if (chats.length) await openChat(chats[0].id);
    else await startNewChat('group', groupId);
    navigate('chat');
  } catch (err) {
    toastError(err);
  }
}

export async function branchFrom(messageId: string) {
  const chat = getState().chat;
  if (!chat) return;
  const idx = chat.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  await saveChatImmediately();
  const siblings = getState().chatList.filter((c) => c.parentId === chat.id).length;
  const branch: Chat = {
    ...structuredClone(chat),
    id: uid(),
    title: t('{title} · branch {n}', { title: chat.title.replace(/ · (?:branch|ветка) \d+$/, ''), n: siblings + 2 }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parentId: chat.id,
    branchPoint: idx,
    messages: structuredClone(chat.messages.slice(0, idx + 1)),
  };
  // Memory chapters that reference cut messages stay; they just lose their range.
  await api.putChat(branch);
  await openChat(branch.id);
  toast(t('Branch created from message #{idx}', { idx: idx + 1 }));
}

// ───────── Message editing ─────────

export function updateMessage(id: string, patch: Partial<ChatMessage>) {
  setChat((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

export function editMessage(id: string, text: string) {
  const s = getState();
  const msg = s.chat?.messages.find((m) => m.id === id);
  if (!msg) return;
  const placement = msg.role === 'user' ? PLACEMENT.USER_INPUT : PLACEMENT.AI_OUTPUT;
  const finalText = applyRegex(text, displayRegexScripts(), { placement, isEdit: true, env: macroEnvFor() });
  const swipes = msg.swipes.map((sw, i) => (i === msg.swipeId ? { ...sw, text: finalText } : sw));
  updateMessage(id, { text: finalText, swipes });
  emitEvent('message_edited', { messageId: id });
}

export function deleteMessages(ids: string[]) {
  setChat((c) => ({ ...c, messages: c.messages.filter((m) => !ids.includes(m.id)) }));
  emitEvent('message_deleted', { ids });
}

export function deleteSwipe(id: string) {
  const msg = getState().chat?.messages.find((m) => m.id === id);
  if (!msg || msg.swipes.length < 2) return;
  const swipes = msg.swipes.filter((_, i) => i !== msg.swipeId);
  const swipeId = Math.min(msg.swipeId, swipes.length - 1);
  updateMessage(id, { swipes, swipeId, text: swipes[swipeId].text, reasoning: swipes[swipeId].reasoning, gen: swipes[swipeId].gen });
}

export function setHidden(ids: string[], hidden: boolean) {
  setChat((c) => ({ ...c, messages: c.messages.map((m) => (ids.includes(m.id) ? { ...m, hidden } : m)) }));
}

export function moveMessage(id: string, dir: -1 | 1) {
  setChat((c) => {
    const i = c.messages.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= c.messages.length) return c;
    const messages = c.messages.slice();
    [messages[i], messages[j]] = [messages[j], messages[i]];
    return { ...c, messages };
  });
}

// ───────── Sending ─────────

export async function sendUserMessage(text: string, attachments: Attachment[] = []) {
  const s = getState();
  if (!s.chat) {
    toast(t('Pick a character in the Library first'), 'warn');
    return;
  }
  if (isGenerating()) return;
  const trimmed = text.trim();
  if (trimmed.startsWith('/') && !attachments.length) {
    const { runSlash } = await import('./slash');
    await runSlash(trimmed);
    return;
  }
  if (trimmed || attachments.length) {
    const persona = activePersona(s);
    const finalText = applyRegex(trimmed, displayRegexScripts(), { placement: PLACEMENT.USER_INPUT, env: macroEnvFor() });
    const msg = newMessage({ role: 'user', name: persona?.name || 'You', personaId: persona?.id, text: finalText, attachments: attachments.length ? attachments : undefined });
    setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
    emitEvent('message_sent', { messageId: msg.id });
    runQuickReplyAutos('user');
  } else if (activePreset(s).utility.sendIfEmpty?.trim()) {
    const persona = activePersona(s);
    const msg = newMessage({ role: 'user', name: persona?.name || 'You', text: substituteMacros(activePreset(s).utility.sendIfEmpty, macroEnvFor()) });
    setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
  }
  setState({ impersonateVariants: [] });
  await generateReplies();
}

/** Picks who answers in a group chat. */
function pickGroupSpeakers(): Character[] {
  const s = getState();
  const group = activeGroup(s);
  if (!group) {
    const c = activeCharacter(s);
    return c ? [c] : [];
  }
  const members = group.memberIds.map((id) => s.characters.find((c) => c.id === id)).filter((c): c is Character => !!c && !group.mutedIds.includes(c.id));
  if (!members.length) return [];
  const msgs = s.chat?.messages || [];
  const last = msgs[msgs.length - 1];
  const lastSpeaker = [...msgs].reverse().find((m) => m.role === 'char')?.charId;
  switch (group.activation) {
    case 'list':
      return members;
    case 'manual':
      return [];
    case 'pooled': {
      const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
      const spoke = new Set(msgs.slice(lastUser + 1).map((m) => m.charId));
      const pool = members.filter((m) => !spoke.has(m.id));
      const from = pool.length ? pool : members;
      return [from[Math.floor(Math.random() * from.length)]];
    }
    default: {
      const text = (last?.text || '').toLowerCase();
      const mentioned = members.filter((m) => text.includes(m.name.toLowerCase().split(' ')[0]) && (group.allowSelfResponses || m.id !== lastSpeaker || last?.role === 'user'));
      const chosen = new Set<Character>(mentioned);
      for (const m of members) {
        if (chosen.has(m)) continue;
        if (!group.allowSelfResponses && m.id === lastSpeaker && last?.role !== 'user') continue;
        if (Math.random() < (m.talkativeness ?? 0.5)) chosen.add(m);
      }
      if (!chosen.size) {
        const candidates = members.filter((m) => group.allowSelfResponses || m.id !== lastSpeaker);
        const from = candidates.length ? candidates : members;
        chosen.add(from[Math.floor(Math.random() * from.length)]);
      }
      return [...chosen];
    }
  }
}

export async function generateReplies(speakerId?: string) {
  const s = getState();
  const speakers = speakerId ? s.characters.filter((c) => c.id === speakerId) : pickGroupSpeakers();
  for (const sp of speakers) {
    const ok = await generateInto({ type: 'normal', speaker: sp });
    if (!ok) break;
  }
  const group = activeGroup(getState());
  if (group?.autoMode && !speakerId && getState().chat?.ownerType === 'group') {
    setTimeout(() => {
      if (!isGenerating() && activeGroup(getState())?.autoMode) generateReplies();
    }, Math.max(1, group.autoModeDelay) * 1000);
  }
}

export async function regenerateLast() {
  const chat = getState().chat;
  if (!chat || isGenerating()) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last) return generateReplies();
  if (last.role !== 'char') return generateReplies();
  await generateSwipe(last.id);
}

export async function swipe(messageId: string, dir: -1 | 1) {
  const chat = getState().chat;
  if (!chat || isGenerating()) return;
  const idx = chat.messages.findIndex((m) => m.id === messageId);
  const msg = chat.messages[idx];
  if (!msg) return;
  const next = msg.swipeId + dir;
  if (next < 0) return;
  if (next >= msg.swipes.length) {
    if (msg.role === 'char' && idx === chat.messages.length - 1) {
      // Greeting with alternatives: cycle; otherwise generate a new variant.
      if (idx === 0 && chat.messages.length === 1 && msg.swipes.length > 1) return selectSwipe(messageId, 0);
      if (idx === 0 && chat.messages.length === 1) return;
      await generateSwipe(messageId);
    }
    return;
  }
  selectSwipe(messageId, next);
}

export function selectSwipe(messageId: string, swipeId: number) {
  const msg = getState().chat?.messages.find((m) => m.id === messageId);
  if (!msg || !msg.swipes[swipeId]) return;
  const sw = msg.swipes[swipeId];
  updateMessage(messageId, { swipeId, text: sw.text, reasoning: sw.reasoning, gen: sw.gen });
  emitEvent('message_swiped', { messageId, swipeId });
}

export async function generateSwipe(messageId: string) {
  const chat = getState().chat;
  if (!chat) return;
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg || msg.role !== 'char') return;
  const speaker = getState().characters.find((c) => c.id === msg.charId) || activeCharacter();
  await generateInto({ type: 'swipe', speaker, messageId });
}

export async function continueMessage(messageId?: string) {
  const chat = getState().chat;
  if (!chat || isGenerating()) return;
  const msg = messageId ? chat.messages.find((m) => m.id === messageId) : [...chat.messages].reverse().find((m) => m.role === 'char');
  if (!msg || msg.role !== 'char') return generateReplies();
  const speaker = getState().characters.find((c) => c.id === msg.charId) || activeCharacter();
  await generateInto({ type: 'continue', speaker, messageId: msg.id });
}

// ───────── Core generation ─────────

interface GenerateIntoOptions {
  type: 'normal' | 'swipe' | 'continue';
  speaker?: Character;
  messageId?: string;
}

function splitReasoning(text: string, prefix: string, suffix: string): { text: string; reasoning: string } {
  if (!prefix || !suffix) return { text, reasoning: '' };
  const start = text.indexOf(prefix);
  if (start === -1 || text.slice(0, start).trim()) return { text, reasoning: '' };
  const end = text.indexOf(suffix, start + prefix.length);
  if (end === -1) return { text: '', reasoning: text.slice(start + prefix.length) };
  return { reasoning: text.slice(start + prefix.length, end).trim(), text: text.slice(end + suffix.length).replace(/^\s+/, '') };
}

function trimIncomplete(text: string): string {
  const m = /^[\s\S]*[.!?…»"*)\]~](?=[^.!?…»"*)\]~]*$)/.exec(text);
  return m && m[0].length > text.length * 0.6 ? m[0] : text;
}

async function generateInto(o: GenerateIntoOptions): Promise<boolean> {
  let conn: ConnectionProfile;
  try {
    conn = requireConnection('chat');
  } catch {
    return false;
  }
  const ctx = buildContext(o.speaker, conn);
  if (!ctx) {
    toast(t('No active character'), 'warn');
    return false;
  }
  const chat = ctx.chat;
  const speaker = ctx.speaker;
  let targetIndex = o.messageId ? chat.messages.findIndex((m) => m.id === o.messageId) : -1;

  const built = buildPrompt(ctx, { type: o.type, targetIndex: targetIndex >= 0 ? targetIndex : undefined });
  for (const w of built.warnings) toast(w, 'warn');

  // Prepare the target message / swipe.
  let messageId = o.messageId || '';
  const baseText = o.type === 'continue' && targetIndex >= 0 ? chat.messages[targetIndex].text : '';
  if (o.type === 'normal') {
    const msg = newMessage({ role: 'char', name: speaker.name, charId: speaker.id, avatar: speaker.avatar, text: '' });
    msg.swipes = [{ text: '', date: Date.now() }];
    messageId = msg.id;
    setChat((c) => ({ ...c, messages: [...c.messages, msg] }), false);
    targetIndex = getState().chat!.messages.length - 1;
  } else if (o.type === 'swipe') {
    setChat(
      (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, swipes: [...m.swipes, { text: '', date: Date.now() }], swipeId: m.swipes.length, text: '', reasoning: '' } : m,
        ),
      }),
      false,
    );
  }

  setState({
    gen: { kind: o.type === 'normal' ? 'reply' : o.type, messageId, startedAt: Date.now(), charName: speaker.name },
    streamText: '',
    streamReasoning: '',
    lastPrompt: { messages: built.messages.map((m) => ({ role: m.role, content: m.content })), tokens: built.totalTokens, breakdown: built.breakdown },
    contextTokens: built.totalTokens,
    activeLore: [
      ...built.wi.activated.map((e) => ({ uid: e.uid, title: e.comment, keys: e.constant ? t('always') : e.keys.slice(0, 3).join(', '), state: 'active' as const })),
      ...built.wi.waiting.map((e) => ({ uid: e.uid, title: e.comment, keys: t('waits for the 2nd key'), state: 'waiting' as const })),
    ],
  });
  emitEvent('generation_started', { type: o.type, messageId });

  const preset = ctx.preset;
  controller = new AbortController();
  const started = Date.now();
  let raw = '';
  let reasoning = '';
  let finish = '';
  let usage: Record<string, number> | undefined;
  let failed = false;

  const write = (final = false) => {
    let text = raw;
    let r = reasoning;
    if (preset.reasoning.autoParse) {
      const split = splitReasoning(raw, preset.reasoning.prefix, preset.reasoning.suffix);
      if (split.reasoning) {
        text = split.text;
        r = (reasoning ? `${reasoning}\n` : '') + split.reasoning;
      }
    }
    if (o.type === 'continue') text = joinContinuation(baseText, text);
    if (final) {
      text = applyRegex(text, displayRegexScripts(), { placement: PLACEMENT.AI_OUTPUT, env: { ...built.env, char: speaker.name } });
      if (r) r = applyRegex(r, displayRegexScripts(), { placement: PLACEMENT.REASONING, env: built.env });
      if (getState().settings.chat.trimIncomplete && finish === 'length') text = trimIncomplete(text);
    }
    const gen: GenMeta = { model: conn.model, api: conn.api, ms: Date.now() - started, tokens: usage?.completion_tokens ?? usage?.output_tokens ?? countTokens(text), finish };
    setChat(
      (c) => ({
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== messageId) return m;
          const swipes = m.swipes.slice();
          swipes[m.swipeId] = { ...swipes[m.swipeId], text, reasoning: r || undefined, gen: final ? gen : swipes[m.swipeId]?.gen };
          return { ...m, text, reasoning: r || undefined, swipes, gen: final ? gen : m.gen };
        }),
      }),
      final,
    );
  };

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      write(false);
    });
  };

  try {
    const body = await requestBody(conn, built, preset, t('{x} · reply from {name}', { x: o.type === 'swipe' ? t('Swipe') : o.type === 'continue' ? t('Continuation') : t('Chat'), name: speaker.name }));
    if (preset.samplers.stream) {
      for await (const ev of streamGenerate(body, controller.signal)) {
        if (ev.t === 'delta') {
          raw += ev.text || '';
          reasoning += ev.reasoning || '';
          setState({ streamText: raw, streamReasoning: reasoning });
          schedule();
        } else if (ev.t === 'done') {
          finish = ev.finish || '';
          usage = ev.usage;
        } else if (ev.t === 'error') throw new Error(ev.message || t('Generation error'));
      }
    } else {
      const r = await generateOnce(body, controller.signal);
      raw = r.text;
      reasoning = r.reasoning;
      usage = r.usage;
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      failed = true;
      toastError(err, t('Generation error'));
    }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    controller = null;
  }

  const aborted = !failed && !raw && !reasoning;
  if ((failed || aborted) && !raw.trim()) {
    // Nothing came back: undo the placeholder.
    if (o.type === 'normal') setChat((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== messageId) }), true);
    else if (o.type === 'swipe')
      setChat(
        (c) => ({
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            const swipes = m.swipes.slice(0, -1);
            const sw = swipes[swipes.length - 1];
            return { ...m, swipes, swipeId: swipes.length - 1, text: sw.text, reasoning: sw.reasoning };
          }),
        }),
        true,
      );
    setState({ gen: { kind: null }, streamText: '', streamReasoning: '' });
    return false;
  }

  write(true);
  setChat((c) => ({ ...c, meta: { ...c.meta, wiTimed: built.wi.timed, variables: built.vars } }));
  if (JSON.stringify(built.globalVars) !== JSON.stringify(getState().settings.globalVariables)) updateSettings({ globalVariables: built.globalVars });
  setState({ gen: { kind: null }, streamText: '', streamReasoning: '' });
  await saveChatImmediately();
  refreshChatList();
  emitEvent('message_received', { messageId, type: o.type });
  runQuickReplyAutos('ai');
  afterReply(messageId).catch(() => {});

  // Auto-continue short replies.
  const st = getState().settings.chat;
  if (!failed && st.autoContinue && finish === 'length') {
    const msg = getState().chat?.messages.find((m) => m.id === messageId);
    if (msg && msg.text.length < st.autoContinueMinChars) await generateInto({ type: 'continue', speaker, messageId });
  }
  return !failed;
}

function joinContinuation(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  const needsSpace = !/\s$/.test(base) && !/^[\s.,!?;:…»)\]]/.test(addition);
  return base + (needsSpace ? ' ' : '') + addition;
}

async function requestBody(conn: ConnectionProfile, built: BuiltPrompt, preset: ReturnType<typeof activePreset>, label: string) {
  const params = samplersToParams(preset, built.stop);
  return {
    connectionId: conn.id,
    label,
    mode: built.mode,
    messages: built.mode === 'chat' ? await toWireMessages(built.messages) : undefined,
    prompt: built.mode === 'text' ? built.text : undefined,
    params,
  };
}

/** Hooks that run after every AI reply: memory automation, TTS, translation. */
async function afterReply(messageId: string) {
  const s = getState();
  const chat = s.chat;
  if (!chat) return;
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg) return;
  if (s.settings.extensions.enabled.tts && s.settings.extensions.tts.auto) {
    const { speak } = await import('./tts');
    speak(msg.text);
  }
  if (s.settings.extensions.enabled.translate && s.settings.extensions.translate.auto) {
    translateMessage(messageId).catch(() => {});
  }
  if (s.settings.extensions.enabled.memory && s.settings.memory.autoEvery > 0) {
    const pend = pendingRange(chat);
    if (pend.count >= s.settings.memory.autoEvery) summarizeChapter().catch((err) => toastError(err, 'Memory Book'));
  }
  const every = s.imageSettings.autoSceneEvery;
  if (s.settings.extensions.enabled.images && every > 0 && chat.messages.filter((m) => m.role === 'char').length % every === 0 && s.imageSettings.endpoint) {
    const { generateSceneFrame } = await import('./images');
    generateSceneFrame({ insert: false }).catch(() => {});
  }
}

// ───────── Quiet / utility generations ─────────

/** One-off generation with arbitrary messages (memory, generator, translation…). */
export async function utilityGenerate(
  task: keyof Settings['profileFor'],
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { maxTokens?: number; temperature?: number; label?: string; signal?: AbortSignal; onDelta?: (text: string) => void } = {},
): Promise<string> {
  const conn = requireConnection(task);
  const preset = activePreset();
  const params = { ...samplersToParams(preset), max_tokens: opts.maxTokens ?? Math.max(preset.samplers.maxTokens, 800) };
  if (opts.temperature !== undefined) params.temperature = opts.temperature;
  params.stop = [];
  const isText = conn.api === 'textcompletion' || ((conn.api === 'ollama' || conn.api === 'custom') && conn.mode === 'text');
  let prompt: string | undefined;
  if (isText) {
    const { renderInstruct } = await import('./instruct');
    const tpl = getState().instruct.find((it) => it.id === preset.instructId) || getState().instruct[0];
    const r = renderInstruct(messages, tpl, { nextName: '', userName: '' });
    prompt = r.prompt;
    params.stop = r.stop.filter((x) => !x.startsWith('\n'));
  }
  const body = { connectionId: conn.id, label: opts.label || t('Utility request'), mode: isText ? 'text' : 'chat', messages: isText ? undefined : messages, prompt, params };
  if (opts.onDelta) {
    let text = '';
    for await (const ev of streamGenerate(body, opts.signal || new AbortController().signal)) {
      if (ev.t === 'delta') {
        text += ev.text || '';
        opts.onDelta(text);
      } else if (ev.t === 'error') throw new Error(ev.message);
    }
    return text.trim();
  }
  const r = await generateOnce(body, opts.signal);
  return r.text.trim();
}

/** Generation that sees the chat context but does not write into the chat (/gen, scene prompts). */
export async function quietGenerate(instruction: string, opts: { label?: string; task?: keyof Settings['profileFor']; maxTokens?: number } = {}): Promise<string> {
  const conn = requireConnection(opts.task || 'utility');
  const ctx = buildContext(undefined, conn);
  if (!ctx) throw new Error(t('No active chat'));
  const built = buildPrompt(ctx, { type: 'quiet', quietPrompt: instruction, dryRun: true });
  const preset = ctx.preset;
  const body = await requestBody(conn, { ...built, messages: built.messages.filter((m) => m.source !== 'prefill') }, preset, opts.label || t('Quiet generation'));
  if (opts.maxTokens) (body.params as any).max_tokens = opts.maxTokens;
  const r = await generateOnce(body);
  let text = r.text;
  if (preset.reasoning.autoParse) text = splitReasoning(text, preset.reasoning.prefix, preset.reasoning.suffix).text || text;
  return text.trim();
}

// ───────── Impersonate+ ─────────

export function parseVariants(text: string, count: number): string[] {
  const parts = text
    .split(/^\s*#{2,4}\s*\d+[.):]?\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, count);
  const numbered = text
    .split(/^\s*(?:\d+[.)]|[-•])\s+/m)
    .map((p) => p.trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered.slice(0, count);
  return [text.trim()].filter(Boolean);
}

export async function impersonate(mode = getState().settings.impersonate.mode) {
  const s = getState();
  if (!s.chat || isGenerating()) return;
  let conn: ConnectionProfile;
  try {
    conn = requireConnection('impersonate');
  } catch {
    return;
  }
  const ctx = buildContext(undefined, conn);
  if (!ctx) return;
  const imp = s.settings.impersonate;
  const draft = s.composerDraft;
  const direction = imp.direction.trim();
  const key = ({ continue: 'impersonateContinue', variants: 'impersonateVariants', action: 'impersonateAction', voice: 'impersonateVoice' } as const)[mode];
  let instruction = prompt(key, { count: imp.count, input: draft });
  if (direction) instruction += `\n${prompt('impersonateDirection', { direction })}`;

  const built = buildPrompt(ctx, { type: 'impersonate', finalInstruction: instruction, pendingInput: draft });
  controller = new AbortController();
  setState({ gen: { kind: 'impersonate', startedAt: Date.now() }, streamText: '', impersonateVariants: mode === 'continue' ? [] : s.impersonateVariants });
  let text = '';
  try {
    const body = await requestBody(conn, built, ctx.preset, mode === 'continue' ? 'Impersonate+ · continue' : `Impersonate+ · ${imp.count} variants`);
    for await (const ev of streamGenerate(body, controller.signal)) {
      if (ev.t === 'delta') {
        text += ev.text || '';
        if (mode === 'continue') setState({ composerDraft: joinContinuation(draft, splitReasoning(text, ctx.preset.reasoning.prefix, ctx.preset.reasoning.suffix).text || '') });
        else setState({ streamText: text });
      } else if (ev.t === 'error') throw new Error(ev.message);
    }
    text = splitReasoning(text, ctx.preset.reasoning.prefix, ctx.preset.reasoning.suffix).text || text;
    if (mode === 'continue') setState({ composerDraft: joinContinuation(draft, text.trim()) });
    else {
      const variants = parseVariants(text, imp.count).map((v) => v.replace(new RegExp(`^${ctx.persona?.name || ''}:\\s*`), ''));
      setState({ impersonateVariants: variants, composerDraft: variants[0] || draft });
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') toastError(err, 'Impersonate+');
  } finally {
    controller = null;
    setState({ gen: { kind: null }, streamText: '' });
  }
}

// ───────── Memory Book ─────────

export async function summarizeChapter(range?: { start: number; end: number }, chapterId?: string): Promise<void> {
  const s = getState();
  const chat = s.chat;
  if (!chat) return;
  const settings = s.settings.memory;
  const pend = pendingRange(chat);
  const start = range ? range.start : pend.start;
  const end = range ? range.end : chat.messages.length - 1;
  if (end < start) {
    toast(t('Nothing to condense: the new chapter has no messages yet'), 'warn');
    return;
  }
  const slice = chat.messages.slice(start, end + 1);
  const chunk = messagesToTranscript(slice);
  const persona = activePersona(s);
  const env: MacroEnv = { user: persona?.name || 'You', char: activeCharacter(s)?.name || '' };
  setState({ gen: { kind: 'memory', startedAt: Date.now() } });
  try {
    const answer = await utilityGenerate(
      'memory',
      [{ role: 'user', content: substituteMacros(prompt('memorySummary', { chunk }), env) }],
      { maxTokens: 500, temperature: 0.4, label: `Memory · chapter ${chapterNumber(chat.meta.memory)}` },
    );
    const parsed = parseSummary(answer);
    const chapter = {
      id: chapterId || uid(),
      title: parsed.title,
      fromId: slice[0].id,
      toId: slice[slice.length - 1].id,
      summary: parsed.summary,
      keys: parsed.keys,
      insertion: 'always' as const,
      importance: 3,
      status: 'memory' as const,
      updatedAt: Date.now(),
    };
    setChat((c) => {
      const chapters = chapterId ? c.meta.memory.chapters.map((x) => (x.id === chapterId ? { ...x, ...chapter, importance: x.importance, insertion: x.insertion } : x)) : [...c.meta.memory.chapters, chapter];
      return { ...c, meta: { ...c.meta, memory: { ...c.meta.memory, chapters } } };
    });
    if (settings.suggestFacts && !chapterId) {
      const known = getState().chat?.meta.memory.facts.map((f) => `- ${f.text}`).join('\n') || '—';
      const factsAnswer = await utilityGenerate(
        'memory',
        [{ role: 'user', content: substituteMacros(prompt('memoryFacts', { chunk, facts: known }), env) }],
        { maxTokens: 300, temperature: 0.3, label: 'Memory · facts' },
      ).catch(() => '');
      const facts = parseFacts(factsAnswer);
      if (facts.length) {
        setChat((c) => ({
          ...c,
          meta: { ...c.meta, memory: { ...c.meta.memory, facts: [...c.meta.memory.facts, ...facts.map((text) => ({ id: uid(), text, enabled: false }))] } },
        }));
        toast(t('The Memory Book suggests {n} fact(s): turn on the ones you want', { n: facts.length }));
      }
    }
    await saveChatImmediately();
    toast(t('Chapter “{title}” written to the Memory Book', { title: parsed.title }));
  } finally {
    setState({ gen: { kind: null } });
  }
}

// ───────── Translation ─────────

export async function translateMessage(messageId: string) {
  const s = getState();
  const msg = s.chat?.messages.find((m) => m.id === messageId);
  if (!msg) return;
  // No target set: translate into the interface language.
  const target = s.settings.extensions.translate.target || getLang();
  const text = await utilityGenerate(
    'utility',
    [{ role: 'user', content: prompt('translate', { language: LANGUAGE_NAMES[target] || target, text: msg.text }) }],
    { maxTokens: Math.max(400, countTokens(msg.text) * 2), temperature: 0.2, label: 'Translation' },
  );
  updateMessage(messageId, { translation: text });
}

// ───────── Quick replies ─────────

export function runQuickReplyAutos(kind: 'newChat' | 'user' | 'ai') {
  const s = getState();
  if (!s.settings.extensions.enabled.quickreplies) return;
  for (const set of s.quickreplies.filter((q) => q.enabled)) {
    for (const qr of set.replies) {
      const hit = (kind === 'newChat' && qr.autoOnNewChat) || (kind === 'user' && qr.autoOnUser) || (kind === 'ai' && qr.autoOnAi);
      if (hit) import('./slash').then(({ runSlash }) => runSlash(qr.message.startsWith('/') ? qr.message : `/send ${qr.message}`));
    }
  }
}

export { requireConnection, macroEnvFor };
