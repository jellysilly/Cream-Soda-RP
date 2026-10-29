import { prompt } from './prompts';
import type {
  Character,
  Chat,
  ChatMessage,
  ConnectionProfile,
  Group,
  InstructTemplate,
  Persona,
  Preset,
  PromptBlock,
  RegexScript,
  Role,
  Settings,
  Lorebook,
} from './types';
import { substituteMacros, type MacroEnv } from './macros';
import { scanWorldInfo, type WIResult } from './worldinfo';
import { applyRegex, activeScripts, PLACEMENT } from './regex';
import { buildMemoryText } from './memory';
import { countTokens, MESSAGE_OVERHEAD } from './tokenizer';
import { renderInstruct, type PlainMessage } from './instruct';
import { BUILTIN_INSTRUCT } from './defaults';
import { t } from './i18n';

export type GenType = 'normal' | 'swipe' | 'continue' | 'impersonate' | 'quiet';

export type Category = 'system' | 'char' | 'lore' | 'memory' | 'history' | 'instructions';

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  system: { label: t('System'), color: '#E8B66C' },
  char: { label: t('Char + persona'), color: '#FF9DC5' },
  lore: { label: t('Lore'), color: '#B08AE0' },
  memory: { label: t('Memory'), color: '#2ED8A6' },
  history: { label: t('History'), color: '#86C6EC' },
  instructions: { label: t('Instructions'), color: '#D6216A' },
};

export type ContentPart = { type: 'text'; text: string } | { type: 'image'; mime: string; data?: string; url?: string };

export interface PromptMessage {
  role: Role;
  content: string;
  parts?: ContentPart[];
  name?: string;
  /** Where the message came from (block id, 'history', 'wi-depth', …) — for the preview. */
  source: string;
  category: Category;
  tokens: number;
  /** For history messages: id of the chat message. */
  messageId?: string;
}

export interface BuildContext {
  chat: Chat;
  characters: Character[];
  group?: Group;
  speaker: Character;
  persona?: Persona;
  preset: Preset;
  connection?: ConnectionProfile;
  instruct: InstructTemplate[];
  worlds: Lorebook[];
  regex: RegexScript[];
  settings: Settings;
}

export interface BuildOptions {
  type: GenType;
  /** Index of the chat message being regenerated/continued (excluded or used as base). */
  targetIndex?: number;
  quietPrompt?: string;
  /** Extra system instruction placed right before the final turn. */
  finalInstruction?: string;
  /** Text of the user's not-yet-sent input (scanned by WI, available as {{input}}). */
  pendingInput?: string;
  /** For dry runs in the preset preview: do not mutate chat variables. */
  dryRun?: boolean;
}

export interface BuiltPrompt {
  messages: PromptMessage[];
  /** Text Completion prompt (when the connection uses it). */
  text?: string;
  stop: string[];
  mode: 'chat' | 'text';
  breakdown: Record<Category, number>;
  totalTokens: number;
  contextSize: number;
  maxTokens: number;
  wi: WIResult;
  historyIncluded: number;
  historyTotal: number;
  env: MacroEnv;
  vars: Record<string, string>;
  globalVars: Record<string, string>;
  prefill: string;
  warnings: string[];
}

export function connectionMode(conn?: ConnectionProfile): 'chat' | 'text' {
  if (!conn) return 'chat';
  if (conn.api === 'textcompletion') return 'text';
  if ((conn.api === 'ollama' || conn.api === 'custom') && conn.mode === 'text') return 'text';
  return 'chat';
}

function formatExamples(raw: string, env: MacroEnv, header: string): string {
  const text = substituteMacros(raw || '', env).trim();
  if (!text) return '';
  const blocks = text
    .split(/<START>/i)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((b) => `${header}\n${b}`).join('\n\n');
}

