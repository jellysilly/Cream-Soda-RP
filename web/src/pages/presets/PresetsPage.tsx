import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore, upsert, updateSettings, removeItem, toast, toastError, getState, connectionFor } from '../../lib/store';
import { PageHead, Switch, RangeField, Check, Tabs, Modal, Field, openMenu, promptDialog, confirmDialog, useSortable, CodeEditor } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newPreset, MARKER_LABELS, defaultPromptBlocks, DEFAULT_UTILITY } from '../../lib/defaults';
import type { Preset, PromptBlock, Role, Samplers, InstructTemplate } from '../../lib/types';
import { previewPrompt, requireConnection } from '../../lib/generate';
import { CATEGORY_META, samplersToParams, toWireMessages, type Category, type BuiltPrompt } from '../../lib/promptBuilder';
import { exportPreset, importPresetsInteractive } from '../../lib/appActions';
import { fmtNum, moveItem, uid, copyText, plural } from '../../lib/utils';
import { generateOnce } from '../../lib/api';
import { MACRO_HELP } from '../../lib/macros';
import { useTokenizer } from '../../lib/tokenizer';

const ROLE_LABEL: Record<string, string> = { system: 'SYSTEM', user: 'USER', assistant: 'ASSIST.', history: 'ИСТОРИЯ' };

function whereLabel(b: PromptBlock, idx: number, blocks: PromptBlock[], built: BuiltPrompt | null): string {
  const histIdx = blocks.findIndex((x) => x.marker === 'chatHistory');
  if (b.marker === 'chatHistory') return built ? `последние ${built.historyIncluded} ${plural(built.historyIncluded, 'сообщение', 'сообщения', 'сообщений')}` : 'сообщения чата';
  if (b.marker === 'worldInfoBefore' || b.marker === 'worldInfoAfter') {
    const n = built?.wi.activated.filter((e) => e.position === (b.marker === 'worldInfoBefore' ? 0 : 1)).length ?? 0;
    return built ? `${n} ${plural(n, 'запись сработала', 'записи сработали', 'записей сработало')}` : MARKER_LABELS[b.marker];
  }
  if (b.marker === 'memoryBook') {
    const chat = getState().chat;
    const ch = chat?.meta.memory.chapters.filter((c) => c.status === 'memory').length ?? 0;
    const f = chat?.meta.memory.facts.filter((x) => x.enabled).length ?? 0;
    return chat ? `${ch} ${plural(ch, 'глава', 'главы', 'глав')} + ${f} ${plural(f, 'факт', 'факта', 'фактов')}` : MARKER_LABELS.memoryBook;
  }
  if (b.marker) return MARKER_LABELS[b.marker] || 'маркер';
  if (b.id === 'prefill') return 'после всего';
  if (b.position === 'depth') return `на глубине ${b.depth}`;
  if (idx === 0) return 'в начале';
  if (histIdx !== -1 && idx > histIdx) return 'в конце';
  return 'перед историей';
}

