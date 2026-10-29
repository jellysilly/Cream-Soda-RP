/**
 * Import/export converters between Cream Soda's data model and the formats used by
 * SillyTavern and the character card specs (V1/V2/V3), so existing cards, lorebooks,
 * presets, regex scripts and chats move over without losses.
 */
import type {
  Character,
  Chat,
  ChatMessage,
  InstructTemplate,
  Lorebook,
  Persona,
  Preset,
  PromptBlock,
  RegexScript,
  Role,
  WorldEntry,
  WILogic,
  WIPosition,
} from './types';
import { newCharacter, newChat, newLorebook, newPreset, newRegex, newWorldEntry, DEFAULT_SAMPLERS, DEFAULT_UTILITY, newPersona } from './defaults';
import { uid } from './utils';
import { locale, t } from './i18n';

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter((x) => x !== '') : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const roleFromNum = (n: unknown): Role => (n === 1 || n === 'user' ? 'user' : n === 2 || n === 'assistant' ? 'assistant' : 'system');
const roleToNum = (r: Role) => (r === 'user' ? 1 : r === 'assistant' ? 2 : 0);

// ───────── World info entries ─────────

/** ST world-info entry (lorebook JSON) → WorldEntry */
export function entryFromST(e: any): WorldEntry {
  return newWorldEntry({
    uid: str(e.uid ?? e.id ?? uid()),
    comment: str(e.comment || e.name || (arr(e.key || e.keys)[0] ?? t('Entry'))),
    keys: arr(e.key ?? e.keys),
    secondaryKeys: arr(e.keysecondary ?? e.secondary_keys),
    selectiveLogic: (num(e.selectiveLogic ?? e.extensions?.selectiveLogic, 0) as WILogic) || 0,
    content: str(e.content),
    enabled: e.disable !== undefined ? !e.disable : e.enabled !== false,
    constant: !!e.constant,
    position: positionFromST(e),
    depth: num(e.depth ?? e.extensions?.depth, 4),
    role: roleFromNum(e.role ?? e.extensions?.role),
    order: num(e.order ?? e.insertion_order, 100),
    probability: num(e.probability ?? e.extensions?.probability, 100),
    useProbability: !!(e.useProbability ?? e.extensions?.useProbability),
    caseSensitive: e.caseSensitive ?? e.case_sensitive ?? e.extensions?.case_sensitive ?? null,
    matchWholeWords: e.matchWholeWords ?? e.extensions?.match_whole_words ?? null,
    scanDepth: e.scanDepth ?? e.extensions?.scan_depth ?? null,
    excludeRecursion: !!(e.excludeRecursion ?? e.extensions?.exclude_recursion),
    preventRecursion: !!(e.preventRecursion ?? e.extensions?.prevent_recursion),
    delayUntilRecursion: !!(e.delayUntilRecursion ?? e.extensions?.delay_until_recursion),
    group: str(e.group ?? e.extensions?.group),
    groupOverride: !!(e.groupOverride ?? e.extensions?.group_override),
    groupWeight: num(e.groupWeight ?? e.extensions?.group_weight, 100),
    sticky: num(e.sticky ?? e.extensions?.sticky, 0),
    cooldown: num(e.cooldown ?? e.extensions?.cooldown, 0),
    delay: num(e.delay ?? e.extensions?.delay, 0),
    outletName: str(e.outletName ?? e.extensions?.outlet_name),
    extra: {},
  });
}

function positionFromST(e: any): WIPosition {
  const p = e.position ?? e.extensions?.position;
  if (typeof p === 'number' && p >= 0 && p <= 7) return p as WIPosition;
  if (p === 'after_char') return 1;
  return 0;
}

/** WorldEntry → ST world-info entry */
export function entryToST(e: WorldEntry, index: number): any {
  return {
    uid: index,
    key: e.keys,
    keysecondary: e.secondaryKeys,
    comment: e.comment,
    content: e.content,
    constant: e.constant,
    vectorized: false,
    selective: e.secondaryKeys.length > 0,
    selectiveLogic: e.selectiveLogic,
    addMemo: true,
    order: e.order,
    position: e.position,
    disable: !e.enabled,
    excludeRecursion: e.excludeRecursion,
    preventRecursion: e.preventRecursion,
    delayUntilRecursion: e.delayUntilRecursion,
    probability: e.probability,
    useProbability: e.useProbability,
    depth: e.depth,
    group: e.group,
    groupOverride: e.groupOverride,
    groupWeight: e.groupWeight,
    scanDepth: e.scanDepth,
    caseSensitive: e.caseSensitive,
    matchWholeWords: e.matchWholeWords,
    useGroupScoring: null,
    automationId: '',
    role: roleToNum(e.role),
    sticky: e.sticky,
    cooldown: e.cooldown,
    delay: e.delay,
    outletName: e.outletName,
    displayIndex: index,
  };
}

