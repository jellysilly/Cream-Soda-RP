import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, upsert, updateSettingsSection, navigate, toast, toastError, activeCharacter, setChat, getState, patchItem } from '../../lib/store';
import { PageHead, Choices, Field, Check, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { utilityGenerate, stopGeneration } from '../../lib/generate';
import { newCharacter, newPersona, newLorebook, newWorldEntry, newPlot, newMessage } from '../../lib/defaults';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, toKana, PALETTES } from '../../lib/utils';
import { messagesToTranscript } from '../../lib/memory';
import { exportCharacter } from '../../lib/appActions';
import { setState } from '../../lib/store';

type Kind = 'char' | 'persona' | 'lore' | 'plot' | 'greet' | 'scene';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'char', label: 'Персонаж' },
  { id: 'persona', label: 'Персона' },
  { id: 'lore', label: 'Лорбук' },
  { id: 'plot', label: 'Сюжет' },
  { id: 'greet', label: 'Приветствие' },
  { id: 'scene', label: 'Сцена' },
];

const PLACEHOLDERS: Record<Kind, string> = {
  char: 'Кондитер-призрак, который живёт в старой витрине кафе «Кристалл». Говорит загадками, обожает клубничный шорткейк. Тон уютный, немного грустный. Должен знать Рин с детства.',
  persona: 'Молчаливый курьер на велосипеде, который всегда успевает к закрытию. Любит дождь и старые плееры.',
  lore: 'Ночной район вокруг кафе: три заведения, станция, круглосуточный магазин и легенда о синем трамвае.',
  plot: 'Летний фестиваль, внезапный тайфун и потерянный билет на последний поезд.',
  greet: 'Приветствие, где персонаж встречает гостя в грозу и просит помочь закрыть ставни.',
  scene: 'Следующая сцена: утро после ливня, кафе закрыто, но кто-то стучит в окно.',
};

/** Field schema per kind: key → [label, multiline]. */
const SCHEMA: Record<Kind, [string, string, boolean][]> = {
  char: [
    ['name', 'Имя', false],
    ['tagline', 'Подпись', false],
    ['description', 'Описание', true],
    ['personality', 'Личность', true],
    ['scenario', 'Сценарий', true],
    ['first_mes', 'Первое сообщение', true],
    ['mes_example', 'Примеры диалогов', true],
  ],
  persona: [
    ['name', 'Имя', false],
    ['title', 'Подпись', false],
    ['description', 'Описание', true],
  ],
  lore: [
    ['name', 'Название', false],
    ['description', 'Описание', true],
  ],
  plot: [
    ['title', 'Название', false],
    ['premise', 'Завязка', true],
    ['scenario', 'Сценарий', true],
    ['first_mes', 'Первое сообщение', true],
  ],
  greet: [['greeting', 'Приветствие', true]],
  scene: [
    ['title', 'Название сцены', false],
    ['scenario', 'Обстановка', true],
    ['first_mes', 'Первое сообщение сцены', true],
  ],
};

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Модель не вернула JSON. Попробуйте ещё раз или смените модель.');
  let body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    body = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    return JSON.parse(body);
  }
}

function schemaText(kind: Kind, opts: { greetings: boolean; lore: boolean; avatar: boolean }): string {
  switch (kind) {
    case 'char':
      return `{
  "name": "имя",
  "tagline": "короткая подпись на английском, 2–3 слова",
  "description": "внешность, биография, манеры, привычки (от третьего лица)",
  "personality": "черты характера через запятую",
  "scenario": "обстоятельства начала истории",
  "first_mes": "первое сообщение персонажа: действия *курсивом*, реплики «в кавычках»",${opts.greetings ? '\n  "alternate_greetings": ["ещё 3 разных приветствия"],' : ''}
  "mes_example": "<START>\\n{{user}}: …\\n{{char}}: …",
  "tags": ["2–4 тега"]${opts.lore ? ',\n  "lorebook": [{"title": "место или предмет", "keys": ["ключи"], "content": "описание"}]' : ''}${opts.avatar ? ',\n  "avatar_prompt": "промпт портрета на английском"' : ''}
}`;
    case 'persona':
      return '{\n  "name": "имя",\n  "title": "короткая подпись",\n  "description": "внешность, характер, привычки персоны игрока"\n}';
    case 'lore':
      return '{\n  "name": "название лорбука",\n  "description": "о чём он",\n  "entries": [{"title": "название", "keys": ["ключевые слова"], "secondary_keys": [], "content": "текст записи 1–4 предложения"}]\n}';
    case 'plot':
      return '{\n  "title": "название",\n  "premise": "завязка в 1–2 предложения",\n  "scenario": "сценарий для промпта",\n  "first_mes": "первое сообщение рассказчика",\n  "tags": ["теги"]\n}';
    case 'greet':
      return '{\n  "greeting": "приветствие от лица персонажа"\n}';
    case 'scene':
      return '{\n  "title": "название сцены",\n  "scenario": "обстановка сцены для промпта",\n  "first_mes": "первое сообщение сцены (рассказчик или персонаж)"\n}';
  }
}

