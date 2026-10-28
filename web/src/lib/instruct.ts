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
  t: InstructTemplate,
  opts: { nextName: string; prefill?: string; isGroup?: boolean; impersonate?: boolean; userName: string },
): { prompt: string; stop: string[] } {
  const nl = t.wrap ? '\n' : '';
  const useNames = t.namesBehavior === 'always' || (t.namesBehavior === 'force' && opts.isGroup);
  let out = t.storyStringPrefix || '';
  let firstOutput = true;

  for (const m of messages) {
    let seq: string;
    let suffix: string;
    if (m.role === 'system') {
      if (t.systemSameAsUser || !t.systemSequence) {
        seq = t.systemSameAsUser ? t.inputSequence : t.systemSequence;
        suffix = t.systemSameAsUser ? t.inputSuffix : t.systemSuffix;
      } else {
        seq = t.systemSequence;
        suffix = t.systemSuffix;
      }
    } else if (m.role === 'user') {
      seq = t.inputSequence;
      suffix = t.inputSuffix;
    } else {
      seq = firstOutput && t.firstOutputSequence ? t.firstOutputSequence : t.outputSequence;
      suffix = t.outputSuffix;
      firstOutput = false;
    }
    const name = useNames && m.name && m.role !== 'system' ? `${m.name}: ` : '';
    out += `${seq}${seq ? nl : ''}${name}${m.content}${suffix || (t.wrap ? '\n' : '')}`;
  }

  if (opts.impersonate) {
    out += `${t.inputSequence}${t.inputSequence ? nl : ''}${useNames ? `${opts.userName}:` : ''}`;
  } else {
    const last = t.lastOutputSequence || t.outputSequence;
    out += `${last}${last ? nl : ''}${useNames ? `${opts.nextName}:` : ''}`;
    if (opts.prefill) out += `${useNames ? ' ' : ''}${opts.prefill}`;
  }

  const stop = new Set<string>();
  if (t.stopSequence) stop.add(t.stopSequence);
  const trimSeq = (s: string) => s.trim();
  if (trimSeq(t.inputSequence)) stop.add(trimSeq(t.inputSequence));
  if (trimSeq(t.systemSequence) && !t.systemSameAsUser) stop.add(trimSeq(t.systemSequence));
  if (opts.impersonate) {
    if (trimSeq(t.outputSequence)) stop.add(trimSeq(t.outputSequence));
    stop.add(`\n${opts.nextName}:`);
  } else stop.add(`\n${opts.userName}:`);
  return { prompt: out, stop: [...stop].filter(Boolean) };
}