function charCardText(c: Character, env: MacroEnv, preset: Preset, scenarioOverride?: string): string {
  const parts: string[] = [];
  const description = substituteMacros(c.description || '', env).trim();
  if (description) parts.push(description);
  if (c.personality?.trim()) parts.push(substituteMacros(preset.utility.personalityFormat || '{{personality}}', { ...env, personality: c.personality }));
  const scenario = (scenarioOverride ?? c.scenario)?.trim();
  if (scenario) parts.push(substituteMacros(preset.utility.scenarioFormat || '{{scenario}}', { ...env, scenario }));
  return substituteMacros(parts.join('\n\n'), env).trim();
}

function messageText(m: ChatMessage, includeReasoning: boolean, reasoning: Preset['reasoning']): string {
  let text = m.text || '';
  if (includeReasoning && m.reasoning) text = `${reasoning.prefix}\n${m.reasoning}\n${reasoning.suffix}\n${text}`;
  const files = (m.attachments || []).filter((a) => a.kind === 'file' && a.text);
  for (const f of files) text += `\n\n${prompt('attachment', { name: f.name, text: f.text || '' })}`;
  return text;
}

export function buildPrompt(ctx: BuildContext, opts: BuildOptions): BuiltPrompt {
  const { chat, speaker, persona, preset, connection, settings } = ctx;
  const mode = connectionMode(connection);
  const isGroup = chat.ownerType === 'group' && !!ctx.group;
  const members = isGroup ? ctx.group!.memberIds.map((id) => ctx.characters.find((c) => c.id === id)).filter(Boolean) as Character[] : [speaker];
  const warnings: string[] = [];

  // Macros may write variables; the caller persists `vars` after a real generation.
  const vars = { ...(chat.meta.variables || {}) };
  const globalVars = { ...settings.globalVariables };
  const userName = persona?.name || 'You';
  const scenarioOverride = chat.meta.scenarioOverride || (isGroup ? ctx.group!.scenario : '') || undefined;

  // History to consider.
  let history = chat.messages.slice();
  if ((opts.type === 'swipe') && typeof opts.targetIndex === 'number') history = history.slice(0, opts.targetIndex);
  if (opts.type === 'continue' && typeof opts.targetIndex === 'number') history = history.slice(0, opts.targetIndex + 1);
  const visibleHistory = history.filter((m) => !m.hidden && (m.role !== 'system' || m.text.trim()));

  const env: MacroEnv = {
    user: userName,
    char: speaker.name,
    group: isGroup ? members.map((m) => m.name).join(', ') : undefined,
    groupNotMuted: isGroup ? members.filter((m) => !ctx.group!.mutedIds.includes(m.id)).map((m) => m.name).join(', ') : undefined,
    description: speaker.description,
    personality: speaker.personality,
    scenario: scenarioOverride ?? speaker.scenario,
    persona: persona?.description || '',
    mesExamplesRaw: speaker.exampleMessages,
    charPrompt: speaker.systemPrompt,
    charInstruction: speaker.postHistoryInstructions,
    charVersion: speaker.characterVersion,
    creatorNotes: speaker.creatorNotes,
    charDepthPrompt: speaker.depthPrompt?.prompt,
    model: connection?.model || '',
    input: opts.pendingInput || '',
    messages: history,
    chatId: chat.id,
    idleSince: history[history.length - 1]?.sendDate,
    lastGenerationType: opts.type,
    localVars: vars,
    globalVars,
  };
  env.persona = substituteMacros(persona?.description || '', env);
  env.mesExamples = formatExamples(speaker.exampleMessages, env, substituteMacros(preset.utility.newExampleChat || '', env));

  const contextSize = connection?.contextOverride || preset.samplers.contextSize || 8192;
  const maxTokens = preset.samplers.maxTokens || 400;

  // Regex for the prompt pass.
  const scripts = activeScripts(ctx.regex, members.map((m) => m.id), preset.id);
  const forPrompt = (text: string, depth: number, placement: number) =>
    applyRegex(text, scripts, { placement: placement as 1 | 2, prompt: true, depth, env });

  // World info.
  const books = new Set<string>([...settings.worldInfo.globalWorldIds, ...members.flatMap((m) => m.worldIds || []), ...(chat.meta.worldIds || [])]);
  const wi = scanWorldInfo({
    settings: settings.worldInfo,
    books: [...books].map((id) => ctx.worlds.find((w) => w.id === id)).filter(Boolean) as Lorebook[],
    messages: visibleHistory,
    contextSize,
    extraScan: opts.pendingInput ? [opts.pendingInput] : [],
    timed: chat.meta.wiTimed,
    macro: (s) => applyRegex(substituteMacros(s, env), scripts, { placement: PLACEMENT.WORLD_INFO, env }),
  });
  env.extra = Object.fromEntries(Object.entries(wi.outlets).map(([k, v]) => [`outlet::${k}`, v]));
  const wiFormat = (s: string) => (s ? (preset.utility.wiFormat || '{0}').replace('{0}', s) : '');

  // Memory Book.
  const recentText = visibleHistory.slice(-8).map((m) => m.text).join('\n') + (opts.pendingInput || '');
  const memory = settings.extensions.enabled.memory !== false ? buildMemoryText(chat, settings.memory, recentText) : { text: '', tokens: 0 };

  const sub = (s: string) => substituteMacros(s || '', env).trim();
  const mk = (role: Role, content: string, source: string, category: Category, name?: string): PromptMessage => ({
    role,
    content,
    source,
    category,
    name,
    tokens: countTokens(content) + MESSAGE_OVERHEAD,
  });

  const before: PromptMessage[] = [];
  const after: PromptMessage[] = [];
  const depthInjections: { msg: PromptMessage; depth: number; order: number }[] = [];
  let historyPlaced = false;
  let prefill = '';

  const blocks = preset.prompts.filter((b) => b.enabled);
  for (const b of blocks) {
    const target = historyPlaced ? after : before;
    const content = blockContent(b);
    if (b.marker === 'chatHistory') {
      historyPlaced = true;
      continue;
    }
    if (b.id === 'prefill' || (b.role === 'assistant' && b === blocks[blocks.length - 1] && b.position === 'relative')) {
      prefill = sub(b.content);
      continue;
    }
    if (!content) continue;
    if (b.position === 'depth' && !b.marker) {
      depthInjections.push({ msg: mk(b.role, content, b.id, categoryFor(b)), depth: b.depth, order: b.order });
      continue;
    }
    target.push(mk(b.role, content, b.id, categoryFor(b)));
  }

  function categoryFor(b: PromptBlock): Category {
    switch (b.marker) {
      case 'charCard':
      case 'charDescription':
      case 'charPersonality':
      case 'scenario':
      case 'personaDescription':
      case 'dialogueExamples':
        return 'char';
      case 'worldInfoBefore':
      case 'worldInfoAfter':
        return 'lore';
      case 'memoryBook':
        return 'memory';
      default:
        return b.id === 'main' || b.id === 'nsfw' || b.id === 'enhanceDefinitions' ? 'system' : 'instructions';
    }
  }

  function blockContent(b: PromptBlock): string {
    switch (b.marker) {
      case 'charCard':
        if (isGroup && ctx.group!.generationMode === 'append') {
          return members
            .filter((m) => !ctx.group!.mutedIds.includes(m.id) || m.id === speaker.id)
            .map((m) => `[${m.name}]\n${charCardText(m, { ...env, char: m.name }, preset, scenarioOverride)}`)
            .join('\n\n');
        }
        return charCardText(speaker, env, preset, scenarioOverride);
      case 'charDescription':
        return sub(speaker.description);
      case 'charPersonality':
        return speaker.personality?.trim() ? sub(preset.utility.personalityFormat || '{{personality}}') : '';
      case 'scenario':
        return (scenarioOverride ?? speaker.scenario)?.trim() ? sub(preset.utility.scenarioFormat || '{{scenario}}') : '';
      case 'personaDescription':
        return persona && (persona.position === 'prompt' || !persona.position) ? env.persona || '' : '';
      case 'worldInfoBefore':
        return wiFormat(wi.before);
      case 'worldInfoAfter':
        return wiFormat(wi.after);
      case 'dialogueExamples': {
        const parts = [...wi.emTop, env.mesExamples || '', ...wi.emBottom].filter(Boolean);
        return parts.join('\n\n');
      }
      case 'memoryBook':
        return memory.text;
      case 'chatHistory':
        return '';
      default: {
        // Character card overrides of the main prompt and post-history instructions.
        if (b.id === 'main' && speaker.systemPrompt?.trim()) {
          return substituteMacros(speaker.systemPrompt, { ...env, original: sub(b.content) }).trim();
        }
        if (b.id === 'jailbreak' && speaker.postHistoryInstructions?.trim()) {
          return substituteMacros(speaker.postHistoryInstructions, { ...env, original: sub(b.content) }).trim();
        }
        return sub(b.content);
      }
    }
  }

  // Author's note (+ WI AN-top/bottom, persona in AN).
  const an = chat.meta.authorNote;
  const userTurns = visibleHistory.filter((m) => m.role === 'user').length;
  const anParts: string[] = [];
  if (persona?.position === 'an_top' && env.persona) anParts.push(env.persona);
  anParts.push(...wi.anTop);
  const anActive = an?.text?.trim() && an.interval > 0 && userTurns % an.interval === 0;
  if (anActive) anParts.push(sub(an.text));
  anParts.push(...wi.anBottom);
  if (persona?.position === 'an_bottom' && env.persona) anParts.push(env.persona);
  if (anParts.length) {
    const msg = mk(an?.role || 'system', anParts.join('\n'), 'authorNote', 'instructions');
    if (an?.position === 'after_main') {
      const i = before.findIndex((m) => m.source === 'main');
      before.splice(i + 1, 0, msg);
    } else if (an?.position === 'before_main') {
      const i = before.findIndex((m) => m.source === 'main');
      before.splice(Math.max(0, i), 0, msg);
    } else depthInjections.push({ msg, depth: an?.depth ?? 4, order: 50 });
  }
  if (persona?.position === 'depth' && env.persona) {
    depthInjections.push({ msg: mk(persona.role || 'system', env.persona, 'persona-depth', 'char'), depth: persona.depth ?? 2, order: 60 });
  }
  for (const m of members) {
    const dp = m.depthPrompt;
    if (dp?.prompt?.trim() && (m.id === speaker.id || !isGroup)) {
      depthInjections.push({ msg: mk(dp.role || 'system', substituteMacros(dp.prompt, { ...env, char: m.name }), 'char-depth', 'char'), depth: dp.depth ?? 4, order: 70 });
    }
  }
  for (const d of wi.depth) depthInjections.push({ msg: mk(d.role, d.content, 'wi-depth', 'lore'), depth: d.depth, order: d.order });

  // Final turn instructions.
  const tail: PromptMessage[] = [];
  if (isGroup && opts.type !== 'impersonate' && preset.utility.groupNudge?.trim()) {
    tail.push(mk('system', sub(preset.utility.groupNudge), 'groupNudge', 'instructions'));
  }
  if (opts.type === 'impersonate') {
    tail.push(mk('system', sub(preset.utility.impersonation), 'impersonation', 'instructions'));
    prefill = '';
  }
  if (opts.type === 'continue' && connection?.api !== 'anthropic') {
    tail.push(mk('system', sub(preset.utility.continueNudge), 'continueNudge', 'instructions'));
  }
  if (opts.finalInstruction) tail.push(mk('system', sub(opts.finalInstruction), 'instruction', 'instructions'));
  if (opts.quietPrompt) tail.push(mk('system', sub(opts.quietPrompt), 'quiet', 'instructions'));

  // History messages (newest first until the budget runs out).
  const includeReasoning = preset.reasoning.addToPrompt;
  const namesInContent = preset.namesBehavior === 'content' || (preset.namesBehavior === 'default' && isGroup);
  const historyMsgs: PromptMessage[] = visibleHistory.map((m, i) => {
    const depth = visibleHistory.length - 1 - i;
    const role: Role = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant';
    let text = forPrompt(messageText(m, includeReasoning, preset.reasoning), depth, m.role === 'user' ? 1 : 2);
    text = substituteMacros(text, env);
    if (namesInContent && m.role !== 'system') text = `${m.name}: ${text}`;
    const msg = mk(role, text, 'history', 'history', m.name);
    msg.messageId = m.id;
    const images = (m.attachments || []).filter((a) => a.kind === 'image');
    if (images.length && connection?.vision) {
      msg.parts = [{ type: 'text', text }, ...images.map((a) => ({ type: 'image' as const, mime: a.mime, url: a.url }))];
      msg.tokens += 85 * images.length;
    }
    return msg;
  });

  const newChatMarker = sub(isGroup ? preset.utility.newGroupChat : preset.utility.newChat);
  const fixedTokens =
    [...before, ...after, ...tail, ...depthInjections.map((d) => d.msg)].reduce((a, m) => a + m.tokens, 0) +
    (newChatMarker ? countTokens(newChatMarker) + MESSAGE_OVERHEAD : 0) +
    countTokens(prefill) +
    8;
  const budget = contextSize - maxTokens - fixedTokens;
  if (budget < 0) warnings.push(t('The required part of the prompt does not fit into the context: shorten the description or the lorebook'));

  const included: PromptMessage[] = [];
  let used = 0;
  const historyEnabled = blocks.some((b) => b.marker === 'chatHistory');
  for (let i = historyEnabled ? historyMsgs.length - 1 : -1; i >= 0; i--) {
    const m = historyMsgs[i];
    // Always keep the very last message, even when over budget.
    if (used + m.tokens > budget && included.length) break;
    used += m.tokens;
    included.unshift(m);
  }

  // Depth injections: depth N means N history messages after the injection.
  const historyWithInjections: PromptMessage[] = [...included];
  const sortedInj = depthInjections.sort((a, b) => b.depth - a.depth || a.order - b.order);
  for (const inj of sortedInj) {
    const depth = Math.max(0, Math.min(inj.depth, included.length));
    // Count from the end over history messages only.
    let pos = historyWithInjections.length;
    let seen = 0;
    while (pos > 0 && seen < depth) {
      pos--;
      if (historyWithInjections[pos].source === 'history') seen++;
    }
    historyWithInjections.splice(pos, 0, inj.msg);
  }
  if (newChatMarker && included.length === historyMsgs.length) historyWithInjections.unshift(mk('system', newChatMarker, 'newChat', 'system'));

  let messages: PromptMessage[] = historyPlaced ? [...before, ...historyWithInjections, ...after, ...tail] : [...before, ...after, ...historyWithInjections, ...tail];

  if (preset.squashSystem) messages = squashSystem(messages);

  // Continue on Claude: the partial assistant message itself acts as a prefill.
  if (opts.type === 'continue' && connection?.api === 'anthropic') {
    const lastHist = messages.map((m) => m.source).lastIndexOf('history');
    if (lastHist !== -1 && messages[lastHist].role === 'assistant') {
      const [cont] = messages.splice(lastHist, 1);
      prefill = cont.content;
    }
  }

  if (prefill && opts.type !== 'impersonate' && mode === 'chat') messages.push(mk('assistant', prefill, 'prefill', 'instructions'));

  const breakdown: Record<Category, number> = { system: 0, char: 0, lore: 0, memory: 0, history: 0, instructions: 0 };
  for (const m of messages) breakdown[m.category] += m.tokens;
  const totalTokens = messages.reduce((a, m) => a + m.tokens, 0) + 3;

  const stop = [...preset.samplers.stop];
  let text: string | undefined;
  if (mode === 'text') {
    const tpl = ctx.instruct.find((it) => it.id === preset.instructId) || BUILTIN_INSTRUCT[0];
    const plain: PlainMessage[] = messages.map((m) => ({ role: m.role, content: m.content, name: m.source === 'history' ? m.name : undefined }));
    if (opts.type === 'continue') {
      // Continue in text mode: render without the last assistant turn, then append it raw.
      const lastIdx = plain.map((m) => m.role).lastIndexOf('assistant');
      const cont = lastIdx !== -1 ? plain.splice(lastIdx, 1)[0] : null;
      const r = renderInstruct(plain, tpl, { nextName: speaker.name, prefill: cont?.content, isGroup, userName });
      text = r.prompt;
      stop.push(...r.stop);
    } else {
      const r = renderInstruct(plain, tpl, { nextName: speaker.name, prefill, isGroup, impersonate: opts.type === 'impersonate', userName });
      text = r.prompt;
      stop.push(...r.stop);
    }
  }

  return {
    messages,
    text,
    stop: [...new Set(stop.filter(Boolean))],
    mode,
    breakdown,
    totalTokens: mode === 'text' && text ? countTokens(text) : totalTokens,
    contextSize,
    maxTokens,
    wi,
    historyIncluded: included.length,
    historyTotal: historyMsgs.length,
    env,
    vars,
    globalVars,
    prefill,
    warnings,
  };
}

