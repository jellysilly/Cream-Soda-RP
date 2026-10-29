import { useState } from 'react';
import { useStore, setChat, updateSettingsSection, navigate, toastError, updateSettings } from '../../lib/store';
import { PageHead, Field, TagInput, Switch, Empty, confirmDialog, openMenu, RangeField } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { chapterLabel, chapterNumber, chapterRange, memoryTokens, pendingRange } from '../../lib/memory';
import { summarizeChapter } from '../../lib/generate';
import { exportMemory, goToMessage, importMemoryInteractive, memoryToLorebook } from '../../lib/appActions';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, uid } from '../../lib/utils';
import type { MemoryChapter } from '../../lib/types';
import { t, tn } from '../../lib/i18n';
import { PromptEditor } from '../../components/PromptEditor';

export default function MemoryPage() {
  const chat = useStore((s) => s.chat);
  const settings = useStore((s) => s.settings.memory);
  const connections = useStore((s) => s.connections);
  const memoryProfile = useStore((s) => s.settings.profileFor.memory);
  const busy = useStore((s) => s.gen.kind === 'memory');
  const [sel, setSel] = useState<string>('pending');

  if (!chat) {
    return (
      <div className="cs-page">
        <PageHead title="Memory Book" kana="メモリー" sub={t('Chapters, facts and links the model remembers once the story stops fitting into the context')} />
        <section className="cs-panel">
          <Empty icon="memory" title={t('Open a chat')}>
            {t('The Memory Book is kept separately for each chat.')}
            <button type="button" className="cs-btn cs-btn--primary" onClick={() => navigate('library')}>
              {t('Pick a character')}
            </button>
          </Empty>
        </section>
      </div>
    );
  }

  const mem = chat.meta.memory;
  const done = mem.chapters.filter((c) => c.status === 'memory');
  const pend = pendingRange(chat);
  const n = chapterNumber(mem);
  const current = mem.chapters.find((c) => c.id === sel);
  const used = memoryTokens(chat);
  const setMem = (patch: Partial<typeof mem>) => setChat((c) => ({ ...c, meta: { ...c.meta, memory: { ...c.meta.memory, ...patch } } }));
  const setChapter = (id: string, patch: Partial<MemoryChapter>) => setMem({ chapters: mem.chapters.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)) });

  const compress = () => summarizeChapter().catch((e) => toastError(e, 'Memory Book'));

  return (
    <div className="cs-page">
      <PageHead
        title="Memory Book"
        extra={<span className="cs-serif" style={{ fontSize: 16, color: 'var(--cs-muted)' }}>«{chat.title}»</span>}
        sub={t('Chapters, facts and links the model remembers once the story stops fitting into the context')}
      >
        <div className="cs-row cs-row--wrap">
          <button
            type="button"
            className="cs-btn"
            onClick={(e) =>
              openMenu(e.currentTarget, [
                { label: t('To a lorebook'), icon: 'memory', onClick: () => memoryToLorebook(chat) },
                { label: t('Export · JSON'), icon: 'upload', onClick: () => exportMemory(chat, 'json') },
                { label: t('Export · Markdown'), icon: 'upload', onClick: () => exportMemory(chat, 'md') },
                { label: t('Import · JSON'), icon: 'download', onClick: importMemoryInteractive },
              ])
            }
          >
            {t('Export to a lorebook')}
          </button>
          <button type="button" className="cs-btn cs-btn--mint" disabled={busy || !pend.count} onClick={compress}>
            {busy ? <span className="cs-spinner" /> : null}
            {t('Condense chapter {n}', { n })}
          </button>
        </div>
      </PageHead>

      <div className="cs-columns">
        <section aria-label={t('Chapters')} className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 300px', gap: 0 }}>
          <h2 className="cs-h2" style={{ marginBottom: 14 }}>
            {t('Chapters')}
          </h2>
          {mem.chapters.map((c, i) => {
            const label = chapterLabel(chat, c);
            const range = chapterRange(chat, c);
            return (
              <div key={c.id} className="cs-timeline-item">
                <div className="cs-timeline-rail" aria-hidden="true">
                  <span className="cs-timeline-dot" style={{ background: c.status === 'memory' ? 'var(--cs-mint)' : 'var(--cs-amber)' }} />
                  <span className="cs-timeline-line" />
                </div>
                <button type="button" className="cs-timeline-card" aria-pressed={sel === c.id} onClick={() => setSel(c.id)}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--cs-link)' }}>
                    {t('CHAPTER {i} · {label}', { i: i + 1, label })}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--cs-font-heading)', fontSize: 15, fontWeight: 800, marginTop: 2 }}>{c.title}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)', marginTop: 4 }}>
                    {t('{x} tok. · {n} {x2}', { x: fmtNum(countTokens(c.summary)), n: c.keys.length, x2: tn(c.keys.length, 'key|keys') })}
                    {c.insertion === 'off' ? t(' · off') : ''}
                    {!range ? t(' · messages deleted') : ''}
                  </span>
                </button>
              </div>
            );
          })}
          <div className="cs-timeline-item">
            <div className="cs-timeline-rail" aria-hidden="true">
              <span className="cs-timeline-dot" style={{ background: 'var(--cs-amber)' }} />
            </div>
            <button type="button" className="cs-timeline-card" aria-pressed={sel === 'pending'} onClick={() => setSel('pending')}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--cs-link)' }}>
                {t('CHAPTER {n} · #{start}–{n2}', { n, start: pend.start + 1, n2: chat.messages.length })}
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--cs-font-heading)', fontSize: 15, fontWeight: 800, marginTop: 2 }}>{t('Happening now')}</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)', marginTop: 4 }}>
                {t('ongoing · {count} {x}', { count: pend.count, x: tn(pend.count, 'message|messages') })}
              </span>
            </button>
          </div>
        </section>

        <section aria-label={t('Entry')} className="cs-memory-entry" style={{ flex: '999 1 420px', minWidth: 0 }}>
          <div className="cs-ticket__band cs-ticket__band--lg" aria-hidden="true" />
          {current ? (
            <div className="cs-col" style={{ padding: '22px 24px', gap: 14 }}>
              <div className="cs-row cs-row--wrap">
                <span className="cs-pill cs-pill--white">
                  {t('CHAPTER {x} · {x2}', { x: mem.chapters.indexOf(current) + 1, x2: chapterLabel(chat, current) })}
                </span>
                <span className={`cs-pill ${current.status === 'memory' ? 'cs-pill--mint' : ''}`}>{current.status === 'memory' ? t('in memory') : t('draft')}</span>
                <span className="cs-pill cs-pill--mono cs-ml-auto">{fmtNum(countTokens(current.summary))} {t('tok.')}</span>
              </div>
              <Field label={t('Title')} honey>
                <input className="cs-input cs-input--title" value={current.title} onChange={(e) => setChapter(current.id, { title: e.target.value })} />
              </Field>
              <Field label={t('Summary')} honey>
                <textarea className="cs-textarea cs-textarea--lg" rows={6} value={current.summary} onChange={(e) => setChapter(current.id, { summary: e.target.value })} />
              </Field>
              <div className="cs-col" style={{ gap: 6 }}>
                <span className="cs-label cs-label--honey">{t('Keys · pull the entry in when mentioned')}</span>
                <TagInput value={current.keys} onChange={(keys) => setChapter(current.id, { keys })} />
              </div>
              <div className="cs-grid-fields">
                <Field label={t('Insertion')} honey>
                  <select className="cs-select" value={current.insertion} onChange={(e) => setChapter(current.id, { insertion: e.target.value as MemoryChapter['insertion'] })}>
                    <option value="always">{t('Always')}</option>
                    <option value="keys">{t('Only by keys')}</option>
                    <option value="off">{t('Off')}</option>
                  </select>
                </Field>
                <Field label={t('Importance · {importance}', { importance: current.importance })} honey>
                  <input type="range" min={1} max={5} value={current.importance} style={{ accentColor: 'var(--cs-accent)', marginTop: 12 }} onChange={(e) => setChapter(current.id, { importance: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="cs-row cs-row--wrap">
                <button
                  type="button"
                  className="cs-btn"
                  disabled={busy}
                  onClick={() => {
                    const r = chapterRange(chat, current);
                    if (!r) return toastError(new Error(t("The messages of this chapter were deleted, so it can't be re-condensed")));
                    summarizeChapter({ start: r[0], end: r[1] }, current.id).catch((e) => toastError(e));
                  }}
                >
                  {t('Re-condense')}
                </button>
                <button type="button" className="cs-btn" onClick={() => goToMessage(current.fromId)}>
                  {t('Go to the messages')}
                </button>
                <button
                  type="button"
                  className="cs-btn cs-btn--danger"
                  onClick={async () => {
                    if (await confirmDialog(t('Delete the chapter “{title}”? The chat messages will stay.', { title: current.title }), { ok: t('Delete') })) {
                      setMem({ chapters: mem.chapters.filter((c) => c.id !== current.id) });
                      setSel('pending');
                    }
                  }}
                >
                  {t('Delete')}
                </button>
                <button type="button" className="cs-btn cs-btn--primary cs-ml-auto" onClick={() => setChapter(current.id, { status: 'memory' })}>
                  {t('Save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="cs-col" style={{ padding: '22px 24px', gap: 14 }}>
              <div className="cs-row">
                <span className="cs-pill cs-pill--white">
                  {t('CHAPTER {n} · #{start}–{n2}', { n, start: pend.start + 1, n2: chat.messages.length })}
                </span>
                <span className="cs-pill">{t('draft')}</span>
              </div>
              <h2 className="cs-h2">{t('Chapter {n} is still being written', { n })}</h2>
              <p style={{ lineHeight: 1.55 }}>
                {t('It has {count} {x}. When the scene ends, condense it: the model writes a title, a summary and keys, and the messages themselves can then be hidden from the context while the story stays in memory.', { count: pend.count, x: tn(pend.count, 'message|messages') })}
              </p>
              <div className="cs-row cs-row--wrap">
                <button type="button" className="cs-btn cs-btn--mint" disabled={busy || !pend.count} onClick={compress}>
                  {busy ? <span className="cs-spinner" /> : null}
                  {t('Condense chapter {n} into an entry', { n })}
                </button>
                <button
                  type="button"
                  className="cs-btn"
                  onClick={() => {
                    const first = chat.messages[pend.start];
                    const last = chat.messages[chat.messages.length - 1];
                    if (!first || !last) return;
                    const ch: MemoryChapter = { id: uid(), title: t('Chapter {n}', { n }), fromId: first.id, toId: last.id, summary: '', keys: [], insertion: 'always', importance: 3, status: 'draft', updatedAt: Date.now() };
                    setMem({ chapters: [...mem.chapters, ch] });
                    setSel(ch.id);
                  }}
                >
                  {t('Write by hand')}
                </button>
                {done.length ? (
                  <button
                    type="button"
                    className="cs-btn"
                    onClick={() => {
                      const ids = new Set<string>();
                      for (const c of done) {
                        const r = chapterRange(chat, c);
                        if (r) for (let i = r[0]; i <= r[1]; i++) ids.add(chat.messages[i].id);
                      }
                      setChat((c) => ({ ...c, messages: c.messages.map((m) => (ids.has(m.id) ? { ...m, hidden: true } : m)) }));
                    }}
                  >
                    {t('Hide condensed messages from the context')}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <aside className="cs-col-side cs-stack-gap" style={{ flex: '1 1 300px' }}>
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Pinned facts')}
            </h2>
            {mem.facts.map((f) => (
              <div key={f.id} className={`cs-fact${f.enabled ? '' : ' cs-fact--off'}`}>
                <textarea
                  rows={Math.max(1, Math.ceil(f.text.length / 34))}
                  value={f.text}
                  aria-label={t('Fact')}
                  onChange={(e) => setMem({ facts: mem.facts.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)) })}
                />
                <Switch checked={f.enabled} label={f.enabled ? t("Don't send the fact") : t('Send the fact')} onChange={(enabled) => setMem({ facts: mem.facts.map((x) => (x.id === f.id ? { ...x, enabled } : x)) })} />
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label={t('Delete the fact')} onClick={() => setMem({ facts: mem.facts.filter((x) => x.id !== f.id) })}>
                  <Icon name="close" size={12} stroke={2.4} />
                </button>
              </div>
            ))}
            {mem.facts.some((f) => !f.enabled) ? <p className="cs-hint">{t("Facts that are off are the model's suggestions: turn on the ones you want.")}</p> : null}
            <button type="button" className="cs-btn cs-btn--dashed" onClick={() => setMem({ facts: [...mem.facts, { id: uid(), text: '', enabled: true }] })}>
              {t('+ fact')}
            </button>
          </section>
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Automation')}
            </h2>
            <label className="cs-check cs-check--row">
              {t('Condense every')}
              <select className="cs-select cs-select--sm" value={settings.autoEvery} onChange={(e) => updateSettingsSection('memory', { autoEvery: Number(e.target.value) })}>
                <option value={20}>{t('20 messages')}</option>
                <option value={40}>{t('40 messages')}</option>
                <option value={60}>{t('60 messages')}</option>
                <option value={0}>{t('manual')}</option>
              </select>
            </label>
            <label className="cs-check cs-check--row">
              {t('Model for summaries')}
              <select className="cs-select cs-select--sm" value={memoryProfile} onChange={(e) => updateSettings((s) => ({ profileFor: { ...s.profileFor, memory: e.target.value } }))}>
                <option value="">{t('same as the chat')}</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cs-check">
              <input type="checkbox" checked={settings.suggestFacts} onChange={(e) => updateSettingsSection('memory', { suggestFacts: e.target.checked })} />
              {t('Suggest new facts')}
            </label>
            <div className="cs-col" style={{ gap: 6 }}>
              <div className="cs-row" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)' }}>
                <span>{t('Memory budget')}</span>
                <span>
                  {t('{used} / {budget} tok.', { used: fmtNum(used), budget: fmtNum(settings.budget) })}
                </span>
              </div>
              <div className={`cs-progress${used > settings.budget ? ' cs-progress--over' : ''}`}>
                <span style={{ width: `${Math.min(100, (used / Math.max(1, settings.budget)) * 100)}%` }} />
              </div>
            </div>
            <RangeField label={t('Budget, tok.')} value={settings.budget} min={200} max={8000} step={100} onChange={(budget) => updateSettingsSection('memory', { budget })} />
            <details className="cs-details">
              <summary>{t('Memory Book prompts')}</summary>
              <PromptEditor id="memorySummary" rows={6} />
              <PromptEditor id="memoryFacts" rows={5} />
              <PromptEditor id="memoryBlock" rows={3} />
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