/** Card V2 character_book entry → WorldEntry */
function entryFromBook(e: any, i: number): WorldEntry {
  const ext = e.extensions || {};
  return newWorldEntry({
    uid: str(e.id ?? i),
    comment: str(e.comment || e.name || arr(e.keys)[0] || t('Entry {i}', { i: i + 1 })),
    keys: arr(e.keys),
    secondaryKeys: arr(e.secondary_keys),
    selectiveLogic: num(ext.selectiveLogic, 0) as WILogic,
    content: str(e.content),
    enabled: e.enabled !== false,
    constant: !!e.constant,
    position: typeof ext.position === 'number' ? (ext.position as WIPosition) : e.position === 'after_char' ? 1 : 0,
    depth: num(ext.depth, 4),
    role: roleFromNum(ext.role),
    order: num(e.insertion_order, 100),
    probability: num(ext.probability, 100),
    useProbability: !!ext.useProbability,
    caseSensitive: e.case_sensitive ?? null,
    matchWholeWords: ext.match_whole_words ?? null,
    scanDepth: ext.scan_depth ?? null,
    excludeRecursion: !!ext.exclude_recursion,
    preventRecursion: !!ext.prevent_recursion,
    delayUntilRecursion: !!ext.delay_until_recursion,
    group: str(ext.group),
    groupOverride: !!ext.group_override,
    groupWeight: num(ext.group_weight, 100),
    sticky: num(ext.sticky, 0),
    cooldown: num(ext.cooldown, 0),
    delay: num(ext.delay, 0),
  });
}

function entryToBook(e: WorldEntry, i: number): any {
  return {
    id: i,
    keys: e.keys,
    secondary_keys: e.secondaryKeys,
    comment: e.comment,
    content: e.content,
    constant: e.constant,
    selective: e.secondaryKeys.length > 0,
    insertion_order: e.order,
    enabled: e.enabled,
    position: e.position === 1 ? 'after_char' : 'before_char',
    use_regex: true,
    extensions: {
      position: e.position,
      exclude_recursion: e.excludeRecursion,
      prevent_recursion: e.preventRecursion,
      delay_until_recursion: e.delayUntilRecursion,
      display_index: i,
      probability: e.probability,
      useProbability: e.useProbability,
      depth: e.depth,
      selectiveLogic: e.selectiveLogic,
      group: e.group,
      group_override: e.groupOverride,
      group_weight: e.groupWeight,
      scan_depth: e.scanDepth,
      case_sensitive: e.caseSensitive,
      match_whole_words: e.matchWholeWords,
      role: roleToNum(e.role),
      sticky: e.sticky,
      cooldown: e.cooldown,
      delay: e.delay,
    },
  };
}

// ───────── Lorebooks ─────────

export function lorebookFromJson(json: any, fallbackName = t('Lorebook')): Lorebook {
  // ST world file: { entries: { "0": {...} } } · card book: { entries: [...] } · Novel/Agnai variants
  const book = json?.data?.character_book || json?.character_book || json;
  let entries: WorldEntry[] = [];
  if (Array.isArray(book?.entries)) {
    entries = book.entries.map((e: any, i: number) => (e.key !== undefined || e.keysecondary !== undefined ? entryFromST(e) : entryFromBook(e, i)));
  } else if (book?.entries && typeof book.entries === 'object') {
    entries = Object.values(book.entries).map((e: any) => entryFromST(e));
  } else if (Array.isArray(book?.lorebookEntries)) {
    entries = book.lorebookEntries.map((e: any) =>
      newWorldEntry({ comment: str(e.displayName || e.name), keys: arr(e.keys), content: str(e.text || e.entry), enabled: e.enabled !== false }),
    );
  } else throw new Error(t('Does not look like a lorebook: no list of entries'));
  entries.sort((a, b) => num((a as any).extra?.displayIndex, 0) - num((b as any).extra?.displayIndex, 0));
  // Re-key uids so two imports never collide.
  entries = entries.map((e) => ({ ...e, uid: uid() }));
  return newLorebook({ name: str(book.name || json?.name, fallbackName), description: str(book.description), entries });
}