function BlockEditor({ block, onSave, onDelete, onClose }: { block: PromptBlock; onSave: (b: PromptBlock) => void; onDelete?: () => void; onClose: () => void }) {
  const [b, setB] = useState(block);
  return (
    <Modal
      title={b.name || 'Блок'}
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <button type="button" className="cs-btn cs-btn--danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
              Удалить блок
            </button>
          ) : null}
          <button type="button" className="cs-btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={() => {
              onSave(b);
              onClose();
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="cs-grid-fields">
        <Field label="Название">
          <input className="cs-input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
        </Field>
        <Field label="Роль">
          <select className="cs-select" value={b.role} onChange={(e) => setB({ ...b, role: e.target.value as Role })}>
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
          </select>
        </Field>
        {!b.marker && b.id !== 'prefill' ? (
          <Field label="Размещение">
            <select className="cs-select" value={b.position} onChange={(e) => setB({ ...b, position: e.target.value as PromptBlock['position'] })}>
              <option value="relative">По порядку блоков</option>
              <option value="depth">В историю, на глубину</option>
            </select>
          </Field>
        ) : null}
        {b.position === 'depth' && !b.marker ? (
          <>
            <Field label="Глубина">
              <input className="cs-input" type="number" min={0} value={b.depth} onChange={(e) => setB({ ...b, depth: Math.max(0, Number(e.target.value)) })} />
            </Field>
            <Field label="Порядок на глубине">
              <input className="cs-input" type="number" value={b.order} onChange={(e) => setB({ ...b, order: Number(e.target.value) })} />
            </Field>
          </>
        ) : null}
      </div>
      {b.marker ? (
        <p className="cs-hint">
          Это маркер: его содержимое подставляется автоматически ({MARKER_LABELS[b.marker]}). Здесь можно поменять порядок, роль и название.
        </p>
      ) : (
        <>
          <Field label={b.id === 'prefill' ? 'Начало ответа модели' : 'Текст блока'}>
            <textarea className="cs-textarea cs-textarea--lg" rows={9} value={b.content} onChange={(e) => setB({ ...b, content: e.target.value })} />
          </Field>
          <details className="cs-details">
            <summary>Макросы</summary>
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
        <RangeField label="Температура" value={s.temperature} min={0} max={2} step={0.05} onChange={(temperature) => ss({ temperature })} />
        <RangeField label="Top P" value={s.topP} min={0} max={1} step={0.01} onChange={(topP) => ss({ topP })} />
        <RangeField label="Штраф за повтор" value={s.repetitionPenalty} min={1} max={2} step={0.01} onChange={(repetitionPenalty) => ss({ repetitionPenalty })} />
        <RangeField label="Длина ответа" value={s.maxTokens} min={50} max={8000} step={10} onChange={(maxTokens) => ss({ maxTokens })} format={(v) => fmtNum(v)} />
        <RangeField label="Контекст" value={s.contextSize} min={2048} max={262144} step={1024} onChange={(contextSize) => ss({ contextSize })} format={(v) => fmtNum(v)} />
        <Check checked={s.stream} onChange={(stream) => ss({ stream })}>
          Стриминг ответа
        </Check>
      </div>
      <details className="cs-details">
        <summary>Ещё сэмплеры</summary>
        <div className="cs-samplers" style={{ padding: 0, background: 'transparent' }}>
          <RangeField label="Top K (0 — выкл.)" value={s.topK} min={0} max={200} onChange={(topK) => ss({ topK })} />
          <RangeField label="Min P" value={s.minP} min={0} max={1} step={0.01} onChange={(minP) => ss({ minP })} />
          <RangeField label="Top A" value={s.topA} min={0} max={1} step={0.01} onChange={(topA) => ss({ topA })} />
          <RangeField label="Typical P" value={s.typicalP} min={0} max={1} step={0.01} onChange={(typicalP) => ss({ typicalP })} />
          <RangeField label="Штраф частоты" value={s.frequencyPenalty} min={-2} max={2} step={0.01} onChange={(frequencyPenalty) => ss({ frequencyPenalty })} />
          <RangeField label="Штраф присутствия" value={s.presencePenalty} min={-2} max={2} step={0.01} onChange={(presencePenalty) => ss({ presencePenalty })} />
          <RangeField label="Окно штрафа, ток." value={s.repPenRange} min={0} max={8192} step={64} onChange={(repPenRange) => ss({ repPenRange })} />
          <RangeField label="DRY множитель" value={s.dryMultiplier} min={0} max={2} step={0.05} onChange={(dryMultiplier) => ss({ dryMultiplier })} />
          <RangeField label="XTC вероятность" value={s.xtcProbability} min={0} max={1} step={0.01} onChange={(xtcProbability) => ss({ xtcProbability })} />
          <RangeField label="Бюджет размышлений, ток." value={s.thinkingBudget} min={0} max={32000} step={256} onChange={(thinkingBudget) => ss({ thinkingBudget })} />
          <Field label="Seed (-1 — случайный)" honey>
            <input className="cs-input" type="number" value={s.seed} onChange={(e) => ss({ seed: Number(e.target.value) })} />
          </Field>
          <Field label="Усилие рассуждения" honey>
            <select className="cs-select" value={s.reasoningEffort} onChange={(e) => ss({ reasoningEffort: e.target.value as Samplers['reasoningEffort'] })}>
              <option value="">по умолчанию</option>
              <option value="low">низкое</option>
              <option value="medium">среднее</option>
              <option value="high">высокое</option>
            </select>
          </Field>
        </div>
        <Field label="Стоп-строки · по одной на строку" honey>
          <textarea className="cs-textarea cs-textarea--mono" rows={3} value={s.stop.join('\n')} onChange={(e) => ss({ stop: e.target.value.split('\n').filter((x) => x !== '') })} />
        </Field>
        <Field label="Logit bias · JSON {token_id: bias}" honey>
          <textarea className="cs-textarea cs-textarea--mono" rows={2} value={s.logitBias} placeholder='{"50256": -100}' onChange={(e) => ss({ logitBias: e.target.value })} />
        </Field>
      </details>
      <details className="cs-details">
        <summary>Служебные промпты</summary>
        <div className="cs-col" style={{ gap: 12 }}>
          {(
            [
              ['impersonation', 'Impersonate (реплика за игрока)'],
              ['continueNudge', 'Продолжение ответа'],
              ['newChat', 'Начало чата'],
              ['newGroupChat', 'Начало группового чата'],
              ['newExampleChat', 'Заголовок примера диалога'],
              ['groupNudge', 'Подсказка в группе'],
              ['personalityFormat', 'Формат характера'],
              ['scenarioFormat', 'Формат сценария'],
              ['wiFormat', 'Формат лорбука ({0} — записи)'],
              ['sendIfEmpty', 'Если отправлено пустое сообщение'],
            ] as [keyof Preset['utility'], string][]
          ).map(([k, label]) => (
            <Field key={k} label={label} honey>
              <textarea className="cs-textarea" rows={2} value={p.utility[k]} onChange={(e) => set({ utility: { ...p.utility, [k]: e.target.value } })} />
            </Field>
          ))}
          <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ utility: { ...DEFAULT_UTILITY } })}>
            Вернуть стандартные
          </button>
        </div>
      </details>
      <details className="cs-details">
        <summary>Формат и рассуждения</summary>
        <div className="cs-col" style={{ gap: 12 }}>
          <Field label="Имена в сообщениях" honey>
            <select className="cs-select" value={p.namesBehavior} onChange={(e) => set({ namesBehavior: e.target.value as Preset['namesBehavior'] })}>
              <option value="default">Только в группах</option>
              <option value="content">Всегда «Имя: текст»</option>
              <option value="none">Никогда</option>
            </select>
          </Field>
          <Check checked={p.squashSystem} onChange={(squashSystem) => set({ squashSystem })}>
            Склеивать подряд идущие системные сообщения
          </Check>
          <Check checked={p.reasoning.autoParse} onChange={(autoParse) => set({ reasoning: { ...p.reasoning, autoParse } })}>
            Выделять мысли модели из текста
          </Check>
          <div className="cs-grid-fields cs-grid-fields--sm">
            <Field label="Начало мыслей" honey>
              <input className="cs-input cs-input--mono" value={p.reasoning.prefix} onChange={(e) => set({ reasoning: { ...p.reasoning, prefix: e.target.value } })} />
            </Field>
            <Field label="Конец мыслей" honey>
              <input className="cs-input cs-input--mono" value={p.reasoning.suffix} onChange={(e) => set({ reasoning: { ...p.reasoning, suffix: e.target.value } })} />
            </Field>
          </div>
          <Check checked={p.reasoning.addToPrompt} onChange={(addToPrompt) => set({ reasoning: { ...p.reasoning, addToPrompt } })}>
            Отправлять прошлые мысли обратно модели
          </Check>
        </div>
      </details>
      <InstructPanel p={p} set={set} instruct={instruct} active={isText} />
    </>
  );
}

