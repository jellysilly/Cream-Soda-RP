import { useEffect, useMemo, useState } from 'react';
import { useStore, upsert, removeItem, toast, activeCharacter, activePersona, getState } from '../../lib/store';
import { PageHead, Field, Switch, CodeEditor, TagInput, Choices, confirmDialog, openMenu, Empty, Check } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newRegex } from '../../lib/defaults';
import type { RegexPlacement, RegexScript } from '../../lib/types';
import { regexError, runRegexScript, countMatches, PLACEMENT_LABELS } from '../../lib/regex';
import { formatMessage } from '../../lib/markdown';
import { importRegexInteractive, exportRegex } from '../../lib/appActions';
import { ExtensionsSection } from '../modules/ExtensionsSection';
import { uid } from '../../lib/utils';
import { t, tn } from '../../lib/i18n';

type ScopeFilter = 'all' | 'global' | 'character' | 'preset';

function scopeLabel(r: RegexScript, names: { chars: Map<string, string>; presets: Map<string, string> }): string {
  const kind = r.renderHtml ? 'HTML' : r.markdownOnly ? t('display') : r.promptOnly ? t('to the prompt') : r.placement.includes(1) && !r.placement.includes(2) ? t('player input') : t('AI replies');
  if (r.scope.type === 'character') return t('card · {x} · {kind}', { x: names.chars.get(r.scope.id) || '?', kind });
  if (r.scope.type === 'preset') return t('preset · {x} · {kind}', { x: names.presets.get(r.scope.id) || '?', kind });
  return t('global · {kind}', { kind });
}

