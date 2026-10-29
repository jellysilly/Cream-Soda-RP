import { useEffect, useMemo, useState } from 'react';
import { useStore, upsert, removeItem, updateSettingsSection, toast } from '../../lib/store';
import { Field, Switch, TagInput, Check, RangeField, confirmDialog, Empty, openMenu } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newLorebook, newWorldEntry } from '../../lib/defaults';
import type { Lorebook, Role, WILogic, WIPosition, WorldEntry } from '../../lib/types';
import { POSITION_LABELS, LOGIC_LABELS } from '../../lib/worldinfo';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, uid } from '../../lib/utils';
import { importLorebooksInteractive, exportLorebook } from '../../lib/appActions';
import { regexError } from '../../lib/regex';
import { locale, t, tn } from '../../lib/i18n';

function EntryEditor({ e, onChange, onDelete, onDuplicate, open, onToggle }: { e: WorldEntry; onChange: (p: Partial<WorldEntry>) => void; onDelete: () => void; onDuplicate: () => void; open: boolean; onToggle: () => void }) {
  const tokens = useMemo(() => countTokens(e.content), [e.content]);
  const badKeys = [...e.keys, ...e.secondaryKeys].filter((k) => /^\/.+\/[a-z]*$/.test(k) && regexError(k));
  return (
    <div className={`cs-entry${e.enabled ? '' : ' cs-entry--off'}`}>
      <div className="cs-entry__head">
        <span className={`cs-dot${e.constant ? ' cs-dot--amber' : ''}${e.enabled ? '' : ' cs-dot--off'}`} title={e.constant ? t('Constant entry') : t('By keys')} />
        <button type="button" className="cs-entry__title" onClick={onToggle} aria-expanded={open}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }} className="cs-ellipsis">
            {e.comment || t('Untitled')}
          </span>
          <span style={{ display: 'block', font: '400 11px var(--cs-font-mono)', color: 'var(--cs-muted)' }} className="cs-ellipsis">
            {e.constant ? t('always') : e.keys.join(', ') || t('no keys')}
            {e.secondaryKeys.length ? ` · ${LOGIC_LABELS[e.selectiveLogic].toLowerCase()} ${e.secondaryKeys.join(', ')}` : ''}
          </span>
        </button>
        <span className="cs-pill cs-pill--mono">{fmtNum(tokens)}</span>
        <Switch checked={e.enabled} onChange={(enabled) => onChange({ enabled })} label={e.enabled ? t('Turn the entry off') : t('Turn the entry on')} />
        <button
          type="button"
          className="cs-icon-btn cs-icon-btn--soft"
          aria-label={t('Actions')}
          onClick={(ev) =>
            openMenu(ev.currentTarget, [
              { label: t('Duplicate'), icon: 'copy', onClick: onDuplicate },
              { label: t('Delete'), icon: 'trash', danger: true, onClick: onDelete },
            ])
          }
        >
          <Icon name="dots" size={16} />
        </button>
      </div>
      {open ? (
        <div className="cs-entry__body">
          <Field label={t('Title (for yourself)')}>
            <input className="cs-input" value={e.comment} onChange={(ev) => onChange({ comment: ev.target.value })} />
          </Field>
          <Field label={t('Keys · comma-separated, /regexes/ work too')}>
            <TagInput value={e.keys} onChange={(keys) => onChange({ keys })} />
          </Field>
          <div className="cs-grid-fields">
            <Field label={t('Secondary keys')}>
              <TagInput value={e.secondaryKeys} onChange={(secondaryKeys) => onChange({ secondaryKeys })} placeholder={t('+ 2nd key')} />
            </Field>
            <Field label={t('Secondary key logic')}>
              <select className="cs-select" value={e.selectiveLogic} onChange={(ev) => onChange({ selectiveLogic: Number(ev.target.value) as WILogic })}>
                {Object.entries(LOGIC_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {badKeys.length ? <p className="cs-hint" style={{ color: 'var(--cs-rose-deep)' }}>{t('Error in the regex:')} {badKeys.join(', ')}</p> : null}
          <Field label={t('Content · {tokens} tok.', { tokens: fmtNum(tokens) })}>
            <textarea className="cs-textarea" rows={5} value={e.content} onChange={(ev) => onChange({ content: ev.target.value })} />
          </Field>
          <div className="cs-grid-fields">
            <Field label={t('Position')}>
              <select className="cs-select" value={e.position} onChange={(ev) => onChange({ position: Number(ev.target.value) as WIPosition })}>
                {Object.entries(POSITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            {e.position === 4 ? (
              <>
                <Field label={t('Depth')}>
                  <input className="cs-input" type="number" min={0} value={e.depth} onChange={(ev) => onChange({ depth: Math.max(0, Number(ev.target.value)) })} />
                </Field>
                <Field label={t('Role')}>
                  <select className="cs-select" value={e.role} onChange={(ev) => onChange({ role: ev.target.value as Role })}>
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                </Field>
              </>
            ) : null}
            {e.position === 7 ? (
              <Field label={t('Outlet name')}>
                <input className="cs-input cs-input--mono" value={e.outletName} placeholder={t('e.g. weather')} onChange={(ev) => onChange({ outletName: ev.target.value })} />
              </Field>
            ) : null}
            <Field label={t('Order')} hint={t('Higher means more important and closer to the end')}>
              <input className="cs-input" type="number" value={e.order} onChange={(ev) => onChange({ order: Number(ev.target.value) })} />
            </Field>
          </div>
          <div className="cs-chips">
            <Check chip checked={e.constant} onChange={(constant) => onChange({ constant })}>
              {t('Always (no keys)')}
            </Check>
            <Check chip checked={e.useProbability} onChange={(useProbability) => onChange({ useProbability })}>
              {t('Chance')}
            </Check>
            <Check chip checked={!!e.caseSensitive} onChange={(v) => onChange({ caseSensitive: v ? true : null })}>
              {t('Case-sensitive')}
            </Check>
            <Check chip checked={!!e.matchWholeWords} onChange={(v) => onChange({ matchWholeWords: v ? true : null })}>
              {t('Whole words')}
            </Check>
            <Check chip checked={e.excludeRecursion} onChange={(excludeRecursion) => onChange({ excludeRecursion })}>
              {t('Not activated by recursion')}
            </Check>
            <Check chip checked={e.preventRecursion} onChange={(preventRecursion) => onChange({ preventRecursion })}>
              {t("Don't start recursion")}
            </Check>
            <Check chip checked={e.delayUntilRecursion} onChange={(delayUntilRecursion) => onChange({ delayUntilRecursion })}>
              {t('Only by recursion')}
            </Check>
          </div>
          {e.useProbability ? <RangeField label={t('Probability, %')} value={e.probability} min={0} max={100} onChange={(probability) => onChange({ probability })} /> : null}
          <details className="cs-details">
            <summary>{t('Groups and timing')}</summary>
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label={t('Group')} honey hint={t('Only one entry of the group fires')}>
                <input className="cs-input" value={e.group} onChange={(ev) => onChange({ group: ev.target.value })} />
              </Field>
              <Field label={t('Weight in the group')} honey>
                <input className="cs-input" type="number" min={1} value={e.groupWeight} onChange={(ev) => onChange({ groupWeight: Math.max(1, Number(ev.target.value)) })} />
              </Field>
              <Field label={t('Scan depth')} honey hint={t('Empty means as set globally')}>
                <input
                  className="cs-input"
                  type="number"
                  min={0}
                  value={e.scanDepth ?? ''}
                  onChange={(ev) => onChange({ scanDepth: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })}
                />
              </Field>
              <Field label={t('Sticky, turns')} honey>
                <input className="cs-input" type="number" min={0} value={e.sticky} onChange={(ev) => onChange({ sticky: Math.max(0, Number(ev.target.value)) })} />
              </Field>
              <Field label={t('Cooldown')} honey>
                <input className="cs-input" type="number" min={0} value={e.cooldown} onChange={(ev) => onChange({ cooldown: Math.max(0, Number(ev.target.value)) })} />
              </Field>
              <Field label={t('Delay')} honey hint={t('Not before N messages')}>
                <input className="cs-input" type="number" min={0} value={e.delay} onChange={(ev) => onChange({ delay: Math.max(0, Number(ev.target.value)) })} />
              </Field>
            </div>
            <Check checked={e.groupOverride} onChange={(groupOverride) => onChange({ groupOverride })}>
              {t('Group priority (wins by order)')}
            </Check>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function ScanSettings() {
  const wi = useStore((s) => s.settings.worldInfo);
  const set = (p: Partial<typeof wi>) => updateSettingsSection('worldInfo', p);
  return (
    <details className="cs-details">
      <summary>{t('Scan settings')}</summary>
      <div className="cs-samplers" style={{ background: 'transparent', padding: 0 }}>
        <RangeField label={t('Scan depth, messages')} value={wi.scanDepth} min={0} max={50} onChange={(scanDepth) => set({ scanDepth })} />
        <RangeField label={t('Budget, % of context')} value={wi.budgetPercent} min={1} max={100} onChange={(budgetPercent) => set({ budgetPercent })} />
        <RangeField label={t('Budget cap, tok. (0 means none)')} value={wi.budgetCap} min={0} max={16000} step={100} onChange={(budgetCap) => set({ budgetCap })} />
        <RangeField label={t('Recursion steps (0 means no limit)')} value={wi.maxRecursionSteps} min={0} max={10} onChange={(maxRecursionSteps) => set({ maxRecursionSteps })} />
      </div>
      <div className="cs-chips" style={{ marginTop: 10 }}>
        <Check chip checked={wi.recursive} onChange={(recursive) => set({ recursive })}>
          {t('Recursive scan')}
        </Check>
        <Check chip checked={wi.includeNames} onChange={(includeNames) => set({ includeNames })}>
          {t('Match names')}
        </Check>
        <Check chip checked={wi.caseSensitive} onChange={(caseSensitive) => set({ caseSensitive })}>
          {t('Case-sensitive by default')}
        </Check>
        <Check chip checked={wi.matchWholeWords} onChange={(matchWholeWords) => set({ matchWholeWords })}>
          {t('Whole words by default')}
        </Check>
      </div>
    </details>
  );
}

export function LorebooksTab({ query }: { query: string }) {
  const worlds = useStore((s) => s.worlds);
  const globalIds = useStore((s) => s.settings.worldInfo.globalWorldIds);
  const characters = useStore((s) => s.characters);
  const param = useStore((s) => s.routeParam);
  const [sel, setSel] = useState(() => param.replace(/^lore:/, '') || worlds[0]?.id || '');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'manual' | 'order' | 'title'>('manual');
  useEffect(() => {
    const m = /^lore:(.+)$/.exec(param);
    if (m) setSel(m[1]);
  }, [param]);

  const book = worlds.find((w) => w.id === sel);
  const q = query.trim().toLowerCase();
  const setBook = (patch: Partial<Lorebook>) => book && upsert('worlds', { ...book, ...patch });
  const setEntry = (uidv: string, patch: Partial<WorldEntry>) => book && setBook({ entries: book.entries.map((e) => (e.uid === uidv ? { ...e, ...patch } : e)) });

  const entries = useMemo(() => {
    if (!book) return [];
    let list = book.entries.filter((e) => !q || [e.comment, e.content, ...e.keys, ...e.secondaryKeys].join(' ').toLowerCase().includes(q));
    if (sort === 'order') list = [...list].sort((a, b) => b.order - a.order);
    if (sort === 'title') list = [...list].sort((a, b) => a.comment.localeCompare(b.comment, locale()));
    return list;
  }, [book, q, sort]);

  const usedBy = book ? characters.filter((c) => c.worldIds.includes(book.id)) : [];

  return (
    <div className="cs-columns">
      <section className="cs-panel cs-col-side" style={{ flex: '1 1 280px' }}>
        <div className="cs-panel-head">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            {t('Lorebooks')}
          </h2>
          <button type="button" className="cs-icon-btn cs-icon-btn--mint cs-ml-auto" style={{ width: 40, height: 40 }} aria-label={t('New lorebook')} onClick={() => setSel(upsert('worlds', newLorebook()).id)}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        {worlds.map((w) => (
          <button key={w.id} type="button" className="cs-select-item" aria-pressed={w.id === sel} onClick={() => setSel(w.id)}>
            <span className={`cs-dot${globalIds.includes(w.id) ? '' : ' cs-dot--off'}`} title={globalIds.includes(w.id) ? t('Global') : ''} />
            <span className="cs-grow">
              <span className="cs-select-item__title cs-ellipsis">{w.name}</span>
              <span className="cs-select-item__sub">
                {w.entries.length} {tn(w.entries.length, 'entry|entries')}
                {globalIds.includes(w.id) ? t(' · in all chats') : ''}
              </span>
            </span>
          </button>
        ))}
        {!worlds.length ? <Empty icon="memory" title={t('No lorebooks yet')} /> : null}
        <button
          type="button"
          className="cs-btn cs-btn--sm"
          onClick={async () => {
            const b = await importLorebooksInteractive();
            if (b) setSel(b.id);
          }}
        >
          <Icon name="download" size={16} /> {t('Import JSON')}
        </button>
        <ScanSettings />
      </section>

      {book ? (
        <section className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-main" style={{ flex: '999 1 520px' }}>
          <div className="cs-row cs-row--wrap">
            <input className="cs-input cs-input--title cs-grow" style={{ minWidth: 200 }} value={book.name} onChange={(e) => setBook({ name: e.target.value })} aria-label={t('Lorebook name')} />
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportLorebook(book)}>
              {t('Export')}
            </button>
            <button
              type="button"
              className="cs-icon-btn cs-icon-btn--soft"
              aria-label={t('Actions')}
              onClick={(e) =>
                openMenu(e.currentTarget, [
                  {
                    label: t('Duplicate'),
                    icon: 'copy',
                    onClick: () => setSel(upsert('worlds', { ...structuredClone(book), id: uid(), name: t('{name} (copy)', { name: book.name }) }).id),
                  },
                  {
                    label: t('Delete the lorebook'),
                    icon: 'trash',
                    danger: true,
                    onClick: async () => {
                      if (!(await confirmDialog(t('Delete the lorebook “{name}”?', { name: book.name }), { ok: t('Delete') }))) return;
                      await removeItem('worlds', book.id);
                      toast(t('Lorebook deleted'));
                      setSel(worlds.find((w) => w.id !== book.id)?.id || '');
                    },
                  },
                ])
              }
            >
              <Icon name="dots" size={18} />
            </button>
          </div>
          <Field label={t('Description')}>
            <input className="cs-input" value={book.description} onChange={(e) => setBook({ description: e.target.value })} />
          </Field>
          <div className="cs-row cs-row--wrap">
            <Check
              checked={globalIds.includes(book.id)}
              onChange={(on) => updateSettingsSection('worldInfo', { globalWorldIds: on ? [...globalIds, book.id] : globalIds.filter((x) => x !== book.id) })}
            >
              {t('Active in all chats')}
            </Check>
            {usedBy.length ? <span className="cs-hint">{t('Linked to:')} {usedBy.map((c) => c.name).join(', ')}</span> : null}
          </div>
          <div className="cs-row cs-row--wrap">
            <h3 className="cs-h3">{t('Entries ·')} {book.entries.length}</h3>
            <select className="cs-select cs-select--sm cs-ml-auto" style={{ width: 160 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('Entry sorting')}>
              <option value="manual">{t('As added')}</option>
              <option value="order">{t('By order')}</option>
              <option value="title">{t('By title')}</option>
            </select>
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => setOpenIds(openIds.size ? new Set() : new Set(book.entries.map((e) => e.uid)))}>
              {openIds.size ? t('Collapse all') : t('Expand all')}
            </button>
            <button
              type="button"
              className="cs-btn cs-btn--sm cs-btn--mint"
              onClick={() => {
                const e = newWorldEntry();
                setBook({ entries: [e, ...book.entries] });
                setOpenIds(new Set([...openIds, e.uid]));
              }}
            >
              <Icon name="plus" size={16} stroke={2.2} /> {t('Entry')}
            </button>
          </div>
          <div className="cs-col" style={{ gap: 8 }}>
            {entries.map((e) => (
              <EntryEditor
                key={e.uid}
                e={e}
                open={openIds.has(e.uid)}
                onToggle={() => {
                  const next = new Set(openIds);
                  if (next.has(e.uid)) next.delete(e.uid);
                  else next.add(e.uid);
                  setOpenIds(next);
                }}
                onChange={(p) => setEntry(e.uid, p)}
                onDuplicate={() => setBook({ entries: [...book.entries, { ...structuredClone(e), uid: uid(), comment: t('{comment} (copy)', { comment: e.comment }) }] })}
                onDelete={async () => {
                  if (await confirmDialog(t('Delete the entry “{comment}”?', { comment: e.comment }), { ok: t('Delete') })) setBook({ entries: book.entries.filter((x) => x.uid !== e.uid) });
                }}
              />
            ))}
            {!entries.length ? <Empty icon="memory" title={q ? t('Nothing found') : t('No entries yet')} /> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