export function lorebookToST(book: Lorebook): any {
  const entries: Record<string, any> = {};
  book.entries.forEach((e, i) => (entries[String(i)] = entryToST(e, i)));
  return { name: book.name, description: book.description, entries };
}

export function lorebookToCardBook(book: Lorebook): any {
  return {
    name: book.name,
    description: book.description,
    scan_depth: undefined,
    token_budget: undefined,
    recursive_scanning: true,
    extensions: {},
    entries: book.entries.map(entryToBook),
  };
}

// ───────── Character cards ─────────

export interface ParsedCard {
  character: Character;
  book: Lorebook | null;
  regex: RegexScript[];
}

export function characterFromCard(json: any): ParsedCard {
  if (!json || typeof json !== 'object') throw new Error(t('Empty card'));
  const isV2 = json.spec === 'chara_card_v2' || json.spec === 'chara_card_v3';
  const d = isV2 ? json.data || {} : json;
  const ext = (d.extensions && typeof d.extensions === 'object' ? d.extensions : {}) as Record<string, any>;
  const cs = (ext.cream_soda || {}) as Record<string, any>;
  if (!str(d.name || json.char_name).trim()) throw new Error(t('The card has no character name'));

  const character = newCharacter({
    name: str(d.name || json.char_name),
    tagline: str(cs.tagline || d.nickname || ''),
    description: str(d.description ?? json.char_persona),
    personality: str(d.personality),
    scenario: str(d.scenario ?? json.world_scenario),
    firstMessage: str(d.first_mes ?? json.char_greeting),
    alternateGreetings: arr(d.alternate_greetings),
    groupGreetings: arr(d.group_only_greetings),
    exampleMessages: str(d.mes_example ?? json.example_dialogue),
    systemPrompt: str(d.system_prompt),
    postHistoryInstructions: str(d.post_history_instructions),
    creatorNotes: str(d.creator_notes ?? json.creatorcomment),
    creator: str(d.creator),
    characterVersion: str(d.character_version),
    nickname: str(d.nickname),
    tags: arr(d.tags),
    kana: str(cs.kana),
    palette: typeof cs.palette === 'number' ? cs.palette : -1,
    fav: !!(ext.fav ?? json.fav),
    talkativeness: num(ext.talkativeness ?? json.talkativeness, 0.5),
    depthPrompt: {
      prompt: str(ext.depth_prompt?.prompt),
      depth: num(ext.depth_prompt?.depth, 4),
      role: (['system', 'user', 'assistant'].includes(ext.depth_prompt?.role) ? ext.depth_prompt.role : 'system') as Role,
    },
    extensions: Object.fromEntries(
      Object.entries(ext).filter(([k]) => !['fav', 'talkativeness', 'depth_prompt', 'regex_scripts', 'cream_soda', 'world'].includes(k)),
    ),
  });

  let book: Lorebook | null = null;
  if (d.character_book && Array.isArray(d.character_book.entries) && d.character_book.entries.length) {
    book = lorebookFromJson({ character_book: d.character_book }, t('{name} · lorebook', { name: character.name }));
    if (!d.character_book.name) book.name = t('{name} · lorebook', { name: character.name });
  }

  const regex = Array.isArray(ext.regex_scripts)
    ? ext.regex_scripts.map((r: any) => ({ ...regexFromST(r), scope: { type: 'character' as const, id: character.id } }))
    : [];

  return { character, book, regex };
}

export function characterToCardV2(c: Character, book: Lorebook | null, regex: RegexScript[]): any {
  const data: any = {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMessage,
    mes_example: c.exampleMessages,
    creator_notes: c.creatorNotes,
    system_prompt: c.systemPrompt,
    post_history_instructions: c.postHistoryInstructions,
    alternate_greetings: c.alternateGreetings,
    tags: c.tags,
    creator: c.creator,
    character_version: c.characterVersion,
    extensions: {
      ...c.extensions,
      talkativeness: String(c.talkativeness),
      fav: c.fav,
      world: book?.name || '',
      depth_prompt: c.depthPrompt,
      regex_scripts: regex.map(regexToST),
      cream_soda: { tagline: c.tagline, kana: c.kana, palette: c.palette },
    },
  };
  if (book) data.character_book = lorebookToCardBook(book);
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    // V1 mirror fields for very old frontends.
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMessage,
    mes_example: c.exampleMessages,
    data,
  };
}