export default function RegexPage() {
  const regex = useStore((s) => s.regex);
  const characters = useStore((s) => s.characters);
  const presets = useStore((s) => s.presets);
  const param = useStore((s) => s.routeParam);
  const [filter, setFilter] = useState<ScopeFilter>(param.startsWith('char:') ? 'character' : 'all');
  const [sel, setSel] = useState(() => (param && !param.startsWith('char:') ? param : '') || [...regex].sort((a, b) => a.order - b.order)[0]?.id || '');
  useEffect(() => {
    if (param && !param.startsWith('char:') && regex.some((r) => r.id === param)) setSel(param);
  }, [param, regex]);

  const names = useMemo(() => ({ chars: new Map(characters.map((c) => [c.id, c.name])), presets: new Map(presets.map((p) => [p.id, p.name])) }), [characters, presets]);
  const charFilter = param.startsWith('char:') ? param.slice(5) : '';
  const list = regex
    .filter((r) => filter === 'all' || r.scope.type === filter)
    .filter((r) => !charFilter || (r.scope.type === 'character' && r.scope.id === charFilter) || filter === 'all')
    .sort((a, b) => (a.scope.type === b.scope.type ? a.order - b.order : a.scope.type === 'global' ? -1 : 1));
  const r = regex.find((x) => x.id === sel);
  const set = (patch: Partial<RegexScript>) => r && upsert('regex', { ...r, ...patch });

  const env = useMemo(() => ({ user: activePersona()?.name || t('Yuki'), char: activeCharacter()?.name || t('Rin') }), []);
  const test = r?.testInput || '';
  const result = useMemo(() => {
    if (!r) return { html: '', count: 0, error: '' };
    const error = regexError(r.findRegex);
    if (error) return { html: '', count: 0, error };
    const out = runRegexScript(r, test, env);
    return { html: formatMessage(out, { markdown: true, html: r.renderHtml || getState().settings.chat.renderHtml }), count: countMatches(r, test, env), error: '' };
  }, [r, test, env]);

  const togglePlacement = (p: RegexPlacement) => r && set({ placement: r.placement.includes(p) ? r.placement.filter((x) => x !== p) : [...r.placement, p] });

  return (
    <div className="cs-page">
      <PageHead title={t('Regexes and HTML')} kana="レシピ" sub={t('Text replacements, rendering of HTML blocks in messages, and modules')}>
        <div className="cs-row cs-row--wrap">
          <button type="button" className="cs-btn" onClick={() => importRegexInteractive()}>
            {t('Import')}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            onClick={() => {
              const n = upsert(
                'regex',
                newRegex({
                  name: t('New regex'),
                  scope: charFilter ? { type: 'character', id: charFilter } : { type: 'global' },
                  order: (regex.length + 1) * 10,
                  findRegex: t('/example/gi'),
                  replaceString: '**$0**',
                  testInput: t('This is a sample text for testing.'),
                }),
              );
              setSel(n.id);
            }}
          >
            {t('New regex')}
          </button>
        </div>
      </PageHead>

      <div className="cs-columns">
        <section aria-label={t('Scripts')} className="cs-panel" style={{ flex: '1 1 260px', minWidth: 0, gap: 8 }}>
          <div className="cs-panel-head">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Scripts')}
            </h2>
            <select className="cs-select cs-select--sm cs-ml-auto" style={{ width: 124 }} value={filter} onChange={(e) => setFilter(e.target.value as ScopeFilter)} aria-label={t('Filter')}>
              <option value="all">{t('All')}</option>
              <option value="global">{t('Global')}</option>
              <option value="character">{t('Of characters')}</option>
              <option value="preset">{t('Of presets')}</option>
            </select>
          </div>
          {list.map((x) => (
            <button key={x.id} type="button" className="cs-select-item" aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
              <span className={`cs-dot${x.disabled ? ' cs-dot--off' : ''}`} />
              <span className="cs-grow" style={{ minWidth: 0 }}>
                <span className="cs-select-item__title cs-ellipsis">{x.name}</span>
                <span className="cs-select-item__sub cs-ellipsis">{scopeLabel(x, names)}</span>
              </span>
            </button>
          ))}
          {!list.length ? <Empty icon="regex" title={t('No scripts')} /> : null}
          {regex.length ? (
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportRegex(list.map((x) => x.id))}>
              {t('Export the list')}
            </button>
          ) : null}
        </section>

        {r ? (
          <section aria-label={t('Editor')} className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '999 1 460px', minWidth: 0 }}>
            <div className="cs-row cs-row--wrap">
              <input className="cs-input cs-input--title cs-grow" style={{ minWidth: 180 }} value={r.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('Title')} />
              <Switch checked={!r.disabled} label={r.disabled ? t('Turn on') : t('Turn off')} onChange={(v) => set({ disabled: !v })} />
              <button
                type="button"
                className="cs-icon-btn cs-icon-btn--soft"
                aria-label={t('Actions')}
                onClick={(e) =>
                  openMenu(e.currentTarget, [
                    { label: t('Export'), icon: 'upload', onClick: () => exportRegex([r.id]) },
                    { label: t('Duplicate'), icon: 'copy', onClick: () => setSel(upsert('regex', { ...structuredClone(r), id: uid(), name: t('{name} (copy)', { name: r.name }) }).id) },
                    {
                      label: t('Delete'),
                      icon: 'trash',
                      danger: true,
                      onClick: async () => {
                        if (!(await confirmDialog(t('Delete the regex “{name}”?', { name: r.name }), { ok: t('Delete') }))) return;
                        await removeItem('regex', r.id);
                        toast(t('Regex deleted'));
                        setSel(regex.find((x) => x.id !== r.id)?.id || '');
                      },
                    },
                  ])
                }
              >
                <Icon name="dots" size={18} />
              </button>
            </div>
            <div className="cs-grid-fields">
              <Field label={t('Where it applies')}>
                <select
                  className="cs-select"
                  value={r.scope.type === 'global' ? 'global' : `${r.scope.type}:${r.scope.id}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'global') set({ scope: { type: 'global' } });
                    else {
                      const [type, id] = v.split(':');
                      set({ scope: { type: type as 'character' | 'preset', id } });
                    }
                  }}
                >
                  <option value="global">{t('Globally')}</option>
                  <optgroup label={t('Character')}>
                    {characters.map((c) => (
                      <option key={c.id} value={`character:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t('Preset')}>
                    {presets.map((p) => (
                      <option key={p.id} value={`preset:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              <Field label={t('Order')}>
                <input className="cs-input" type="number" value={r.order} onChange={(e) => set({ order: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={t('Find')} hint={result.error ? <span style={{ color: 'var(--cs-rose-deep)' }}>{result.error}</span> : t('Format /pattern/flags. For example: /\\[status\\|(.+?)\\]/g')}>
              <input className="cs-input cs-input--mono" value={r.findRegex} onChange={(e) => set({ findRegex: e.target.value })} spellCheck={false} />
            </Field>
            <div className="cs-col" style={{ gap: 6 }}>
              <span className="cs-label">{t('Replace with')}{r.renderHtml ? t(' · HTML template') : ''}</span>
              <CodeEditor value={r.replaceString} lang={r.renderHtml ? 'html' : 'text'} minHeight={120} onChange={(replaceString) => set({ replaceString })} label={t('Replacement')} />
              <span className="cs-hint">{t('$1, $2… are groups; {x} is the whole match; the {x2} and {x3} macros work.', { x: '{{match}}', x2: '{{char}}', x3: '{{user}}' })}</span>
            </div>
            <div className="cs-col" style={{ gap: 6 }}>
              <span className="cs-label">{t('Apply to')}</span>
              <div className="cs-chips">
                {([2, 1, 3, 5, 6] as RegexPlacement[]).map((p) => (
                  <Check key={p} chip checked={r.placement.includes(p)} onChange={() => togglePlacement(p)}>
                    {PLACEMENT_LABELS[p]}
                  </Check>
                ))}
              </div>
            </div>
            <div className="cs-col" style={{ gap: 6 }}>
              <span className="cs-label">{t('How')}</span>
              <Choices<'store' | 'display' | 'prompt'>
                small
                value={r.markdownOnly ? 'display' : r.promptOnly ? 'prompt' : 'store'}
                onChange={(v) => set({ markdownOnly: v === 'display', promptOnly: v === 'prompt' })}
                items={[
                  { id: 'store', label: t('Change the text itself') },
                  { id: 'display', label: t('Display only') },
                  { id: 'prompt', label: t('Prompt only') },
                ]}
              />
              <div className="cs-chips">
                <Check chip checked={r.renderHtml} onChange={(renderHtml) => set({ renderHtml })}>
                  {t('Render HTML')}
                </Check>
                <Check chip checked={r.runOnEdit} onChange={(runOnEdit) => set({ runOnEdit })}>
                  {t('When a message is edited')}
                </Check>
              </div>
            </div>
            <details className="cs-details">
              <summary>{t('Advanced')}</summary>
              <div className="cs-grid-fields">
                <Field label={t('Macros in “Find”')} honey>
                  <select className="cs-select" value={r.substituteRegex} onChange={(e) => set({ substituteRegex: Number(e.target.value) as 0 | 1 | 2 })}>
                    <option value={0}>{t("Don't substitute")}</option>
                    <option value={1}>{t('Substitute as is')}</option>
                    <option value={2}>{t('Substitute escaped')}</option>
                  </select>
                </Field>
                <Field label={t('Min. depth')} honey hint={t('0 is the last message')}>
                  <input className="cs-input" type="number" min={-1} value={r.minDepth ?? ''} onChange={(e) => set({ minDepth: e.target.value === '' ? null : Number(e.target.value) })} />
                </Field>
                <Field label={t('Max. depth')} honey>
                  <input className="cs-input" type="number" min={-1} value={r.maxDepth ?? ''} onChange={(e) => set({ maxDepth: e.target.value === '' ? null : Number(e.target.value) })} />
                </Field>
              </div>
              <Field label={t('Trim out of groups')} honey>
                <TagInput value={r.trimStrings} onChange={(trimStrings) => set({ trimStrings })} placeholder={t('+ string')} />
              </Field>
            </details>
            <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div className="cs-col" style={{ gap: 6 }}>
                <span className="cs-label">{t('Test · source text')}</span>
                <textarea className="cs-test-src" value={r.testInput} rows={6} onChange={(e) => set({ testInput: e.target.value })} spellCheck={false} />
              </div>
              <div className="cs-col" style={{ gap: 6 }}>
                <span className="cs-label">{t('Result in the chat')}</span>
                <div className="cs-result-box">
                  <div className="cs-msg-text" dangerouslySetInnerHTML={{ __html: result.html }} />
                </div>
                <span className="cs-row" style={{ gap: 6, fontSize: 12, fontWeight: 700, color: result.count ? 'var(--cs-mint-ink)' : 'var(--cs-muted)' }}>
                  <span className={`cs-dot cs-dot--sm${result.count ? '' : ' cs-dot--off'}`} />
                  {t('{count} {x} · HTML in a sandbox, scripts are off', { count: result.count, x: tn(result.count, 'match|matches') })}
                </span>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <ExtensionsSection />
    </div>
  );
}
