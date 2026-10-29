import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore, upsert, updateSettings, removeItem, toast, toastError, getState, connectionFor } from '../../lib/store';
import { PageHead, Switch, RangeField, Check, Tabs, Modal, Field, openMenu, promptDialog, confirmDialog, useSortable, CodeEditor } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newPreset, MARKER_LABELS, defaultPromptBlocks, DEFAULT_UTILITY } from '../../lib/defaults';
import type { Preset, PromptBlock, Role, Samplers, InstructTemplate } from '../../lib/types';
import { previewPrompt, requireConnection } from '../../lib/generate';
import { CATEGORY_META, samplersToParams, toWireMessages, type Category, type BuiltPrompt } from '../../lib/promptBuilder';
import { exportPreset, importPresetsInteractive } from '../../lib/appActions';
import { fmtNum, moveItem, uid, copyText } from '../../lib/utils';
import { generateOnce } from '../../lib/api';
import { MACRO_HELP } from '../../lib/macros';
import { useTokenizer } from '../../lib/tokenizer';
import { t, tn } from '../../lib/i18n';

const ROLE_LABEL: Record<string, string> = { system: 'SYSTEM', user: 'USER', assistant: 'ASSIST.', history: t('HISTORY') };

function whereLabel(b: PromptBlock, idx: number, blocks: PromptBlock[], built: BuiltPrompt | null): string {
  const histIdx = blocks.findIndex((x) => x.marker === 'chatHistory');
  if (b.marker === 'chatHistory') return built ? t('last {historyIncluded} {x}', { historyIncluded: built.historyIncluded, x: tn(built.historyIncluded, 'message|messages') }) : t('chat messages');
  if (b.marker === 'worldInfoBefore' || b.marker === 'worldInfoAfter') {
    const n = built?.wi.activated.filter((e) => e.position === (b.marker === 'worldInfoBefore' ? 0 : 1)).length ?? 0;
    return built ? `${n} ${tn(n, 'entry triggered|entries triggered')}` : MARKER_LABELS[b.marker];
  }
  if (b.marker === 'memoryBook') {
    const chat = getState().chat;
    const ch = chat?.meta.memory.chapters.filter((c) => c.status === 'memory').length ?? 0;
    const f = chat?.meta.memory.facts.filter((x) => x.enabled).length ?? 0;
    return chat ? `${ch} ${tn(ch, 'chapter|chapters')} + ${f} ${tn(f, 'fact|facts')}` : MARKER_LABELS.memoryBook;
  }
  if (b.marker) return MARKER_LABELS[b.marker] || t('marker');
  if (b.id === 'prefill') return t('after everything');
  if (b.position === 'depth') return t('at depth {depth}', { depth: b.depth });
  if (idx === 0) return t('at the start');
  if (histIdx !== -1 && idx > histIdx) return t('at the end');
  return t('before the history');
}