export function characterToCardV3(c: Character, book: Lorebook | null, regex: RegexScript[]): any {
  const v2 = characterToCardV2(c, book, regex);
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      ...v2.data,
      nickname: c.nickname,
      group_only_greetings: c.groupGreetings,
      creation_date: Math.floor(c.createdAt / 1000),
      modification_date: Math.floor(c.updatedAt / 1000),
      assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
    },
  };
}

// ───────── Regex ─────────

export function regexFromST(r: any): RegexScript {
  return newRegex({
    id: uid(),
    name: str(r.scriptName || r.name, t('Regex')),
    findRegex: str(r.findRegex),
    replaceString: str(r.replaceString),
    trimStrings: arr(r.trimStrings),
    placement: (Array.isArray(r.placement) ? r.placement : [2]).filter((p: number) => [1, 2, 3, 5, 6].includes(p)),
    disabled: !!r.disabled,
    markdownOnly: !!r.markdownOnly,
    promptOnly: !!r.promptOnly,
    runOnEdit: r.runOnEdit !== false,
    substituteRegex: ([0, 1, 2].includes(Number(r.substituteRegex)) ? Number(r.substituteRegex) : r.substituteRegex === true ? 1 : 0) as 0 | 1 | 2,
    minDepth: r.minDepth === '' || r.minDepth == null ? null : num(r.minDepth, 0),
    maxDepth: r.maxDepth === '' || r.maxDepth == null ? null : num(r.maxDepth, 0),
    renderHtml: !!r.renderHtml || /<\w+[^>]*>/.test(str(r.replaceString)),
  });
}

export function regexToST(r: RegexScript): any {
  return {
    id: r.id,
    scriptName: r.name,
    findRegex: r.findRegex,
    replaceString: r.replaceString,
    trimStrings: r.trimStrings,
    placement: r.placement,
    disabled: r.disabled,
    markdownOnly: r.markdownOnly,
    promptOnly: r.promptOnly,
    runOnEdit: r.runOnEdit,
    substituteRegex: r.substituteRegex,
    minDepth: r.minDepth,
    maxDepth: r.maxDepth,
  };
}

export function regexListFromJson(json: any): RegexScript[] {
  if (Array.isArray(json)) return json.map(regexFromST);
  if (json && Array.isArray(json.regex_scripts)) return json.regex_scripts.map(regexFromST);
  if (json && json.findRegex !== undefined) return [regexFromST(json)];
  throw new Error(t('Does not look like a SillyTavern regex script'));
}

// ───────── Presets ─────────

const ST_MARKERS: Record<string, PromptBlock['marker']> = {
  charDescription: 'charDescription',
  charPersonality: 'charPersonality',
  scenario: 'scenario',
  personaDescription: 'personaDescription',
  worldInfoBefore: 'worldInfoBefore',
  worldInfoAfter: 'worldInfoAfter',
  dialogueExamples: 'dialogueExamples',
  chatHistory: 'chatHistory',
  memoryBook: 'memoryBook',
  charCard: 'charCard',
};

const ST_NAMES: Record<string, string> = {
  main: t('Main prompt'),
  nsfw: t('Auxiliary prompt'),
  jailbreak: t('Post-history instruction'),
  enhanceDefinitions: t('Enhance definitions'),
  charDescription: t('Description · {{char}}'),
  charPersonality: t('Personality · {{char}}'),
  scenario: t('Scenario'),
  personaDescription: t('Persona · {{user}}'),
  worldInfoBefore: t('Lorebook · before the card'),
  worldInfoAfter: t('Lorebook · after the card'),
  dialogueExamples: t('Dialogue examples'),
  chatHistory: t('Chat history'),
};

