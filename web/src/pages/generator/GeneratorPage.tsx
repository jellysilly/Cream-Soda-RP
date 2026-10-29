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
import { prompt, LANGUAGE_NAMES, LANGUAGE_LABELS } from '../../lib/prompts';
import { t } from '../../lib/i18n';

type Kind = 'char' | 'persona' | 'lore' | 'plot' | 'greet' | 'scene';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'char', label: t('Character') },
  { id: 'persona', label: t('Persona') },
  { id: 'lore', label: t('Lorebook') },
  { id: 'plot', label: t('Plot') },
  { id: 'greet', label: t('Greeting') },
  { id: 'scene', label: t('Scene') },
];

const PLACEHOLDERS: Record<Kind, string> = {
  char: t('A ghost pastry chef who lives in the old display case of the Crystal café. Speaks in riddles, adores strawberry shortcake. A cozy, slightly sad tone. Has known Rin since childhood.'),
  persona: t('A quiet bicycle courier who always makes it before closing time. Loves rain and old music players.'),
  lore: t('The night district around the café: three places, a station, a 24-hour store and the legend of the blue tram.'),
  plot: t('A summer festival, a sudden typhoon and a lost ticket for the last train.'),
  greet: t('A greeting where the character meets a guest during a thunderstorm and asks for help closing the shutters.'),
  scene: t('The next scene: the morning after the downpour, the café is closed, but someone knocks on the window.'),
};

/** Field schema per kind: key → [label, multiline]. */
const SCHEMA: Record<Kind, [string, string, boolean][]> = {
  char: [
    ['name', t('Name'), false],
    ['tagline', t('Tagline'), false],
    ['description', t('Description'), true],
    ['personality', t('Personality'), true],
    ['scenario', t('Scenario'), true],
    ['first_mes', t('First message'), true],
    ['mes_example', t('Dialogue examples'), true],
  ],
  persona: [
    ['name', t('Name'), false],
    ['title', t('Tagline'), false],
    ['description', t('Description'), true],
  ],
  lore: [
    ['name', t('Title'), false],
    ['description', t('Description'), true],
  ],
  plot: [
    ['title', t('Title'), false],
    ['premise', t('Premise'), true],
    ['scenario', t('Scenario'), true],
    ['first_mes', t('First message'), true],
  ],
  greet: [['greeting', t('Greeting'), true]],
  scene: [
    ['title', t('Scene title'), false],
    ['scenario', t('Setting'), true],
    ['first_mes', t('First message of the scene'), true],
  ],
};

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(t('The model did not return JSON. Try again or switch the model.'));
  let body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    body = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    return JSON.parse(body);
  }
}

/** JSON shape the model must return; always English, like every prompt. */
function schemaText(kind: Kind, opts: { greetings: boolean; lore: boolean; avatar: boolean }): string {
  switch (kind) {
    case 'char':
      return `{
  "name": "name",
  "tagline": "a short English tagline, 2–3 words",
  "description": "appearance, background, manners, habits (third person)",
  "personality": "character traits, comma-separated",
  "scenario": "the circumstances in which the story begins",
  "first_mes": "the character's first message: actions in *italics*, speech in quotes",${opts.greetings ? '\n  "alternate_greetings": ["3 more different greetings"],' : ''}
  "mes_example": "<START>\\n{{user}}: …\\n{{char}}: …",
  "tags": ["2–4 tags"]${opts.lore ? ',\n  "lorebook": [{"title": "place or object", "keys": ["keywords"], "content": "description"}]' : ''}${opts.avatar ? ',\n  "avatar_prompt": "portrait prompt in English"' : ''}
}`;
    case 'persona':
      return '{\n  "name": "name",\n  "title": "short tagline",\n  "description": "appearance, character and habits of the player\'s persona"\n}';
    case 'lore':
      return '{\n  "name": "lorebook name",\n  "description": "what it is about",\n  "entries": [{"title": "title", "keys": ["keywords"], "secondary_keys": [], "content": "entry text, 1–4 sentences"}]\n}';
    case 'plot':
      return '{\n  "title": "title",\n  "premise": "the premise in 1–2 sentences",\n  "scenario": "scenario for the prompt",\n  "first_mes": "the narrator\'s first message",\n  "tags": ["tags"]\n}';
    case 'greet':
      return '{\n  "greeting": "a greeting written as the character"\n}';
    case 'scene':
      return '{\n  "title": "scene title",\n  "scenario": "the scene setting for the prompt",\n  "first_mes": "the first message of the scene (narrator or character)"\n}';
  }
}

/** What the model is asked to make, per kind (goes into the English prompt). */
const KIND_TASK: Record<Kind, string> = {
  char: 'character card',
  persona: 'user persona',
  lore: 'lorebook',
  plot: 'plot',
  greet: 'greeting',
  scene: 'scene',
};