function BlockEditor({ block, onSave, onDelete, onClose }: { block: PromptBlock; onSave: (b: PromptBlock) => void; onDelete?: () => void; onClose: () => void }) {
  const [b, setB] = useState(block);
  return (
    <Modal
      title={b.name ? t(b.name) : t('Block')}
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <button type="button" className="cs-btn cs-btn--danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
              {t('Delete the block')}
            </button>
          ) : null}
          <button type="button" className="cs-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={() => {
              onSave(b);
              onClose();
            }}
          >
            {t('Save')}
          </button>
        </>
      }
    >
      <div className="cs-grid-fields">
        <Field label={t('Title')}>
          <input className="cs-input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
        </Field>
        <Field label={t('Role')}>
          <select className="cs-select" value={b.role} onChange={(e) => setB({ ...b, role: e.target.value as Role })}>
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
          </select>
        </Field>
        {!b.marker && b.id !== 'prefill' ? (
          <Field label={t('Placement')}>
            <select className="cs-select" value={b.position} onChange={(e) => setB({ ...b, position: e.target.value as PromptBlock['position'] })}>
              <option value="relative">{t('In block order')}</option>
              <option value="depth">{t('Into the history, at depth')}</option>
            </select>
          </Field>
        ) : null}
        {b.position === 'depth' && !b.marker ? (
          <>
            <Field label={t('Depth')}>
              <input className="cs-input" type="number" min={0} value={b.depth} onChange={(e) => setB({ ...b, depth: Math.max(0, Number(e.target.value)) })} />
            </Field>
            <Field label={t('Order at depth')}>
              <input className="cs-input" type="number" value={b.order} onChange={(e) => setB({ ...b, order: Number(e.target.value) })} />
            </Field>
          </>
        ) : null}
      </div>
      {b.marker ? (
        <p className="cs-hint">
          {t('This is a marker: its content is filled in automatically ({MARKER_LABELS}). Here you can change its order, role and name.', { MARKER_LABELS: MARKER_LABELS[b.marker] })}
        </p>
      ) : (
        <>
          <Field label={b.id === 'prefill' ? t("Start of the model's reply") : t('Block text')}>
            <textarea className="cs-textarea cs-textarea--lg" rows={9} value={b.content} onChange={(e) => setB({ ...b, content: e.target.value })} />
          </Field>
          <details className="cs-details">
            <summary>{t('Macros')}</summary>
            <div className="cs-col" style={{ gap: 4 }}>
              {MACRO_HELP.map((m) => (
                <div key={m.name} style={{ fontSize: 13 }}>
                  <code className="cs-mono" style={{ fontSize: 12 }}>
                    {m.name}
                  </code>{' '}
                  — {m.desc}
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </Modal>
  );
}

function SamplersPanel({ p, set }: { p: Preset; set: (patch: Partial<Preset>) => void }) {
  const s = p.samplers;
  const ss = (patch: Partial<Samplers>) => set({ samplers: { ...s, ...patch } });
  const instruct = useStore((st) => st.instruct);
  const conn = useStore((st) => connectionFor('chat', st));
  const isText = conn?.api === 'textcompletion' || conn?.mode === 'text';
  return (
    <>
      <div className="cs-samplers">
        <RangeField label={t('Temperature')} value={s.temperature} min={0} max={2} step={0.05} onChange={(temperature) => ss({ temperature })} />
        <RangeField label="Top P" value={s.topP} min={0} max={1} step={0.01} onChange={(topP) => ss({ topP })} />
        <RangeField label={t('Repetition penalty')} value={s.repetitionPenalty} min={1} max={2} step={0.01} onChange={(repetitionPenalty) => ss({ repetitionPenalty })} />
        <RangeField label={t('Response length')} value={s.maxTokens} min={50} max={8000} step={10} onChange={(maxTokens) => ss({ maxTokens })} format={(v) => fmtNum(v)} />
        <RangeField label={t('Context')} value={s.contextSize} min={2048} max={262144} step={1024} onChange={(contextSize) => ss({ contextSize })} format={(v) => fmtNum(v)} />
        <Check checked={s.stream} onChange={(stream) => ss({ stream })}>
          {t('Stream the reply')}
        </Check>
      </div>
      <details className="cs-details">
        <summary>{t('More samplers')}</summary>
        <div className="cs-samplers" style={{ padding: 0, background: 'transparent' }}>
          <RangeField label={t('Top K (0 means off)')} value={s.topK} min={0} max={200} onChange={(topK) => ss({ topK })} />
          <RangeField label="Min P" value={s.minP} min={0} max={1} step={0.01} onChange={(minP) => ss({ minP })} />
          <RangeField label="Top A" value={s.topA} min={0} max={1} step={0.01} onChange={(topA) => ss({ topA })} />
          <RangeField label="Typical P" value={s.typicalP} min={0} max={1} step={0.01} onChange={(typicalP) => ss({ typicalP })} />
          <RangeField label={t('Frequency penalty')} value={s.frequencyPenalty} min={-2} max={2} step={0.01} onChange={(frequencyPenalty) => ss({ frequencyPenalty })} />
          <RangeField label={t('Presence penalty')} value={s.presencePenalty} min={-2} max={2} step={0.01} onChange={(presencePenalty) => ss({ presencePenalty })} />
          <RangeField label={t('Penalty range, tok.')} value={s.repPenRange} min={0} max={8192} step={64} onChange={(repPenRange) => ss({ repPenRange })} />
          <RangeField label={t('DRY multiplier')} value={s.dryMultiplier} min={0} max={2} step={0.05} onChange={(dryMultiplier) => ss({ dryMultiplier })} />
          <RangeField label={t('XTC probability')} value={s.xtcProbability} min={0} max={1} step={0.01} onChange={(xtcProbability) => ss({ xtcProbability })} />
          <RangeField label={t('Thinking budget, tok.')} value={s.thinkingBudget} min={0} max={32000} step={256} onChange={(thinkingBudget) => ss({ thinkingBudget })} />
          <Field label={t('Seed (-1 means random)')} honey>
            <input className="cs-input" type="number" value={s.seed} onChange={(e) => ss({ seed: Number(e.target.value) })} />
          </Field>
          <Field label={t('Reasoning effort')} honey>
            <select className="cs-select" value={s.reasoningEffort} onChange={(e) => ss({ reasoningEffort: e.target.value as Samplers['reasoningEffort'] })}>
              <option value="">{t('default')}</option>
              <option value="low">{t('low')}</option>
              <option value="medium">{t('medium')}</option>
              <option value="high">{t('high')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('Stop strings · one per line')} honey>
          <textarea className="cs-textarea cs-textarea--mono" rows={3} value={s.stop.join('\n')} onChange={(e) => ss({ stop: e.target.value.split('\n').filter((x) => x !== '') })} />
        </Field>
        <Field label="Logit bias · JSON {token_id: bias}" honey>
          <textarea className="cs-textarea cs-textarea--mono" rows={2} value={s.logitBias} placeholder='{"50256": -100}' onChange={(e) => ss({ logitBias: e.target.value })} />
        </Field>
      </details>
      <details className="cs-details">
        <summary>{t('Utility prompts')}</summary>
        <div className="cs-col" style={{ gap: 12 }}>
          {(
            [
              ['impersonation', t('Impersonate (a line for the player)')],
              ['continueNudge', t('Reply continuation')],
              ['newChat', t('Chat start')],
              ['newGroupChat', t('Group chat start')],
              ['newExampleChat', t('Dialogue example header')],
              ['groupNudge', t('Group nudge')],
              ['personalityFormat', t('Personality format')],
              ['scenarioFormat', t('Scenario format')],
              ['wiFormat', t('Lorebook format ({0} is the entries)')],
              ['sendIfEmpty', t('If an empty message is sent')],
            ] as [keyof Preset['utility'], string][]
          ).map(([k, label]) => (
            <Field key={k} label={label} honey>
              <textarea className="cs-textarea" rows={2} value={p.utility[k]} onChange={(e) => set({ utility: { ...p.utility, [k]: e.target.value } })} />
            </Field>
          ))}
          <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ utility: { ...DEFAULT_UTILITY } })}>
            {t('Restore the defaults')}
          </button>
        </div>
      </details>
      <details className="cs-details">
        <summary>{t('Formatting and reasoning')}</summary>
        <div className="cs-col" style={{ gap: 12 }}>
          <Field label={t('Names in messages')} honey>
            <select className="cs-select" value={p.namesBehavior} onChange={(e) => set({ namesBehavior: e.target.value as Preset['namesBehavior'] })}>
              <option value="default">{t('Only in groups')}</option>
              <option value="content">{t('Always “Name: text”')}</option>
              <option value="none">{t('Never')}</option>
            </select>
          </Field>
          <Check checked={p.squashSystem} onChange={(squashSystem) => set({ squashSystem })}>
            {t('Merge consecutive system messages')}
          </Check>
          <Check checked={p.reasoning.autoParse} onChange={(autoParse) => set({ reasoning: { ...p.reasoning, autoParse } })}>
            {t("Separate the model's reasoning from the text")}
          </Check>
          <div className="cs-grid-fields cs-grid-fields--sm">
            <Field label={t('Reasoning start')} honey>
              <input className="cs-input cs-input--mono" value={p.reasoning.prefix} onChange={(e) => set({ reasoning: { ...p.reasoning, prefix: e.target.value } })} />
            </Field>
            <Field label={t('Reasoning end')} honey>
              <input className="cs-input cs-input--mono" value={p.reasoning.suffix} onChange={(e) => set({ reasoning: { ...p.reasoning, suffix: e.target.value } })} />
            </Field>
          </div>
          <Check checked={p.reasoning.addToPrompt} onChange={(addToPrompt) => set({ reasoning: { ...p.reasoning, addToPrompt } })}>
            {t('Send past reasoning back to the model')}
          </Check>
        </div>
      </details>
      <InstructPanel p={p} set={set} instruct={instruct} active={isText} />
    </>
  );
}