export function presetFromJson(json: any, name = t('Imported preset')): Preset {
  if (json?.samplers && Array.isArray(json?.prompts)) {
    // Our own export.
    return { ...newPreset(), ...json, id: uid(), name: str(json.name, name) };
  }
  const p = newPreset({ name: str(json?.name || json?.preset_name, name) });
  const s = { ...DEFAULT_SAMPLERS };
  s.temperature = num(json.temperature ?? json.temp, s.temperature);
  s.topP = num(json.top_p, s.topP);
  s.topK = num(json.top_k, s.topK);
  s.minP = num(json.min_p, s.minP);
  s.topA = num(json.top_a, s.topA);
  s.typicalP = num(json.typical_p ?? json.typical, s.typicalP);
  s.repetitionPenalty = num(json.repetition_penalty ?? json.rep_pen, s.repetitionPenalty);
  s.repPenRange = num(json.rep_pen_range ?? json.repetition_penalty_range, s.repPenRange);
  s.frequencyPenalty = num(json.frequency_penalty ?? json.freq_pen, s.frequencyPenalty);
  s.presencePenalty = num(json.presence_penalty ?? json.presence_pen, s.presencePenalty);
  s.maxTokens = num(json.openai_max_tokens ?? json.genamt ?? json.max_length, s.maxTokens);
  s.contextSize = num(json.openai_max_context ?? json.max_context_length, s.contextSize);
  s.stream = json.stream_openai ?? json.streaming ?? s.stream;
  s.seed = num(json.seed, -1);
  s.reasoningEffort = ['low', 'medium', 'high'].includes(json.reasoning_effort) ? json.reasoning_effort : '';
  if (Array.isArray(json.stop_sequence)) s.stop = json.stop_sequence.map(String);
  p.samplers = s;
  p.squashSystem = !!json.squash_system_messages;
  p.namesBehavior = json.names_behavior === 2 ? 'content' : json.names_behavior === -1 ? 'none' : 'default';
  p.utility = {
    ...DEFAULT_UTILITY,
    impersonation: str(json.impersonation_prompt, DEFAULT_UTILITY.impersonation),
    continueNudge: str(json.continue_nudge_prompt, DEFAULT_UTILITY.continueNudge),
    newChat: str(json.new_chat_prompt, DEFAULT_UTILITY.newChat),
    newGroupChat: str(json.new_group_chat_prompt, DEFAULT_UTILITY.newGroupChat),
    newExampleChat: str(json.new_example_chat_prompt, DEFAULT_UTILITY.newExampleChat),
    groupNudge: str(json.group_nudge_prompt, DEFAULT_UTILITY.groupNudge),
    wiFormat: str(json.wi_format, DEFAULT_UTILITY.wiFormat),
    scenarioFormat: str(json.scenario_format, DEFAULT_UTILITY.scenarioFormat),
    personalityFormat: str(json.personality_format, DEFAULT_UTILITY.personalityFormat),
    sendIfEmpty: str(json.send_if_empty),
  };

  if (Array.isArray(json.prompts)) {
    const defs = new Map<string, any>(json.prompts.map((x: any) => [x.identifier, x]));
    const orderList: { identifier: string; enabled: boolean }[] =
      (Array.isArray(json.prompt_order) &&
        (json.prompt_order.find((o: any) => o.character_id === 100001) || json.prompt_order[json.prompt_order.length - 1])?.order) ||
      json.prompts.map((x: any) => ({ identifier: x.identifier, enabled: x.enabled !== false }));
    const blocks: PromptBlock[] = [];
    for (const o of orderList) {
      const d = defs.get(o.identifier);
      if (!d) continue;
      const marker = d.marker ? ST_MARKERS[d.identifier] : undefined;
      if (d.marker && !marker) continue;
      blocks.push({
        id: d.identifier,
        name: str(d.name) || ST_NAMES[d.identifier] || d.identifier,
        role: (['system', 'user', 'assistant'].includes(d.role) ? d.role : 'system') as Role,
        content: str(d.content),
        enabled: o.enabled !== false,
        marker,
        position: d.injection_position === 1 ? 'depth' : 'relative',
        depth: num(d.injection_depth, 4),
        order: num(d.injection_order, 100),
        builtin: !!d.system_prompt || !!marker,
      });
    }
    if (!blocks.some((b) => b.marker === 'memoryBook')) {
      const hist = blocks.findIndex((b) => b.marker === 'chatHistory');
      blocks.splice(hist === -1 ? blocks.length : hist, 0, {
        id: 'memoryBook',
        name: 'Memory Book',
        role: 'system',
        content: '',
        enabled: true,
        marker: 'memoryBook',
        position: 'relative',
        depth: 4,
        order: 100,
        builtin: true,
      });
    }
    const prefill = str(json.assistant_prefill);
    blocks.push({ id: 'prefill', name: t('Response prefill'), role: 'assistant', content: prefill, enabled: !!prefill, position: 'relative', depth: 4, order: 100, builtin: true });
    if (blocks.length) p.prompts = blocks;
  }
  return p;
}