function squashSystem(messages: PromptMessage[]): PromptMessage[] {
  const out: PromptMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === 'system' && m.role === 'system' && prev.source !== 'history' && m.source !== 'history' && !m.name && !prev.name) {
      prev.content = `${prev.content}\n\n${m.content}`;
      prev.tokens += m.tokens - MESSAGE_OVERHEAD;
      continue;
    }
    out.push({ ...m });
  }
  return out;
}

/** Converts built messages to the server's wire format (images fetched as base64). */
export async function toWireMessages(messages: PromptMessage[]): Promise<{ role: Role; content: string | unknown[]; name?: string }[]> {
  const out = [];
  for (const m of messages) {
    if (m.parts) {
      const parts = [];
      for (const p of m.parts) {
        if (p.type === 'image' && p.url && !p.data) {
          try {
            const blob = await (await fetch(p.url)).blob();
            const buf = new Uint8Array(await blob.arrayBuffer());
            let bin = '';
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            parts.push({ type: 'image', mime: blob.type || p.mime || 'image/png', data: btoa(bin) });
          } catch {
            /* skip unreadable image */
          }
        } else parts.push(p);
      }
      out.push({ role: m.role, content: parts });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export function samplersToParams(preset: Preset, extraStop: string[] = []) {
  const s = preset.samplers;
  let logitBias: Record<string, number> | undefined;
  if (s.logitBias?.trim()) {
    try {
      logitBias = JSON.parse(s.logitBias);
    } catch {
      logitBias = undefined;
    }
  }
  return {
    temperature: s.temperature,
    top_p: s.topP,
    top_k: s.topK,
    min_p: s.minP,
    top_a: s.topA,
    typical_p: s.typicalP,
    repetition_penalty: s.repetitionPenalty,
    rep_pen_range: s.repPenRange,
    frequency_penalty: s.frequencyPenalty,
    presence_penalty: s.presencePenalty,
    max_tokens: s.maxTokens,
    context_size: s.contextSize,
    seed: s.seed >= 0 ? s.seed : undefined,
    stop: [...new Set([...(s.stop || []), ...extraStop])].filter(Boolean),
    logit_bias: logitBias,
    reasoning_effort: s.reasoningEffort || undefined,
    thinking_budget: s.thinkingBudget || 0,
    dry_multiplier: s.dryMultiplier,
    xtc_probability: s.xtcProbability,
    xtc_threshold: s.xtcThreshold,
  };
}