function InstructPanel({ p, set, instruct, active }: { p: Preset; set: (patch: Partial<Preset>) => void; instruct: InstructTemplate[]; active: boolean }) {
  const tpl = instruct.find((x) => x.id === p.instructId) || instruct[0];
  const setT = (patch: Partial<InstructTemplate>) => tpl && !tpl.builtin && upsert('instruct', { ...tpl, ...patch });
  const fields: [keyof InstructTemplate, string][] = [
    ['systemSequence', t('System start')],
    ['systemSuffix', t('System end')],
    ['inputSequence', t('Player line start')],
    ['inputSuffix', t('Player line end')],
    ['outputSequence', t("Start of the model's reply")],
    ['outputSuffix', t('Model reply end')],
    ['firstOutputSequence', t('First reply (opt.)')],
    ['lastOutputSequence', t('Last reply (opt.)')],
    ['storyStringPrefix', t('Prefix of the whole prompt')],
    ['stopSequence', t('Stop string')],
  ];
  return (
    <details className="cs-details" open={active}>
      <summary>{t('Text Completion · instruct template')}{active ? t(' · in use') : ''}</summary>
      <div className="cs-row cs-row--wrap" style={{ marginBottom: 10 }}>
        <select className="cs-select cs-grow" value={p.instructId} onChange={(e) => set({ instructId: e.target.value })} aria-label={t('Template')}>
          {instruct.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.builtin ? '' : t(' · custom')}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="cs-btn cs-btn--sm"
          onClick={() => {
            const copy = upsert('instruct', { ...structuredClone(tpl), id: uid(), name: t('{name} (custom)', { name: tpl.name }), builtin: false });
            set({ instructId: copy.id });
          }}
        >
          {t('Duplicate')}
        </button>
      </div>
      {tpl?.builtin ? <p className="cs-hint">{t('A built-in template. Make a copy to edit it.')}</p> : null}
      <div className="cs-grid-fields">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} honey>
            <input className="cs-input cs-input--mono" value={String(tpl?.[k] ?? '').replace(/\n/g, '\\n')} disabled={tpl?.builtin} onChange={(e) => setT({ [k]: e.target.value.replace(/\\n/g, '\n') } as Partial<InstructTemplate>)} />
          </Field>
        ))}
      </div>
      <div className="cs-row cs-row--wrap" style={{ marginTop: 8 }}>
        <Check checked={!!tpl?.wrap} onChange={(wrap) => setT({ wrap })}>
          {t('Line break after the markers')}
        </Check>
        <Check checked={!!tpl?.systemSameAsUser} onChange={(systemSameAsUser) => setT({ systemSameAsUser })}>
          {t('System as a player line')}
        </Check>
        <select className="cs-select cs-select--sm" value={tpl?.namesBehavior} disabled={tpl?.builtin} onChange={(e) => setT({ namesBehavior: e.target.value as InstructTemplate['namesBehavior'] })} aria-label={t('Names')}>
          <option value="force">{t('Names in groups')}</option>
          <option value="always">{t('Names always')}</option>
          <option value="none">{t('No names')}</option>
        </select>
      </div>
    </details>
  );
}