export function presetToST(p: Preset): any {
  const prompts = p.prompts
    .filter((b) => b.id !== 'prefill')
    .map((b) => ({
      identifier: b.marker === 'charCard' ? 'charDescription' : b.id,
      name: b.name,
      system_prompt: !!b.builtin,
      role: b.role,
      content: b.content,
      marker: !!b.marker,
      injection_position: b.position === 'depth' ? 1 : 0,
      injection_depth: b.depth,
      injection_order: b.order,
      forbid_overrides: false,
    }));
  const s = p.samplers;
  return {
    name: p.name,
    temperature: s.temperature,
    frequency_penalty: s.frequencyPenalty,
    presence_penalty: s.presencePenalty,
    top_p: s.topP,
    top_k: s.topK,
    top_a: s.topA,
    min_p: s.minP,
    repetition_penalty: s.repetitionPenalty,
    openai_max_context: s.contextSize,
    openai_max_tokens: s.maxTokens,
    stream_openai: s.stream,
    seed: s.seed,
    names_behavior: p.namesBehavior === 'content' ? 2 : p.namesBehavior === 'none' ? -1 : 0,
    squash_system_messages: p.squashSystem,
    impersonation_prompt: p.utility.impersonation,
    continue_nudge_prompt: p.utility.continueNudge,
    new_chat_prompt: p.utility.newChat,
    new_group_chat_prompt: p.utility.newGroupChat,
    new_example_chat_prompt: p.utility.newExampleChat,
    group_nudge_prompt: p.utility.groupNudge,
    wi_format: p.utility.wiFormat,
    scenario_format: p.utility.scenarioFormat,
    personality_format: p.utility.personalityFormat,
    send_if_empty: p.utility.sendIfEmpty,
    assistant_prefill: p.prompts.find((b) => b.id === 'prefill' && b.enabled)?.content || '',
    reasoning_effort: s.reasoningEffort,
    prompts,
    prompt_order: [{ character_id: 100001, order: prompts.map((x, i) => ({ identifier: x.identifier, enabled: p.prompts.filter((b) => b.id !== 'prefill')[i].enabled })) }],
    cream_soda: p,
  };
}

// ───────── Instruct templates ─────────

export function instructFromJson(json: any): InstructTemplate {
  const j = json?.instruct || json;
  return {
    id: uid(),
    name: str(j.name, t('Template')),
    inputSequence: str(j.input_sequence ?? j.inputSequence),
    outputSequence: str(j.output_sequence ?? j.outputSequence),
    systemSequence: str(j.system_sequence ?? j.systemSequence),
    inputSuffix: str(j.input_suffix ?? j.inputSuffix),
    outputSuffix: str(j.output_suffix ?? j.outputSuffix),
    systemSuffix: str(j.system_suffix ?? j.systemSuffix),
    firstOutputSequence: str(j.first_output_sequence ?? j.firstOutputSequence),
    lastOutputSequence: str(j.last_output_sequence ?? j.lastOutputSequence),
    stopSequence: str(j.stop_sequence ?? j.stopSequence),
    storyStringPrefix: str(j.story_string_prefix ?? j.storyStringPrefix),
    storyStringSuffix: str(j.story_string_suffix ?? j.storyStringSuffix),
    wrap: j.wrap !== false,
    namesBehavior: j.names_behavior === 'always' || j.names === true ? 'always' : j.names_behavior === 'none' ? 'none' : 'force',
    systemSameAsUser: !!(j.system_same_as_user ?? j.systemSameAsUser),
  };
}

// ───────── Chats (ST .jsonl) ─────────