/** «The model will put together …» on the empty result panel. */
const RESULT_NOUN: Record<Kind, string> = {
  char: t('a character card'),
  persona: t('a persona'),
  lore: t('a lorebook'),
  plot: t('a plot'),
  greet: t('a greeting'),
  scene: t('a scene'),
};

/** English names of the fields for «rewrite this field». */
const FIELD_NAMES: Record<string, string> = {
  name: 'Name',
  tagline: 'Tagline',
  title: 'Title',
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  premise: 'Premise',
  first_mes: 'First message',
  mes_example: 'Dialogue examples',
  greeting: 'Greeting',
};

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
    if (g.useChat && chat?.messages.length) parts.push(`Current chat (excerpt):\n${messagesToTranscript(chat.messages.slice(-20)).slice(-6000)}`);
    if (g.useLore && charBook) parts.push(`Lorebook "${charBook.name}":\n${charBook.entries.map((e) => `- ${e.comment}: ${e.content}`).join('\n').slice(0, 5000)}`);
    if (sample) parts.push(`Sample card (match its style and length, not its content):\nDescription: ${sample.description}\nFirst message: ${sample.firstMessage}`);
    if ((kind === 'greet' || kind === 'scene') && char) parts.push(`Character: ${char.name}\nDescription: ${char.description}\nPersonality: ${char.personality}\nScenario: ${char.scenario}`);
    return parts.join('\n\n');
  };

  const systemPrompt = () => {
    const size =
      g.template === 'compact'
        ? 'Be concise: the whole description within 600 tokens.'
        : g.template === 'custom' && g.customTemplate
          ? `Structure requirements: ${g.customTemplate}`
          : 'Be detailed and vivid, like a good SillyTavern V2 card.';
    return prompt('generatorSystem', {
      language: LANGUAGE_NAMES[g.language] || g.language || 'English',
      size,
      schema: schemaText(kind, { greetings: g.greetings, lore: g.lore, avatar: g.avatarPrompt }),
    });
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
        onDelta: (text) => setProgress(text.length),
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
          { role: 'user', content: prompt('generatorTask', { context: ctx ? `${ctx}\n\n` : '', kind: KIND_TASK[kind], request: text }) },
        ],
        t('Generator · {label}', { label: KINDS.find((k) => k.id === kind)!.label.toLowerCase() }),
      );
      const json = extractJson(raw);
      setResult(json);
      setGreetIdx(0);
      const lore = kind === 'char' ? json.lorebook : kind === 'lore' ? json.entries : [];
      setLoreChecked(new Set((lore || []).map((_: unknown, i: number) => i)));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, t('Generator'));
    }
  };

  const regenField = async (key: string, label: string) => {
    if (!result) return;
    setFieldBusy(key);
    try {
      const raw = await run(
        [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: prompt('generatorField', { result: JSON.stringify(result, null, 1), field: FIELD_NAMES[key] || key, key }) },
        ],
        t('Generator · field {label}', { label }),
      );
      const json = extractJson(raw);
      if (json[key] !== undefined) setResult({ ...result, [key]: json[key] });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, t('Generator'));
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
          { role: 'user', content: prompt('generatorRefine', { result: JSON.stringify(result, null, 1), request: refine }) },
        ],
        t('Generator · refinement'),
      );
      setResult(extractJson(raw));
      setRefine('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastError(err, t('Generator'));
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
          name: String(result.name || t('Nameless')),
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
          creatorNotes: result.avatar_prompt ? t('Avatar prompt: {avatar_prompt}', { avatar_prompt: result.avatar_prompt }) : '',
        });
        const picked = loreEntries.filter((_, i) => loreChecked.has(i));
        if (picked.length) {
          const book = upsert(
            'worlds',
            newLorebook({
              name: t('{name} · lorebook', { name: c.name }),
              entries: picked.map((e) => newWorldEntry({ comment: String(e.title || e.name || t('Entry')), keys: (e.keys || []).map(String), secondaryKeys: (e.secondary_keys || []).map(String), content: String(e.content || '') })),
            }),
          );
          c.worldIds = [book.id];
        }
        upsert('characters', c);
        toast(t('“{name}” saved to the library', { name: c.name }));
        navigate('library', `char:${c.id}`);
        return c;
      }
      if (kind === 'persona') {
        const p = upsert('personas', newPersona({ name: String(result.name || t('Persona')), title: String(result.title || ''), description: String(result.description || ''), kana: toKana(String(result.name || '')) }));
        toast(t('Persona “{name}” saved', { name: p.name }));
        navigate('library', `persona:${p.id}`);
      } else if (kind === 'lore') {
        const book = upsert(
          'worlds',
          newLorebook({
            name: String(result.name || t('Lorebook')),
            description: String(result.description || ''),
            entries: loreEntries.filter((_, i) => loreChecked.has(i)).map((e) => newWorldEntry({ comment: String(e.title || t('Entry')), keys: (e.keys || []).map(String), secondaryKeys: (e.secondary_keys || []).map(String), content: String(e.content || '') })),
          }),
        );
        toast(t('Lorebook “{name}” saved', { name: book.name }));
        navigate('library', `lore:${book.id}`);
      } else if (kind === 'plot') {
        const p = upsert('plots', newPlot({ title: String(result.title || t('Plot')), premise: String(result.premise || ''), scenario: String(result.scenario || ''), firstMessage: String(result.first_mes || ''), tags: (result.tags || []).map(String) }));
        toast(t('Plot “{title}” saved', { title: p.title }));
        navigate('library', `plot:${p.id}`);
      } else if (kind === 'greet') {
        if (!char) throw new Error(t('Open a chat with a character to add a greeting to them'));
        patchItem('characters', char.id, { alternateGreetings: [...char.alternateGreetings, String(result.greeting || '')] });
        toast(t('Greeting added to “{name}”', { name: char.name }));
      } else if (kind === 'scene') {
        if (!getState().chat) throw new Error(t('Open a chat to insert the scene'));
        const msg = newMessage({ role: 'system', name: 'Narrator', text: `**${result.title || 'New scene'}**\n\n${result.scenario || ''}\n\n${result.first_mes || ''}` });
        setChat((c) => ({ ...c, messages: [...c.messages, msg] }));
        toast(t('Scene added to the chat'));
        navigate('chat');
      }
      if (openEditor) navigate('library');
    } catch (err) {
      toastError(err);
    }
  };

  const kindLabel = KINDS.find((k) => k.id === kind)!.label.toLowerCase();
  const titleValue = result ? result.name || result.title || (kind === 'greet' ? char?.name : '') || t('Done') : '';

  return (
    <div className="cs-page">
      <PageHead title={t('Generator')} kana="ジェネレーター">
        <Choices<Kind>
          label={t('What are we making')}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setResult(null);
          }}
          items={KINDS}
        />
      </PageHead>

      <div className="cs-columns">
        <section aria-label={t('Instruction')} className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h2 className="cs-h2" style={{ fontSize: 19 }}>
            {t('Instruction · {kindLabel}', { kindLabel })}
          </h2>
          <Field label={t('Describe what you need')}>
            <textarea className="cs-textarea cs-textarea--lg" rows={6} placeholder={PLACEHOLDERS[kind]} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </Field>
          <div className="cs-col">
            <span className="cs-label">{t('Grounding')}</span>
            <div className="cs-chips">
              <Check chip checked={g.useChat} onChange={(useChat) => set({ useChat })}>
                {t('Current chat')}
              </Check>
              {charBook ? (
                <Check chip checked={g.useLore} onChange={(useLore) => set({ useLore })}>
                  {t('Lorebook “{name}”', { name: charBook.name })}
                </Check>
              ) : null}
              <label className="cs-check cs-check--chip">
                <input type="checkbox" checked={!!g.sampleCardId} onChange={(e) => set({ sampleCardId: e.target.checked ? characters[0]?.id || '' : '' })} />
                {t('Sample card')}
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
            <Field label={t('Template')}>
              <select className="cs-select" value={g.template} onChange={(e) => set({ template: e.target.value as typeof g.template })}>
                <option value="v2">{t('V2 · full card')}</option>
                <option value="compact">{t('Compact (up to 600 tok.)')}</option>
                <option value="custom">{t('Custom template…')}</option>
              </select>
            </Field>
            <Field label={t('Language')}>
              <select className="cs-select" value={g.language} onChange={(e) => set({ language: e.target.value })}>
                {Object.entries(LANGUAGE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {g.template === 'custom' ? (
            <Field label={t('Custom template · structure requirements')}>
              <textarea className="cs-textarea" rows={3} value={g.customTemplate} onChange={(e) => set({ customTemplate: e.target.value })} placeholder={t('For example: description in W++ format, appearance as a separate paragraph…')} />
            </Field>
          ) : null}
          {kind === 'char' ? (
            <div className="cs-honey-box">
              <Check checked={g.greetings} onChange={(greetings) => set({ greetings })}>
                {t('3 alternate greetings')}
              </Check>
              <Check checked={g.lore} onChange={(lore) => set({ lore })}>
                {t('Lorebook entries for new places and objects')}
              </Check>
              <Check checked={g.avatarPrompt} onChange={(avatarPrompt) => set({ avatarPrompt })}>
                {t('Prompt for the avatar')}
              </Check>
            </div>
          ) : null}
          {(kind === 'greet' || kind === 'scene') && !char ? <p className="cs-hint">{t('For this kind, open a chat with a character: the generator builds on their card.')}</p> : null}
          {busy ? (
            <button type="button" className="cs-btn cs-btn--lg" onClick={() => (abort.current ? abort.current.abort() : stopGeneration())}>
              <span className="cs-spinner" />
              {t('Writing…')} {progress ? t('{progress} chars', { progress: fmtNum(progress) }) : ''} {t('· Stop')}
            </button>
          ) : (
            <button type="button" className="cs-btn cs-btn--primary cs-btn--lg cs-btn--glow" onClick={generate}>
              <Icon name="sparkle" size={18} />
              {t('Generate')}
            </button>
          )}
        </section>

        <section aria-label={t('Result')} className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '1 1 520px', minWidth: 0 }}>
          {!result ? (
            <Empty icon="generator" title={t('The result will show up here')}>
              {t('Describe the idea on the left: the model will put together {what}, and you can refine individual fields.', { what: RESULT_NOUN[kind] })}
            </Empty>
          ) : (
            <>
              <div className="cs-gen-banner" style={{ background: PALETTES[0].bg }}>
                <div className="cs-gen-banner__kana" aria-hidden="true">
                  {toKana(String(titleValue), 2)}
                </div>
                <div style={{ position: 'absolute', left: 20, top: 18 }}>
                  <span className="cs-pill cs-pill--white" style={{ color: 'var(--cs-mint-ink)' }}>
                    {t('DONE · {tokens} tok.', { tokens: fmtNum(tokens) })}
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
                            {t('First message · {greetIdx} of {n}', { greetIdx: greetIdx + 1, n: greetings.length })}
                          </span>
                          <button type="button" className="cs-icon-btn cs-icon-btn--xs cs-ml-auto" aria-label={t('Previous')} onClick={() => setGreetIdx((greetIdx - 1 + greetings.length) % greetings.length)}>
                            <Icon name="left" size={14} />
                          </button>
                          <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label={t('Next')} onClick={() => setGreetIdx((greetIdx + 1) % greetings.length)}>
                            <Icon name="right" size={14} />
                          </button>
                        </div>
                        <textarea
                          rows={5}
                          value={greetings[greetIdx] || ''}
                          aria-label={t('Greeting')}
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
                      <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label={t('Regenerate the field')} title={t('Regenerate the field')} disabled={busy} onClick={() => regenField(key, label)}>
                        {fieldBusy === key ? <span className="cs-spinner" style={{ width: 16, height: 16 }} /> : <Icon name="refresh" size={16} stroke={2} />}
                      </button>
                    </div>
                  ),
                )}
                {kind === 'char' && Array.isArray(result.tags) ? (
                  <div className="cs-gen-field">
                    <div className="cs-grow">
                      <div className="cs-gen-field__label">{t('Tags')}</div>
                      <div className="cs-chips" style={{ marginTop: 6 }}>
                        {result.tags.map((tag: string) => (
                          <span key={tag} className="cs-pill cs-pill--rose">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                {loreEntries.length ? (
                  <div style={{ padding: '12px 14px', borderRadius: 18, background: 'var(--cs-lilac-soft)' }}>
                    <div className="cs-gen-field__label" style={{ color: 'var(--cs-lilac-deep)' }}>
                      {kind === 'lore' ? t('Entries') : t('New lorebook entries')} · {loreEntries.length}
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
                      <div className="cs-gen-field__label">{t('Avatar prompt')}</div>
                      <p className="cs-mono" style={{ fontSize: 12, marginTop: 4 }}>
                        {result.avatar_prompt}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              <label className="cs-inline-field">
                {t('Refine')}
                <input value={refine} placeholder={t('e.g. make the speech more old-fashioned')} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyRefine()} />
                <button type="button" className="cs-icon-btn cs-icon-btn--mint" style={{ width: 36, height: 36 }} aria-label={t('Apply the edit')} disabled={busy || !refine.trim()} onClick={applyRefine}>
                  <Icon name="arrow" size={16} stroke={2.2} />
                </button>
              </label>
              <div className="cs-row cs-row--wrap">
                <button type="button" className="cs-btn cs-btn--primary" style={{ flex: '1 1 160px' }} onClick={() => save()}>
                  {kind === 'greet' ? t('Add to the character') : kind === 'scene' ? t('Insert into the chat') : t('Save to the library')}
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
                      {t('To the editor')}
                    </button>
                    <button
                      type="button"
                      className="cs-btn"
                      style={{ flex: '1 1 120px' }}
                      onClick={() => {
                        const c = newCharacter({
                          name: String(result.name || t('Character')),
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
                      {t('Export PNG')}
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