function InstructPanel({ p, set, instruct, active }: { p: Preset; set: (patch: Partial<Preset>) => void; instruct: InstructTemplate[]; active: boolean }) {
  const t = instruct.find((x) => x.id === p.instructId) || instruct[0];
  const setT = (patch: Partial<InstructTemplate>) => t && !t.builtin && upsert('instruct', { ...t, ...patch });
  const fields: [keyof InstructTemplate, string][] = [
    ['systemSequence', 'Начало системного'],
    ['systemSuffix', 'Конец системного'],
    ['inputSequence', 'Начало реплики игрока'],
    ['inputSuffix', 'Конец реплики игрока'],
    ['outputSequence', 'Начало ответа модели'],
    ['outputSuffix', 'Конец ответа модели'],
    ['firstOutputSequence', 'Первый ответ (опц.)'],
    ['lastOutputSequence', 'Последний ответ (опц.)'],
    ['storyStringPrefix', 'Префикс всего промпта'],
    ['stopSequence', 'Стоп-строка'],
  ];
  return (
    <details className="cs-details" open={active}>
      <summary>Text Completion · шаблон instruct{active ? ' · используется' : ''}</summary>
      <div className="cs-row cs-row--wrap" style={{ marginBottom: 10 }}>
        <select className="cs-select cs-grow" value={p.instructId} onChange={(e) => set({ instructId: e.target.value })} aria-label="Шаблон">
          {instruct.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.builtin ? '' : ' · свой'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="cs-btn cs-btn--sm"
          onClick={() => {
            const copy = upsert('instruct', { ...structuredClone(t), id: uid(), name: `${t.name} (свой)`, builtin: false });
            set({ instructId: copy.id });
          }}
        >
          Дублировать
        </button>
      </div>
      {t?.builtin ? <p className="cs-hint">Встроенный шаблон. Чтобы править, сделайте копию.</p> : null}
      <div className="cs-grid-fields">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} honey>
            <input className="cs-input cs-input--mono" value={String(t?.[k] ?? '').replace(/\n/g, '\\n')} disabled={t?.builtin} onChange={(e) => setT({ [k]: e.target.value.replace(/\\n/g, '\n') } as Partial<InstructTemplate>)} />
          </Field>
        ))}
      </div>
      <div className="cs-row cs-row--wrap" style={{ marginTop: 8 }}>
        <Check checked={!!t?.wrap} onChange={(wrap) => setT({ wrap })}>
          Перенос строки после маркеров
        </Check>
        <Check checked={!!t?.systemSameAsUser} onChange={(systemSameAsUser) => setT({ systemSameAsUser })}>
          Системное как реплика игрока
        </Check>
        <select className="cs-select cs-select--sm" value={t?.namesBehavior} disabled={t?.builtin} onChange={(e) => setT({ namesBehavior: e.target.value as InstructTemplate['namesBehavior'] })} aria-label="Имена">
          <option value="force">Имена в группах</option>
          <option value="always">Имена всегда</option>
          <option value="none">Без имён</option>
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
        model: conn?.model || '[модель]',
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
    <section ref={ref} aria-label="Что уходит модели" className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '1 1 460px', minWidth: 0 }}>
      <div className="cs-panel-head">
        <span style={{ display: 'flex', color: 'var(--cs-accent)' }}>
          <Icon name="eye" size={22} />
        </span>
        <h2 className="cs-h2" style={{ fontSize: 19 }}>
          Что уходит модели
        </h2>
        <div className="cs-ml-auto">
          <Tabs
            label="Вид запроса"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'messages', label: 'Сообщения' },
              { id: 'json', label: 'Сырой JSON' },
            ]}
          />
        </div>
      </div>
      {!built ? (
        <p className="cs-hint">Откройте чат с персонажем — здесь появится точный запрос, который уйдёт модели.</p>
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
              Всего {fmtNum(total)} из {fmtNum(built.contextSize)} · ответ до {fmtNum(built.maxTokens)} · история {built.historyIncluded}/{built.historyTotal}
              {built.mode === 'text' ? ' · Text Completion' : ''}
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
            <CodeEditor value={json} lang="json" readOnly minHeight={300} label="Сырой запрос" />
          )}
          {dry ? (
            <div className="cs-honey-box">
              <span className="cs-label cs-label--honey">Пробный ответ · {(dry.ms / 1000).toFixed(1)} с</span>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{dry.text}</p>
            </div>
          ) : null}
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--flex" onClick={() => copyText(json).then(() => toast('Запрос скопирован'))}>
              Копировать запрос
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
                    label: 'Пробный прогон',
                    mode: built.mode,
                    messages: built.mode === 'chat' ? await toWireMessages(built.messages) : undefined,
                    prompt: built.text,
                    params: samplersToParams(preset!, built.stop),
                  });
                  setDry({ text: r.text || '(пустой ответ)', ms: Date.now() - started });
                } catch (err) {
                  if ((err as Error).message !== 'no-connection') toastError(err, 'Пробный прогон');
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? <span className="cs-spinner" /> : null}
              Пробный прогон
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
      <PageHead title="Пресеты" kana="プリセット" sub="Порядок промптов, сэмплеры и предпросмотр запроса">
        <label className="cs-inline-field">
          Пресет
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
            Импорт
          </button>
          <button type="button" className="cs-btn" onClick={() => exportPreset(p.id)}>
            Экспорт
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={async () => {
              const name = await promptDialog('Сохранить как новый пресет', { value: `${p.name} (копия)` });
              if (!name) return;
              const copy = upsert('presets', { ...structuredClone(p), id: uid(), name });
              updateSettings({ activePresetId: copy.id });
              toast(`Пресет «${name}» сохранён`);
            }}
          >
            Сохранить как…
          </button>
          <button
            type="button"
            className="cs-icon-btn"
            aria-label="Ещё"
            onClick={(e) =>
              openMenu(e.currentTarget, [
                {
                  label: 'Переименовать',
                  icon: 'edit',
                  onClick: async () => {
                    const name = await promptDialog('Название пресета', { value: p.name });
                    if (name) set({ name });
                  },
                },
                { label: 'Новый пустой пресет', icon: 'plus', onClick: () => updateSettings({ activePresetId: upsert('presets', newPreset({ name: 'Новый пресет' })).id }) },
                {
                  label: 'Сбросить блоки к стандартным',
                  icon: 'undo',
                  onClick: async () => {
                    if (await confirmDialog('Вернуть стандартный набор блоков? Свои блоки пропадут.', { ok: 'Сбросить' })) set({ prompts: defaultPromptBlocks() });
                  },
                },
                { separator: true, label: '' },
                {
                  label: 'Удалить пресет',
                  icon: 'trash',
                  danger: true,
                  hidden: presets.length < 2,
                  onClick: async () => {
                    if (!(await confirmDialog(`Удалить пресет «${p.name}»?`, { ok: 'Удалить' }))) return;
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
        <section aria-label="Менеджер промптов" className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div className="cs-panel-head">
            <h2 className="cs-h2" style={{ fontSize: 19 }}>
              Менеджер промптов
            </h2>
            <span className="cs-pill cs-pill--mono">{fmtNum(enabledTotal)} ток.</span>
            <button
              type="button"
              className="cs-btn cs-btn--mint cs-btn--sm cs-ml-auto"
              onClick={() =>
                setEditing({ id: uid(), name: 'Новый блок', role: 'system', content: '', enabled: true, position: 'relative', depth: 4, order: 100 })
              }
            >
              <Icon name="plus" size={16} stroke={2.2} />
              Блок
            </button>
          </div>
          <div className="cs-hint">Перетаскивай блоки, чтобы поменять порядок. Выключенные не уходят модели.</div>
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
                  <span className="cs-grip" aria-label="Перетащить" {...sortable.handleProps(i)}>
                    <Icon name="grip" size={18} />
                  </span>
                  <span className={`cs-role cs-role--${roleKey}`}>{ROLE_LABEL[roleKey]}</span>
                  <div className="cs-grow">
                    <div className="cs-ellipsis" style={{ fontWeight: 800, fontSize: 14 }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--cs-muted)' }}>{whereLabel(b, i, p.prompts, built)}</div>
                  </div>
                  <span className="cs-mono" style={{ fontSize: 12, color: 'var(--cs-muted)' }}>
                    {tokens === null ? '' : fmtNum(tokens)}
                  </span>
                  <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Редактировать блок" onClick={() => setEditing(b)}>
                    <Icon name="edit" size={16} stroke={2} />
                  </button>
                  <Switch checked={b.enabled} label={b.enabled ? 'Выключить блок' : 'Включить блок'} onChange={(enabled) => set({ prompts: p.prompts.map((x) => (x.id === b.id ? { ...x, enabled } : x)) })} />
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