export function chatFromJsonl(text: string, owner: { type: 'character' | 'group'; id: string; charName: string }, personaId?: string): Chat {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (!lines.length) throw new Error(t('Empty chat file'));
  const header = lines[0].chat_metadata !== undefined || lines[0].user_name !== undefined ? lines.shift() : null;
  const chat = newChat(owner.type, owner.id, t('Import {x}', { x: new Date().toLocaleDateString(locale()) }));
  if (header?.chat_metadata?.note_prompt) {
    chat.meta.authorNote = {
      text: str(header.chat_metadata.note_prompt),
      depth: num(header.chat_metadata.note_depth, 4),
      interval: num(header.chat_metadata.note_interval, 1),
      role: roleFromNum(header.chat_metadata.note_role),
      position: header.chat_metadata.note_position === 0 ? 'after_main' : 'depth',
    };
  }
  if (header?.chat_metadata?.variables) chat.meta.variables = { ...header.chat_metadata.variables };
  chat.messages = lines.map((l: any): ChatMessage => {
    const date = parseStDate(l.send_date);
    const swipes = Array.isArray(l.swipes) && l.swipes.length ? l.swipes.map((sw: any, i: number) => ({ text: str(sw), date: parseStDate(l.swipe_info?.[i]?.send_date) || date })) : [{ text: str(l.mes), date }];
    const swipeId = Math.min(num(l.swipe_id, 0), swipes.length - 1);
    return {
      id: uid(),
      role: l.is_user ? 'user' : l.is_system ? 'system' : 'char',
      name: str(l.name, l.is_user ? 'You' : owner.charName),
      personaId: l.is_user ? personaId : undefined,
      text: str(l.mes),
      reasoning: str(l.extra?.reasoning) || undefined,
      swipes,
      swipeId: Math.max(0, swipeId),
      sendDate: date,
      hidden: !!l.is_system && l.extra?.type !== 'narrator',
      image: l.extra?.image || undefined,
    };
  });
  return chat;
}

function parseStDate(v: unknown): number {
  if (typeof v === 'number') return v;
  if (!v) return Date.now();
  const ms = Date.parse(String(v).replace(/(\d+)(am|pm)/i, '$1 $2'));
  return Number.isFinite(ms) ? ms : Date.now();
}

export function chatToJsonl(chat: Chat, userName: string, charName: string): string {
  const header = {
    user_name: userName,
    character_name: charName,
    create_date: new Date(chat.createdAt).toISOString(),
    chat_metadata: {
      note_prompt: chat.meta.authorNote?.text || '',
      note_depth: chat.meta.authorNote?.depth ?? 4,
      note_interval: chat.meta.authorNote?.interval ?? 1,
      note_role: roleToNum(chat.meta.authorNote?.role || 'system'),
      variables: chat.meta.variables,
      cream_soda: { memory: chat.meta.memory, title: chat.title },
    },
  };
  const lines = chat.messages.map((m) => ({
    name: m.name,
    is_user: m.role === 'user',
    is_system: m.role === 'system' || !!m.hidden,
    send_date: new Date(m.sendDate).toISOString(),
    mes: m.text,
    swipes: m.swipes.map((s) => s.text),
    swipe_id: m.swipeId,
    swipe_info: m.swipes.map((s) => ({ send_date: new Date(s.date).toISOString(), extra: { model: s.gen?.model } })),
    extra: { reasoning: m.reasoning, image: m.image, type: m.role === 'system' ? 'narrator' : undefined, model: m.gen?.model },
  }));
  return [header, ...lines].map((l) => JSON.stringify(l)).join('\n');
}

export function chatToText(chat: Chat): string {
  return chat.messages
    .filter((m) => !m.hidden)
    .map((m) => `${m.name}:\n${m.text}`)
    .join('\n\n');
}

// ───────── Personas ─────────

export function personaFromJson(json: any): Persona[] {
  if (json?.personas && typeof json.personas === 'object' && !Array.isArray(json.personas)) {
    // ST settings.json fragment: personas: { "avatar.png": "Name" }, persona_descriptions: {...}
    return Object.entries(json.personas).map(([avatar, name]) =>
      newPersona({ name: str(name), description: str(json.persona_descriptions?.[avatar]?.description) }),
    );
  }
  const list = Array.isArray(json) ? json : [json];
  return list.map((p: any) => newPersona({ ...p, id: uid(), name: str(p.name, t('Persona')), description: str(p.description) }));
}