export default function GeneratorPage() {
  const g = useStore((s) => s.settings.generator);
  const characters = useStore((s) => s.characters);
  const worlds = useStore((s) => s.worlds);
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.gen.kind === 'generator');
  const param = useStore((s) => s.routeParam);
  const [kind, setKind] = useState<Kind>((['char', 'persona', 'lore', 'plot', 'greet', 'scene'].includes(param) ? param : 'char') as Kind);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loreChecked, setLoreChecked] = useState<Set<number>>(new Set());
  const [refine, setRefine] = useState('');
  const [progress, setProgress] = useState(0);
  const [fieldBusy, setFieldBusy] = useState('');
  const [greetIdx, setGreetIdx] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (['char', 'persona', 'lore', 'plot', 'greet', 'scene'].includes(param)) setKind(param as Kind);
  }, [param]);

  const char = activeCharacter();
  const charBook = char ? worlds.find((w) => w.id === char.worldIds[0]) : undefined;
  const sample = characters.find((c) => c.id === g.sampleCardId);
  const set = (p: Partial<typeof g>) => updateSettingsSection('generator', p);

  const contextBlock = () => {
    const parts: string[] = [];
    if (g.useChat && chat?.messages.length) parts.push(`Текущий чат (фрагмент):\n${messagesToTranscript(chat.messages.slice(-20)).slice(-6000)}`);
    if (g.useLore && charBook) parts.push(`Лорбук «${charBook.name}»:\n${charBook.entries.map((e) => `- ${e.comment}: ${e.content}`).join('\n').slice(0, 5000)}`);
    if (sample) parts.push(`Карточка-образец (повтори стиль и объём, не содержание):\nОписание: ${sample.description}\nПервое сообщение: ${sample.firstMessage}`);
    if ((kind === 'greet' || kind === 'scene') && char) parts.push(`Персонаж: ${char.name}\nОписание: ${char.description}\nХарактер: ${char.personality}\nСценарий: ${char.scenario}`);
    return parts.join('\n\n');
  };

  const systemPrompt = () => {
    const lang = g.language === 'en' ? 'Write all text values in English.' : 'Пиши все текстовые значения на русском языке.';
    const size = g.template === 'compact' ? 'Будь краток: всё описание до 600 токенов.' : g.template === 'custom' && g.customTemplate ? `Требования к структуре: ${g.customTemplate}` : 'Делай подробно и живо, как хорошая карточка SillyTavern V2.';
    return `Ты — опытный автор карточек для ролевых чатов. ${lang} ${size} Используй макросы {{char}} и {{user}} там, где уместно. Ответь ТОЛЬКО валидным JSON без пояснений по схеме:\n${schemaText(kind, { greetings: g.greetings, lore: g.lore, avatar: g.avatarPrompt })}`;
  };

  const run = async (messages: { role: 'system' | 'user' | 'assistant'; content: string }[], label: string) => {
    abort.current = new AbortController();
    setState({ gen: { kind: 'generator', startedAt: Date.now() } });
    setProgress(0);
    try {
      return await utilityGenerate('generator', messages, {
        maxTokens: 3000,
        temperature: 0.9,
        label,
        signal: abort.current.signal,
        onDelta: (t) => setProgress(t.length),
      });
    } finally {
      setState({ gen: { kind: null } });
      abort.current = null;
    }
  };

  const generate = async () => {
    const text = instruction.trim() || PLACEHOLDERS[kind];
    try {
      const ctx = contextBlock();
      const raw = await run(
        [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: `${ctx ? `${ctx}\n\n` : ''}Задание (${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}): ${text}` },
        ],
        `Генератор · ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`,
      );
      const json = extractJson(raw);
      setResult(json);
      setGreetIdx(0);
      const lore = kind === 'char' ? json.lorebook : kind === 'lore' ? json.entries : [];
      setLoreChecked(new Set((lore || []).map((_: unknown, i: number) => i)));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, 'Генератор');
    }
  };

  const regenField = async (key: string, label: string) => {
    if (!result) return;
    setFieldBusy(key);
    try {
      const raw = await run(
        [
          { role: 'system', content: `${systemPrompt()}\nСейчас нужно переписать только одно поле.` },
          { role: 'user', content: `Текущий результат:\n${JSON.stringify(result, null, 1)}\n\nПерепиши поле «${label}» (${key}) по-новому, сохранив остальное согласованным. Ответь JSON вида {"${key}": "…"}.` },
        ],
        `Генератор · поле ${label}`,
      );
      const json = extractJson(raw);
      if (json[key] !== undefined) setResult({ ...result, [key]: json[key] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, 'Генератор');
    } finally {
      setFieldBusy('');
    }
  };

  const applyRefine = async () => {
    if (!result || !refine.trim()) return;
    try {
      const raw = await run(
        [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: `Текущий результат:\n${JSON.stringify(result, null, 1)}\n\nДоработай его: ${refine}. Верни полный JSON по той же схеме.` },
        ],
        'Генератор · доработка',
      );
      setResult(extractJson(raw));
      setRefine('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, 'Генератор');
    }
  };

  const loreEntries: any[] = useMemo(() => (result ? (kind === 'char' ? result.lorebook : kind === 'lore' ? result.entries : []) || [] : []), [result, kind]);
  const tokens = useMemo(() => (result ? countTokens(JSON.stringify(result)) : 0), [result]);
  const greetings: string[] = result ? [result.first_mes, ...(Array.isArray(result.alternate_greetings) ? result.alternate_greetings : [])].filter(Boolean) : [];

  const save = (openEditor = false) => {
    if (!result) return;
    try {
      if (kind === 'char') {
        const c = newCharacter({
          name: String(result.name || 'Без имени'),
          tagline: String(result.tagline || ''),
          description: String(result.description || ''),
          personality: String(result.personality || ''),
          scenario: String(result.scenario || ''),
          firstMessage: String(result.first_mes || ''),
          alternateGreetings: Array.isArray(result.alternate_greetings) ? result.alternate_greetings.map(String) : [],
          exampleMessages: String(result.mes_example || ''),
          tags: Array.isArray(result.tags) ? result.tags.map(String) : [],
          kana: toKana(String(result.name || '')),
          palette: Math.floor(Math.random() * PALETTES.length),
          creatorNotes: result.avatar_prompt ? `Промпт аватара: ${result.avatar_prompt}` : '',
        });
        const picked = loreEntries.filter((_, i) => loreChecked.has(i));
        if (picked.length) {
          const book = upsert(
            'worlds',
            newLorebook({
              name: `${c.name} · лорбук`,
              entries: picked.map((e) => newWorldEntry({ comment: String(e.title || e.name || 'Запись'), keys: (e.keys || []).map(String), secondaryKeys: (e.secondary_keys || []).map(String), content: String(e.content || '') })),
            }),
          );
          c.worldIds = [book.id];
        }
        upsert('characters', c);
        toast(`«${c.name}» сохранён в библиотеку`);
        navigate('library', `char:${c.id}`);
        return c;
      }
      if (kind === 'persona') {
        const p = upsert('personas', newPersona({ name: String(result.name || 'Персона'), title: String(result.title || ''), description: String(result.description || ''), kana: toKana(String(result.name || '')) }));
        toast(`Персона «${p.name}» сохранена`);
        navigate('library', `persona:${p.id}`);
      } else if (kind === 'lore') {
        const book = upsert(
          'worlds',
          newLorebook({
            name: String(result.name || 'Лорбук'),
            description: String(result.description || ''),
            entries: loreEntries.filter((_, i) => loreChecked.has(i)).map((e) => newWorldEntry({ comment: String(e.title || 'Запись'), keys: (e.keys || []).map(String), secondaryKeys: (e.secondary_keys || []).map(String), content: String(e.content || '') })),
          }),
        );
        toast(`Лорбук «${book.name}» сохранён`);
        navigate('library', `lore:${book.id}`);
      } else if (kind === 'plot') {
        const p = upsert('plots', newPlot({ title: String(result.title || 'Сюжет'), premise: String(result.premise || ''), scenario: String(result.scenario || ''), firstMessage: String(result.first_mes || ''), tags: (result.tags || []).map(String) }));
        toast(`Сюжет «${p.title}» сохранён`);
        navigate('library', `plot:${p.id}`);
      } else if (kind === 'greet') {
        if (!char) throw new Error('Откройте чат с персонажем, чтобы добавить ему приветствие');
        patchItem('characters', char.id, { alternateGreetings: [...char.alternateGreetings, String(result.greeting || '')] });
        toast(`Приветствие добавлено персонажу «${char.name}»`);
      } else if (kind === 'scene') {
        if (!getState().chat) throw new Error('Откройте чат, чтобы вставить сцену');
        const msg = newMessage({ role: 'system', name: 'Рассказчик', text: `**${result.title || 'Новая сцена'}**\n\n${result.scenario || ''}\n\n${result.first_mes || ''}` });
        setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
        toast('Сцена добавлена в чат');
        navigate('chat');
      }
      if (openEditor) navigate('library');
    } catch (err) {
      toastError(err);
    }
  };

  const kindLabel = KINDS.find((k) => k.id === kind)!.label.toLowerCase();
  const titleValue = result ? result.name || result.title || (kind === 'greet' ? char?.name : '') || 'Готово' : '';

  return (
    <div className="cs-page">
      <PageHead title="Генератор" kana="ジェネレーター">
        <Choices<Kind>
          label="Что создаём"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setResult(null);
          }}
          items={KINDS}
        />
      </PageHead>

      <div className="cs-columns">
        <section aria-label="Инструкция" className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h2 className="cs-h2" style={{ fontSize: 19 }}>
            Инструкция · {kindLabel}
          </h2>
          <Field label="Опиши, что нужно">
            <textarea className="cs-textarea cs-textarea--lg" rows={6} placeholder={PLACEHOLDERS[kind]} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </Field>
          <div className="cs-col">
            <span className="cs-label">Опора</span>
            <div className="cs-chips">
              <Check chip checked={g.useChat} onChange={(useChat) => set({ useChat })}>
                Текущий чат
              </Check>
              {charBook ? (
                <Check chip checked={g.useLore} onChange={(useLore) => set({ useLore })}>
                  Лорбук «{charBook.name}»
                </Check>
              ) : null}
              <label className="cs-check cs-check--chip">
                <input type="checkbox" checked={!!g.sampleCardId} onChange={(e) => set({ sampleCardId: e.target.checked ? characters[0]?.id || '' : '' })} />
                Карточка-образец
                {g.sampleCardId ? (
                  <select className="cs-select cs-select--sm" style={{ minHeight: 30, border: 'none' }} value={g.sampleCardId} onChange={(e) => set({ sampleCardId: e.target.value })}>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
            </div>
          </div>
          <div className="cs-grid-fields">
            <Field label="Шаблон">
              <select className="cs-select" value={g.template} onChange={(e) => set({ template: e.target.value as typeof g.template })}>
                <option value="v2">V2 · полная карточка</option>
                <option value="compact">Компактная (до 600 ток.)</option>
                <option value="custom">Свой шаблон…</option>
              </select>
            </Field>
            <Field label="Язык">
              <select className="cs-select" value={g.language} onChange={(e) => set({ language: e.target.value as 'ru' | 'en' })}>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          {g.template === 'custom' ? (
            <Field label="Свой шаблон · требования к структуре">
              <textarea className="cs-textarea" rows={3} value={g.customTemplate} onChange={(e) => set({ customTemplate: e.target.value })} placeholder="Например: описание в формате W++, внешность отдельным абзацем…" />
            </Field>
          ) : null}
          {kind === 'char' ? (
            <div className="cs-honey-box">
              <Check checked={g.greetings} onChange={(greetings) => set({ greetings })}>
                3 альтернативных приветствия
              </Check>
              <Check checked={g.lore} onChange={(lore) => set({ lore })}>
                Записи лорбука для новых мест и предметов
              </Check>
              <Check checked={g.avatarPrompt} onChange={(avatarPrompt) => set({ avatarPrompt })}>
                Промпт для аватара
              </Check>
            </div>
          ) : null}
          {(kind === 'greet' || kind === 'scene') && !char ? <p className="cs-hint">Для этого вида откройте чат с персонажем — генератор опирается на его карточку.</p> : null}
          {busy ? (
            <button type="button" className="cs-btn cs-btn--lg" onClick={() => (abort.current ? abort.current.abort() : stopGeneration())}>
              <span className="cs-spinner" />
              Пишу… {progress ? `${fmtNum(progress)} симв.` : ''} · Остановить
            </button>
          ) : (
            <button type="button" className="cs-btn cs-btn--primary cs-btn--lg cs-btn--glow" onClick={generate}>
              <Icon name="sparkle" size={18} />
              Сгенерировать
            </button>
          )}
        </section>

        <section aria-label="Результат" className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '1 1 520px', minWidth: 0 }}>
          {!result ? (
            <Empty icon="generator" title="Здесь появится результат">
              Опиши идею слева — модель соберёт {kindLabel === 'персонаж' ? 'карточку' : kindLabel}, а ты сможешь доработать отдельные поля.
            </Empty>
          ) : (
            <>
              <div className="cs-gen-banner" style={{ background: PALETTES[0].bg }}>
                <div className="cs-gen-banner__kana" aria-hidden="true">
                  {toKana(String(titleValue), 2)}
                </div>
                <div style={{ position: 'absolute', left: 20, top: 18 }}>
                  <span className="cs-pill cs-pill--white" style={{ color: 'var(--cs-mint-ink)' }}>
                    ГОТОВО · {fmtNum(tokens)} ток.
                  </span>
                </div>
                <div className="cs-gen-banner__name">{String(titleValue)}</div>
              </div>
              <div className="cs-col" style={{ gap: 10 }}>
                {SCHEMA[kind].map(([key, label, multi]) =>
                  key === 'first_mes' && greetings.length > 1 && kind === 'char' ? (
                    <div key={key} className="cs-gen-field">
                      <div className="cs-grow">
                        <div className="cs-row">
                          <span className="cs-gen-field__label">
                            Первое сообщение · {greetIdx + 1} из {greetings.length}
                          </span>
                          <button type="button" className="cs-icon-btn cs-icon-btn--xs cs-ml-auto" aria-label="Предыдущее" onClick={() => setGreetIdx((greetIdx - 1 + greetings.length) % greetings.length)}>
                            <Icon name="left" size={14} />
                          </button>
                          <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label="Следующее" onClick={() => setGreetIdx((greetIdx + 1) % greetings.length)}>
                            <Icon name="right" size={14} />
                          </button>
                        </div>
                        <textarea
                          rows={5}
                          value={greetings[greetIdx] || ''}
                          aria-label="Приветствие"
                          onChange={(e) => {
                            if (greetIdx === 0) setResult({ ...result, first_mes: e.target.value });
                            else setResult({ ...result, alternate_greetings: result.alternate_greetings.map((x: string, i: number) => (i === greetIdx - 1 ? e.target.value : x)) });
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div key={key} className="cs-gen-field">
                      <div className="cs-grow">
                        <div className="cs-gen-field__label">{label}</div>
                        <textarea rows={multi ? 4 : 1} value={String(result[key] ?? '')} aria-label={label} onChange={(e) => setResult({ ...result, [key]: e.target.value })} />
                      </div>
                      <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Перегенерировать поле" title="Перегенерировать поле" disabled={busy} onClick={() => regenField(key, label)}>
                        {fieldBusy === key ? <span className="cs-spinner" style={{ width: 16, height: 16 }} /> : <Icon name="refresh" size={16} stroke={2} />}
                      </button>
                    </div>
                  ),
                )}
                {kind === 'char' && Array.isArray(result.tags) ? (
                  <div className="cs-gen-field">
                    <div className="cs-grow">
                      <div className="cs-gen-field__label">Теги</div>
                      <div className="cs-chips" style={{ marginTop: 6 }}>
                        {result.tags.map((t: string) => (
                          <span key={t} className="cs-pill cs-pill--rose">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                {loreEntries.length ? (
                  <div style={{ padding: '12px 14px', borderRadius: 18, background: 'var(--cs-lilac-soft)' }}>
                    <div className="cs-gen-field__label" style={{ color: 'var(--cs-lilac-deep)' }}>
                      {kind === 'lore' ? 'Записи' : 'Новые записи лорбука'} · {loreEntries.length}
                    </div>
                    <div className="cs-chips" style={{ marginTop: 8 }}>
                      {loreEntries.map((e, i) => (
                        <label key={i} className="cs-check cs-check--chip" title={e.content}>
                          <input
                            type="checkbox"
                            checked={loreChecked.has(i)}
                            style={{ accentColor: 'var(--cs-lilac)' }}
                            onChange={(ev) => {
                              const n = new Set(loreChecked);
                              if (ev.target.checked) n.add(i);
                              else n.delete(i);
                              setLoreChecked(n);
                            }}
                          />
                          {e.title || e.name}
                          <span className="cs-mono" style={{ fontSize: 11, color: 'var(--cs-lilac)' }}>
                            {(e.keys || []).slice(0, 2).join(', ')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.avatar_prompt ? (
                  <div className="cs-gen-field">
                    <div className="cs-grow">
                      <div className="cs-gen-field__label">Промпт аватара</div>
                      <p className="cs-mono" style={{ fontSize: 12, marginTop: 4 }}>
                        {result.avatar_prompt}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              <label className="cs-inline-field">
                Доработать
                <input value={refine} placeholder="например: сделай речь старомоднее" onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyRefine()} />
                <button type="button" className="cs-icon-btn cs-icon-btn--mint" style={{ width: 36, height: 36 }} aria-label="Применить правку" disabled={busy || !refine.trim()} onClick={applyRefine}>
                  <Icon name="arrow" size={16} stroke={2.2} />
                </button>
              </label>
              <div className="cs-row cs-row--wrap">
                <button type="button" className="cs-btn cs-btn--primary" style={{ flex: '1 1 160px' }} onClick={() => save()}>
                  {kind === 'greet' ? 'Добавить персонажу' : kind === 'scene' ? 'Вставить в чат' : 'Сохранить в библиотеку'}
                </button>
                {kind === 'char' ? (
                  <>
                    <button
                      type="button"
                      className="cs-btn"
                      style={{ flex: '1 1 120px' }}
                      onClick={() => {
                        const c = save();
                        if (c) setTimeout(() => navigate('library', `char:${c.id}`), 50);
                      }}
                    >
                      В редактор
                    </button>
                    <button
                      type="button"
                      className="cs-btn"
                      style={{ flex: '1 1 120px' }}
                      onClick={() => {
                        const c = newCharacter({
                          name: String(result.name || 'Персонаж'),
                          description: String(result.description || ''),
                          personality: String(result.personality || ''),
                          scenario: String(result.scenario || ''),
                          firstMessage: String(result.first_mes || ''),
                          alternateGreetings: result.alternate_greetings || [],
                          exampleMessages: String(result.mes_example || ''),
                          tags: result.tags || [],
                          tagline: String(result.tagline || ''),
                        });
                        exportCharacter(c, 'png').catch((err) => toastError(err));
                      }}
                    >
                      Экспорт PNG
                    </button>
                  </>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