function PromptPreview({ built }: { built: BuiltPrompt | null }) {
  const [tab, setTab] = useState<'messages' | 'json'>('messages');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dry, setDry] = useState<{ text: string; ms: number } | null>(null);
  const [running, setRunning] = useState(false);
  const persona = useStore((s) => s.personas.find((p) => p.id === s.settings.activePersonaId));
  const conn = useStore((s) => connectionFor('chat', s));
  const preset = useStore((s) => s.presets.find((p) => p.id === s.settings.activePresetId));
  const ref = useRef<HTMLElement>(null);
  const param = useStore((s) => s.routeParam);
  useEffect(() => {
    if (param === 'preview') ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [param]);

  const json = useMemo(() => {
    if (!built || !preset) return '';
    const params = samplersToParams(preset, built.stop);
    return JSON.stringify(
      {
        model: conn?.model || t('[model]'),
        ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== 0 && !(Array.isArray(v) && !v.length))),
        stream: preset.samplers.stream,
        ...(built.mode === 'text' ? { prompt: built.text } : { messages: built.messages.map((m) => ({ role: m.role, content: m.content })) }),
      },
      null,
      2,
    );
  }, [built, preset, conn]);

  const highlightNames = (text: string) => {
    const names = [persona?.name, built?.env.char].filter(Boolean) as string[];
    if (!names.length) return text;
    const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return text.split(re).map((part, i) => (names.includes(part) ? <mark key={i}>{part}</mark> : part));
  };

  const total = built ? Object.values(built.breakdown).reduce((a, b) => a + b, 0) : 0;

  return (
    <section ref={ref} aria-label={t('What goes to the model')} className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '1 1 460px', minWidth: 0 }}>
      <div className="cs-panel-head">
        <span style={{ display: 'flex', color: 'var(--cs-accent)' }}>
          <Icon name="eye" size={22} />
        </span>
        <h2 className="cs-h2" style={{ fontSize: 19 }}>
          {t('What goes to the model')}
        </h2>
        <div className="cs-ml-auto">
          <Tabs
            label={t('Request view')}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'messages', label: t('Messages') },
              { id: 'json', label: t('Raw JSON') },
            ]}
          />
        </div>
      </div>
      {!built ? (
        <p className="cs-hint">{t('Open a chat with a character: the exact request that will go to the model shows up here.')}</p>
      ) : (
        <>
          <div>
            <div className="cs-token-bar">
              {(Object.keys(CATEGORY_META) as Category[]).map((k) =>
                built.breakdown[k] ? <div key={k} style={{ flex: built.breakdown[k], background: CATEGORY_META[k].color }} title={`${CATEGORY_META[k].label}: ${built.breakdown[k]}`} /> : null,
              )}
            </div>
            <div className="cs-token-legend">
              {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
                <span key={k}>
                  <i style={{ background: CATEGORY_META[k].color }} />
                  {CATEGORY_META[k].label} {fmtNum(built.breakdown[k])}
                </span>
              ))}
            </div>
            <div className="cs-hint" style={{ marginTop: 6 }}>
              {t('Total {total} of {contextSize} · reply up to {maxTokens} · history {historyIncluded}/{historyTotal}{x}', { total: fmtNum(total), contextSize: fmtNum(built.contextSize), maxTokens: fmtNum(built.maxTokens), historyIncluded: built.historyIncluded, historyTotal: built.historyTotal, x: built.mode === 'text' ? ' · Text Completion' : '' })}
            </div>
            {built.warnings.map((w) => (
              <p key={w} className="cs-hint" style={{ color: 'var(--cs-rose-deep)' }}>
                {w}
              </p>
            ))}
          </div>
          {tab === 'messages' ? (
            <ol className="cs-preview-list">
              {built.messages.map((m, i) => {
                const label = m.source === 'history' ? (m.role === 'user' ? 'USER' : m.role === 'assistant' ? 'ASSIST.' : 'SYSTEM') : m.source === 'prefill' ? 'PREFILL' : `${ROLE_LABEL[m.role]}`;
                const injected = ['authorNote', 'wi-depth', 'persona-depth', 'char-depth'].includes(m.source) || (m.source !== 'history' && built.messages.slice(0, i).some((x) => x.source === 'history') && built.messages.slice(i + 1).some((x) => x.source === 'history'));
                return (
                  <li key={i}>
                    <span className={`cs-role cs-role--${m.role}`}>{injected && m.role === 'system' ? 'SYS ↓' : label}</span>
                    <span
                      className={`cs-preview-list__text${expanded.has(i) ? '' : ' is-clamped'}`}
                      onClick={() => {
                        const n = new Set(expanded);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        setExpanded(n);
                      }}
                    >
                      {highlightNames(m.content)}
                    </span>
                    <span className="cs-mono" style={{ fontSize: 11, color: 'var(--cs-muted)', flex: 'none' }}>
                      {m.tokens}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <CodeEditor value={json} lang="json" readOnly minHeight={300} label={t('Raw request')} />
          )}
          {dry ? (
            <div className="cs-honey-box">
              <span className="cs-label cs-label--honey">{t('Test reply · {x} s', { x: (dry.ms / 1000).toFixed(1) })}</span>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{dry.text}</p>
            </div>
          ) : null}
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--flex" onClick={() => copyText(json).then(() => toast(t('Request copied')))}>
              {t('Copy the request')}
            </button>
            <button
              type="button"
              className="cs-btn cs-btn--primary cs-btn--flex"
              disabled={running}
              onClick={async () => {
                try {
                  const c = requireConnection('chat');
                  setRunning(true);
                  const started = Date.now();
                  const r = await generateOnce({
                    connectionId: c.id,
                    label: t('Dry run'),
                    mode: built.mode,
                    messages: built.mode === 'chat' ? await toWireMessages(built.messages) : undefined,
                    prompt: built.text,
                    params: samplersToParams(preset!, built.stop),
                  });
                  setDry({ text: r.text || t('(empty reply)'), ms: Date.now() - started });
                } catch (err) {
                  if ((err as Error).message !== 'no-connection') toastError(err, t('Dry run'));
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? <span className="cs-spinner" /> : null}
              {t('Dry run')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function PresetsPage() {
  const presets = useStore((s) => s.presets);
  const activeId = useStore((s) => s.settings.activePresetId);
  const chat = useStore((s) => s.chat);
  useTokenizer((s) => s.version);
  const p = presets.find((x) => x.id === activeId) || presets[0];
  const [editing, setEditing] = useState<PromptBlock | null>(null);
  const set = (patch: Partial<Preset>) => p && upsert('presets', { ...p, ...patch });

  const built = useMemo(() => (p && chat ? previewPrompt() : null), [p, chat]);
  const blockTokens = (b: PromptBlock) => {
    if (!built) return null;
    if (b.marker === 'chatHistory') return built.breakdown.history;
    const n = built.messages.filter((m) => m.source === b.id).reduce((a, m) => a + m.tokens, 0);
    return n;
  };
  const sortable = useSortable(p?.prompts.length || 0, (from, to) => p && set({ prompts: moveItem(p.prompts, from, to) }));
  if (!p) return null;
  const enabledTotal = built ? built.totalTokens : 0;

  return (
    <div className="cs-page">
      <PageHead title={t('Presets')} kana="プリセット" sub={t('Prompt order, samplers and request preview')}>
        <label className="cs-inline-field">
          {t('Preset')}
          <select className="cs-select cs-select--pill" style={{ minWidth: 190 }} value={p.id} onChange={(e) => updateSettings({ activePresetId: e.target.value })}>
            {presets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="cs-row cs-row--wrap">
          <button type="button" className="cs-btn" onClick={importPresetsInteractive}>
            {t('Import')}
          </button>
          <button type="button" className="cs-btn" onClick={() => exportPreset(p.id)}>
            {t('Export')}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={async () => {
              const name = await promptDialog(t('Save as a new preset'), { value: t('{name} (copy)', { name: p.name }) });
              if (!name) return;
              const copy = upsert('presets', { ...structuredClone(p), id: uid(), name });
              updateSettings({ activePresetId: copy.id });
              toast(t('Preset “{name}” saved', { name }));
            }}
          >
            {t('Save as…')}
          </button>
          <button
            type="button"
            className="cs-icon-btn"
            aria-label={t('More')}
            onClick={(e) =>
              openMenu(e.currentTarget, [
                {
                  label: t('Rename'),
                  icon: 'edit',
                  onClick: async () => {
                    const name = await promptDialog(t('Preset name'), { value: p.name });
                    if (name) set({ name });
                  },
                },
                { label: t('New empty preset'), icon: 'plus', onClick: () => updateSettings({ activePresetId: upsert('presets', newPreset({ name: t('New preset') })).id }) },
                {
                  label: t('Reset blocks to the defaults'),
                  icon: 'undo',
                  onClick: async () => {
                    if (await confirmDialog(t('Bring back the default set of blocks? Your own blocks will be lost.'), { ok: t('Reset') })) set({ prompts: defaultPromptBlocks() });
                  },
                },
                { separator: true, label: '' },
                {
                  label: t('Delete the preset'),
                  icon: 'trash',
                  danger: true,
                  hidden: presets.length < 2,
                  onClick: async () => {
                    if (!(await confirmDialog(t('Delete the preset “{name}”?', { name: p.name }), { ok: t('Delete') }))) return;
                    await removeItem('presets', p.id);
                    updateSettings({ activePresetId: presets.find((x) => x.id !== p.id)!.id });
                  },
                },
              ])
            }
          >
            <Icon name="more" size={20} />
          </button>
        </div>
      </PageHead>

      <div className="cs-columns">
        <section aria-label={t('Prompt manager')} className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div className="cs-panel-head">
            <h2 className="cs-h2" style={{ fontSize: 19 }}>
              {t('Prompt manager')}
            </h2>
            <span className="cs-pill cs-pill--mono">{fmtNum(enabledTotal)} {t('tok.')}</span>
            <button
              type="button"
              className="cs-btn cs-btn--mint cs-btn--sm cs-ml-auto"
              onClick={() =>
                setEditing({ id: uid(), name: t('New block'), role: 'system', content: '', enabled: true, position: 'relative', depth: 4, order: 100 })
              }
            >
              <Icon name="plus" size={16} stroke={2.2} />
              {t('Block')}
            </button>
          </div>
          <div className="cs-hint">{t("Drag blocks to change the order. Blocks that are off don't go to the model.")}</div>
          <div className="cs-col" style={{ gap: 8 }} ref={sortable.container as RefObject<HTMLDivElement>}>
            {p.prompts.map((b, i) => {
              const tokens = blockTokens(b);
              const roleKey = b.marker === 'chatHistory' ? 'history' : b.role;
              return (
                <div
                  key={b.id}
                  data-sort-row
                  className={`cs-prompt-row${b.enabled ? '' : ' cs-prompt-row--off'}${sortable.drag?.from === i ? ' cs-prompt-row--drag' : ''}${sortable.drag && sortable.drag.over === i && sortable.drag.from !== i ? ' cs-prompt-row--over' : ''}`}
                >
                  <span className="cs-grip" aria-label={t('Drag')} {...sortable.handleProps(i)}>
                    <Icon name="grip" size={18} />
                  </span>
                  <span className={`cs-role cs-role--${roleKey}`}>{ROLE_LABEL[roleKey]}</span>
                  <div className="cs-grow">
                    <div className="cs-ellipsis" style={{ fontWeight: 800, fontSize: 14 }}>
                      {/* Built-in block names are English keys with a translation. */}
                      {t(b.name)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--cs-muted)' }}>{whereLabel(b, i, p.prompts, built)}</div>
                  </div>
                  <span className="cs-mono" style={{ fontSize: 12, color: 'var(--cs-muted)' }}>
                    {tokens === null ? '' : fmtNum(tokens)}
                  </span>
                  <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label={t('Edit the block')} onClick={() => setEditing(b)}>
                    <Icon name="edit" size={16} stroke={2} />
                  </button>
                  <Switch checked={b.enabled} label={b.enabled ? t('Turn the block off') : t('Turn the block on')} onChange={(enabled) => set({ prompts: p.prompts.map((x) => (x.id === b.id ? { ...x, enabled } : x)) })} />
                </div>
              );
            })}
          </div>
          <SamplersPanel p={p} set={set} />
        </section>
        <PromptPreview built={built} />
      </div>

      {editing ? (
        <BlockEditor
          block={editing}
          onClose={() => setEditing(null)}
          onDelete={
            p.prompts.some((x) => x.id === editing.id) && !editing.builtin
              ? () => {
                  set({ prompts: p.prompts.filter((x) => x.id !== editing.id) });
                  setEditing(null);
                }
              : undefined
          }
          onSave={(b) => {
            if (p.prompts.some((x) => x.id === b.id)) set({ prompts: p.prompts.map((x) => (x.id === b.id ? b : x)) });
            else {
              const prefillIdx = p.prompts.findIndex((x) => x.id === 'prefill');
              const list = p.prompts.slice();
              list.splice(prefillIdx === -1 ? list.length : prefillIdx, 0, b);
              set({ prompts: list });
            }
          }}
        />
      ) : null}
    </div>
  );
}
