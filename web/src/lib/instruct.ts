import type { InstructTemplate } from './types';

export interface PlainMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/**
 * Renders chat-style messages into a single Text Completion prompt using an
 * instruct template (ChatML, Llama 3, Mistral…). The prompt ends with the output
 * sequence for the next speaker, optionally followed by their name and a prefill.
 */
export function renderInstruct(
  messages: PlainMessage[],
  tpl: InstructTemplate,
  opts: { nextName: string; prefill?: string; isGroup?: boolean; impersonate?: boolean; userName: string },
): { prompt: string; stop: string[] } {
  const nl = tpl.wrap ? '\n' : '';
  const useNames = tpl.namesBehavior === 'always' || (tpl.namesBehavior === 'force' && opts.isGroup);
  let out = tpl.storyStringPrefix || '';
  let firstOutput = true;

  for (const m of messages) {
    let seq: string;
    let suffix: string;
    if (m.role === 'system') {
      if (tpl.systemSameAsUser || !tpl.systemSequence) {
        seq = tpl.systemSameAsUser ? tpl.inputSequence : tpl.systemSequence;
        suffix = tpl.systemSameAsUser ? tpl.inputSuffix : tpl.systemSuffix;
      } else {
        seq = tpl.systemSequence;
        suffix = tpl.systemSuffix;
      }
    } else if (m.role === 'user') {
      seq = tpl.inputSequence;
      suffix = tpl.inputSuffix;
    } else {
      seq = firstOutput && tpl.firstOutputSequence ? tpl.firstOutputSequence : tpl.outputSequence;
      suffix = tpl.outputSuffix;
      firstOutput = false;
    }
    const name = useNames && m.name && m.role !== 'system' ? `${m.name}: ` : '';
    out += `${seq}${seq ? nl : ''}${name}${m.content}${suffix || (tpl.wrap ? '\n' : '')}`;
  }

  if (opts.impersonate) {
    out += `${tpl.inputSequence}${tpl.inputSequence ? nl : ''}${useNames ? `${opts.userName}:` : ''}`;
  } else {
    const last = tpl.lastOutputSequence || tpl.outputSequence;
    out += `${last}${last ? nl : ''}${useNames ? `${opts.nextName}:` : ''}`;
    if (opts.prefill) out += `${useNames ? ' ' : ''}${opts.prefill}`;
  }

  const stop = new Set<string>();
  if (tpl.stopSequence) stop.add(tpl.stopSequence);
  const trimSeq = (s: string) => s.trim();
  if (trimSeq(tpl.inputSequence)) stop.add(trimSeq(tpl.inputSequence));
  if (trimSeq(tpl.systemSequence) && !tpl.systemSameAsUser) stop.add(trimSeq(tpl.systemSequence));
  if (opts.impersonate) {
    if (trimSeq(tpl.outputSequence)) stop.add(trimSeq(tpl.outputSequence));
    stop.add(`\n${opts.nextName}:`);
  } else stop.add(`\n${opts.userName}:`);
  return { prompt: out, stop: [...stop].filter(Boolean) };
}
