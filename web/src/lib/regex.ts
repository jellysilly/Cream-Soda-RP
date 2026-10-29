import type { RegexPlacement, RegexScript } from './types';
import { substituteMacros, type MacroEnv } from './macros';
import { escapeRegex } from './utils';
import { t } from './i18n';

export const PLACEMENT = {
  USER_INPUT: 1 as RegexPlacement,
  AI_OUTPUT: 2 as RegexPlacement,
  SLASH_COMMAND: 3 as RegexPlacement,
  WORLD_INFO: 5 as RegexPlacement,
  REASONING: 6 as RegexPlacement,
};

export const PLACEMENT_LABELS: Record<number, string> = {
  1: t('Player input'),
  2: t('AI replies'),
  3: t('Slash commands'),
  5: t('Lorebook'),
  6: t('Model reasoning'),
};

const regexCache = new Map<string, RegExp | null>();

/** Parses "/pattern/flags" (SillyTavern style) or a bare pattern. */
export function parseRegex(input: string): RegExp | null {
  if (!input) return null;
  if (regexCache.has(input)) {
    const r = regexCache.get(input)!;
    if (r) r.lastIndex = 0;
    return r;
  }
  let re: RegExp | null = null;
  try {
    const m = /^\/([\s\S]+)\/([dgimsuvy]*)$/.exec(input);
    re = m ? new RegExp(m[1], m[2]) : new RegExp(input, 'g');
  } catch {
    re = null;
  }
  if (regexCache.size > 500) regexCache.clear();
  regexCache.set(input, re);
  return re;
}

export function regexError(input: string): string {
  if (!input) return '';
  try {
    const m = /^\/([\s\S]+)\/([dgimsuvy]*)$/.exec(input);
    if (m) new RegExp(m[1], m[2]);
    else new RegExp(input, 'g');
    return '';
  } catch (err) {
    return (err as Error).message;
  }
}

function trimCaptured(value: string, trims: string[], env?: MacroEnv): string {
  let out = value ?? '';
  for (const trim of trims) {
    if (!trim) continue;
    const needle = env ? substituteMacros(trim, env) : trim;
    out = out.split(needle).join('');
  }
  return out;
}

export function runRegexScript(script: RegexScript, text: string, env?: MacroEnv): string {
  if (!text || !script.findRegex) return text;
  let source = script.findRegex;
  if (script.substituteRegex && env) {
    source =
      script.substituteRegex === 2
        ? substituteMacros(source, {
            ...env,
            user: escapeRegex(env.user),
            char: escapeRegex(env.char),
          })
        : substituteMacros(source, env);
  }
  const re = parseRegex(source);
  if (!re) return text;
  re.lastIndex = 0;
  return text.replace(re, (...args: any[]) => {
    const match: string = args[0];
    const hasNamed = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
    const groups: string[] = args.slice(1, hasNamed ? -3 : -2);
    const named: Record<string, string> = hasNamed ? args[args.length - 1] : {};
    let replacement = script.replaceString.replace(/\{\{match\}\}/gi, '$0');
    replacement = replacement.replace(/\$(\d+)|\$<([^>]+)>/g, (_m, num: string, name: string) => {
      if (name !== undefined) return trimCaptured(named[name] ?? '', script.trimStrings, env);
      const idx = Number(num);
      if (idx === 0) return trimCaptured(match, script.trimStrings, env);
      return trimCaptured(groups[idx - 1] ?? '', script.trimStrings, env);
    });
    return env ? substituteMacros(replacement, env) : replacement;
  });
}

export interface RegexRunOptions {
  placement: RegexPlacement;
  /** Display pass: scripts marked «display only». */
  display?: boolean;
  /** Prompt pass: scripts marked «prompt only». */
  prompt?: boolean;
  /** Message depth from the end of the chat (0 = last). */
  depth?: number;
  isEdit?: boolean;
  env?: MacroEnv;
}

export function scriptApplies(s: RegexScript, o: RegexRunOptions): boolean {
  if (s.disabled || !s.placement.includes(o.placement)) return false;
  if (o.isEdit && !s.runOnEdit) return false;
  if (o.display) {
    if (!s.markdownOnly) return false;
  } else if (o.prompt) {
    if (!s.promptOnly) return false;
  } else if (s.markdownOnly || s.promptOnly) return false;
  if (typeof o.depth === 'number') {
    if (s.minDepth !== null && s.minDepth !== undefined && s.minDepth >= 0 && o.depth < s.minDepth) return false;
    if (s.maxDepth !== null && s.maxDepth !== undefined && s.maxDepth >= 0 && o.depth > s.maxDepth) return false;
  }
  return true;
}

export function applyRegex(text: string, scripts: RegexScript[], o: RegexRunOptions): string {
  let out = text;
  for (const s of scripts) if (scriptApplies(s, o)) out = runRegexScript(s, out, o.env);
  return out;
}

/** Scripts active for the current character/preset: global → preset → character. */
export function activeScripts(all: RegexScript[], charIds: string[], presetId: string): RegexScript[] {
  const byOrder = (a: RegexScript, b: RegexScript) => (a.order ?? 0) - (b.order ?? 0);
  const global = all.filter((s) => s.scope.type === 'global').sort(byOrder);
  const preset = all.filter((s) => s.scope.type === 'preset' && s.scope.id === presetId).sort(byOrder);
  const chars = all.filter((s) => s.scope.type === 'character' && charIds.includes(s.scope.id)).sort(byOrder);
  return [...global, ...preset, ...chars];
}

export function countMatches(script: RegexScript, text: string, env?: MacroEnv): number {
  const source = script.substituteRegex && env ? substituteMacros(script.findRegex, env) : script.findRegex;
  const re = parseRegex(source);
  if (!re || !text) return 0;
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return Array.from(text.matchAll(new RegExp(re.source, flags))).length;
}
