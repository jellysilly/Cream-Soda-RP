import { useState } from 'react';
import { useStore, setChat, updateSettingsSection, navigate, toastError, updateSettings } from '../../lib/store';
import { PageHead, Field, TagInput, Switch, Empty, confirmDialog, openMenu, RangeField } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { chapterLabel, chapterNumber, chapterRange, memoryTokens, pendingRange } from '../../lib/memory';
import { summarizeChapter } from '../../lib/generate';
import { exportMemory, goToMessage, importMemoryInteractive, memoryToLorebook } from '../../lib/appActions';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, plural, uid } from '../../lib/utils';
import type { MemoryChapter } from '../../lib/types';

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
        <PageHead title="Memory Book" kana="メモリー" sub="Главы, факты и связи, которые модель помнит, когда история перестаёт помещаться в контекст" />
        <section className="cs-panel">
          <Empty icon="memory" title="Откройте чат">
            Memory Book ведётся отдельно для каждого чата.
            <button type="button" className="cs-btn cs-btn--primary" onClick={() => navigate('library')}>
              Выбрать персонажа
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
        sub="Главы, факты и связи, которые модель помнит, когда история перестаёт помещаться в контекст"
      >
        <div className="cs-row cs-row--wrap">
          <button
            type="button"
            className="cs-btn"
            onClick={(e) =>
              openMenu(e.currentTarget, [
                { label: 'В лорбук', icon: 'memory', onClick: () => memoryToLorebook(chat) },
                { label: 'Экспорт · JSON', icon: 'upload', onClick: () => exportMemory(chat, 'json') },
                { label: 'Экспорт · Markdown', icon: 'upload', onClick: () => exportMemory(chat, 'md') },
                { label: 'Импорт · JSON', icon: 'download', onClick: importMemoryInteractive },
              ])
            }
          >
            Экспорт в лорбук
          </button>
          <button type="button" className="cs-btn cs-btn--mint" disabled={busy || !pend.count} onClick={compress}>
            {busy ? <span className="cs-spinner" /> : null}
            Сжать главу {n}
          </button>
        </div>
      </PageHead>

      <div className="cs-columns">
        <section aria-label="Главы" className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 300px', gap: 0 }}>
          <h2 className="cs-h2" style={{ marginBottom: 14 }}>
            Главы
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
                    ГЛАВА {i + 1} · {label}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--cs-font-heading)', fontSize: 15, fontWeight: 800, marginTop: 2 }}>{c.title}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)', marginTop: 4 }}>
                    {fmtNum(countTokens(c.summary))} ток. · {c.keys.length} {plural(c.keys.length, 'ключ', 'ключа', 'ключей')}
                    {c.insertion === 'off' ? ' · выкл.' : ''}
                    {!range ? ' · сообщения удалены' : ''}
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
                ГЛАВА {n} · #{pend.start + 1}–{chat.messages.length}
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--cs-font-heading)', fontSize: 15, fontWeight: 800, marginTop: 2 }}>Идёт сейчас</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)', marginTop: 4 }}>
                идёт · {pend.count} {plural(pend.count, 'сообщение', 'сообщения', 'сообщений')}
              </span>
            </button>
          </div>
        </section>

        <section aria-label="Запись" className="cs-memory-entry" style={{ flex: '999 1 420px', minWidth: 0 }}>
          <div className="cs-ticket__band cs-ticket__band--lg" aria-hidden="true" />
          {current ? (
            <div className="cs-col" style={{ padding: '22px 24px', gap: 14 }}>
              <div className="cs-row cs-row--wrap">
                <span className="cs-pill cs-pill--white">
                  ГЛАВА {mem.chapters.indexOf(current) + 1} · {chapterLabel(chat, current)}
                </span>
                <span className={`cs-pill ${current.status === 'memory' ? 'cs-pill--mint' : ''}`}>{current.status === 'memory' ? 'в памяти' : 'черновик'}</span>
                <span className="cs-pill cs-pill--mono cs-ml-auto">{fmtNum(countTokens(current.summary))} ток.</span>
              </div>
              <Field label="Название" honey>
                <input className="cs-input cs-input--title" value={current.title} onChange={(e) => setChapter(current.id, { title: e.target.value })} />
              </Field>
              <Field label="Конспект" honey>
                <textarea className="cs-textarea cs-textarea--lg" rows={6} value={current.summary} onChange={(e) => setChapter(current.id, { summary: e.target.value })} />
              </Field>
              <div className="cs-col" style={{ gap: 6 }}>
                <span className="cs-label cs-label--honey">Ключи · подтягивать запись при упоминании</span>
                <TagInput value={current.keys} onChange={(keys) => setChapter(current.id, { keys })} />
              </div>
              <div className="cs-grid-fields">
                <Field label="Вставка" honey>
                  <select className="cs-select" value={current.insertion} onChange={(e) => setChapter(current.id, { insertion: e.target.value as MemoryChapter['insertion'] })}>
                    <option value="always">Всегда</option>
                    <option value="keys">Только по ключам</option>
                    <option value="off">Отключено</option>
                  </select>
                </Field>
                <Field label={`Важность · ${current.importance}`} honey>
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
                    if (!r) return toastError(new Error('Сообщения этой главы удалены — пересжать не получится'));
                    summarizeChapter({ start: r[0], end: r[1] }, current.id).catch((e) => toastError(e));
                  }}
                >
                  Пересжать
                </button>
                <button type="button" className="cs-btn" onClick={() => goToMessage(current.fromId)}>
                  Перейти к сообщениям
                </button>
                <button
                  type="button"
                  className="cs-btn cs-btn--danger"
                  onClick={async () => {
                    if (await confirmDialog(`Удалить главу «${current.title}»? Сообщения чата останутся.`, { ok: 'Удалить' })) {
                      setMem({ chapters: mem.chapters.filter((c) => c.id !== current.id) });
                      setSel('pending');
                    }
                  }}
                >
                  Удалить
                </button>
                <button type="button" className="cs-btn cs-btn--primary cs-ml-auto" onClick={() => setChapter(current.id, { status: 'memory' })}>
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            <div className="cs-col" style={{ padding: '22px 24px', gap: 14 }}>
              <div className="cs-row">
                <span className="cs-pill cs-pill--white">
                  ГЛАВА {n} · #{pend.start + 1}–{chat.messages.length}
                </span>
                <span className="cs-pill">черновик</span>
              </div>
              <h2 className="cs-h2">Глава {n} ещё пишется</h2>
              <p style={{ lineHeight: 1.55 }}>
                В ней {pend.count} {plural(pend.count, 'сообщение', 'сообщения', 'сообщений')}. Когда сцена закончится, сожми её: модель напишет название, конспект и ключи, а сами сообщения
                можно будет скрыть из контекста — история останется в памяти.
              </p>
              <div className="cs-row cs-row--wrap">
                <button type="button" className="cs-btn cs-btn--mint" disabled={busy || !pend.count} onClick={compress}>
                  {busy ? <span className="cs-spinner" /> : null}
                  Сжать главу {n} в запись
                </button>
                <button
                  type="button"
                  className="cs-btn"
                  onClick={() => {
                    const first = chat.messages[pend.start];
                    const last = chat.messages[chat.messages.length - 1];
                    if (!first || !last) return;
                    const ch: MemoryChapter = { id: uid(), title: `Глава ${n}`, fromId: first.id, toId: last.id, summary: '', keys: [], insertion: 'always', importance: 3, status: 'draft', updatedAt: Date.now() };
                    setMem({ chapters: [...mem.chapters, ch] });
                    setSel(ch.id);
                  }}
                >
                  Написать вручную
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
                    Скрыть сжатые сообщения из контекста
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <aside className="cs-col-side cs-stack-gap" style={{ flex: '1 1 300px' }}>
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Закреплённые факты
            </h2>
            {mem.facts.map((f) => (
              <div key={f.id} className={`cs-fact${f.enabled ? '' : ' cs-fact--off'}`}>
                <textarea
                  rows={Math.max(1, Math.ceil(f.text.length / 34))}
                  value={f.text}
                  aria-label="Факт"
                  onChange={(e) => setMem({ facts: mem.facts.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)) })}
                />
                <Switch checked={f.enabled} label={f.enabled ? 'Не отправлять факт' : 'Отправлять факт'} onChange={(enabled) => setMem({ facts: mem.facts.map((x) => (x.id === f.id ? { ...x, enabled } : x)) })} />
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label="Удалить факт" onClick={() => setMem({ facts: mem.facts.filter((x) => x.id !== f.id) })}>
                  <Icon name="close" size={12} stroke={2.4} />
                </button>
              </div>
            ))}
            {mem.facts.some((f) => !f.enabled) ? <p className="cs-hint">Выключенные факты — предложения модели: включи нужные.</p> : null}
            <button type="button" className="cs-btn cs-btn--dashed" onClick={() => setMem({ facts: [...mem.facts, { id: uid(), text: '', enabled: true }] })}>
              + факт
            </button>
          </section>
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Автоматика
            </h2>
            <label className="cs-check cs-check--row">
              Сжимать каждые
              <select className="cs-select cs-select--sm" value={settings.autoEvery} onChange={(e) => updateSettingsSection('memory', { autoEvery: Number(e.target.value) })}>
                <option value={20}>20 сообщений</option>
                <option value={40}>40 сообщений</option>
                <option value={60}>60 сообщений</option>
                <option value={0}>вручную</option>
              </select>
            </label>
            <label className="cs-check cs-check--row">
              Модель для конспекта
              <select className="cs-select cs-select--sm" value={memoryProfile} onChange={(e) => updateSettings((s) => ({ profileFor: { ...s.profileFor, memory: e.target.value } }))}>
                <option value="">как в чате</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cs-check">
              <input type="checkbox" checked={settings.suggestFacts} onChange={(e) => updateSettingsSection('memory', { suggestFacts: e.target.checked })} />
              Предлагать новые факты
            </label>
            <div className="cs-col" style={{ gap: 6 }}>
              <div className="cs-row" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)' }}>
                <span>Бюджет памяти</span>
                <span>
                  {fmtNum(used)} / {fmtNum(settings.budget)} ток.
                </span>
              </div>
              <div className={`cs-progress${used > settings.budget ? ' cs-progress--over' : ''}`}>
                <span style={{ width: `${Math.min(100, (used / Math.max(1, settings.budget)) * 100)}%` }} />
              </div>
            </div>
            <RangeField label="Бюджет, ток." value={settings.budget} min={200} max={8000} step={100} onChange={(budget) => updateSettingsSection('memory', { budget })} />
            <details className="cs-details">
              <summary>Промпты Memory Book</summary>
              <Field label="Сжатие главы ({{chunk}} — фрагмент)" honey>
                <textarea className="cs-textarea" rows={6} value={settings.summaryPrompt} onChange={(e) => updateSettingsSection('memory', { summaryPrompt: e.target.value })} />
              </Field>
              <Field label="Поиск фактов" honey>
                <textarea className="cs-textarea" rows={5} value={settings.factsPrompt} onChange={(e) => updateSettingsSection('memory', { factsPrompt: e.target.value })} />
              </Field>
              <Field label="Шаблон вставки ({{chapters}}, {{facts}})" honey>
                <textarea className="cs-textarea" rows={3} value={settings.template} onChange={(e) => updateSettingsSection('memory', { template: e.target.value })} />
              </Field>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
