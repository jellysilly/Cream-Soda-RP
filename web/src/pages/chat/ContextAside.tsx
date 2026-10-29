import { useState } from 'react';
import { useStore, navigate, setChat, toastError } from '../../lib/store';
import { Icon } from '../../components/Icon';
import { Kana, Field } from '../../components/ui';
import { summarizeChapter } from '../../lib/generate';
import { chapterNumber, memoryTokens, pendingRange } from '../../lib/memory';
import { fmtNum } from '../../lib/utils';
import { t, tn } from '../../lib/i18n';

export function MemoryWidget() {
  const chat = useStore((s) => s.chat);
  const budget = useStore((s) => s.settings.memory.budget);
  const busy = useStore((s) => s.gen.kind === 'memory');
  useStore((s) => s.contextTokens);
  if (!chat) return null;
  const mem = chat.meta.memory;
  const done = mem.chapters.filter((c) => c.status === 'memory');
  const last = done[done.length - 1];
  const fact = mem.facts.find((f) => f.enabled);
  const pend = pendingRange(chat);
  const n = chapterNumber(mem);
  const used = memoryTokens(chat);
  const pct = Math.min(100, Math.round((used / Math.max(1, budget)) * 100));
  return (
    <section className="cs-panel">
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Memory Book
        </h2>
        <Kana>メモリー</Kana>
        <a
          href="#/memory"
          className="cs-ml-auto"
          style={{ fontSize: 13 }}
          onClick={(e) => {
            e.preventDefault();
            navigate('memory');
          }}
        >
          {t('Open')}
        </a>
      </div>
      {last ? (
        <div className="cs-mem-card">
          <div className="cs-mem-card__label">
            {t('Chapter {n} · “{title}”', { n: done.length, title: last.title })}
          </div>
          <p>{last.summary}</p>
        </div>
      ) : (
        <div className="cs-mem-card">
          <p className="cs-muted">{t('No chapters yet. Once the story grows, condense it into an entry: the model will remember the main points.')}</p>
        </div>
      )}
      {fact ? (
        <div className="cs-mem-card">
          <div className="cs-mem-card__label cs-mem-card__label--mint">
            <Icon name="pin" size={14} stroke={2.2} />
            {t('Pinned fact')}
          </div>
          <p>{fact.text}</p>
        </div>
      ) : null}
      <div className="cs-col" style={{ gap: 6 }}>
        <div className="cs-row" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)' }}>
          <span>
            {t('Chapter {n} · {count} {x}', { n, count: pend.count, x: tn(pend.count, 'message|messages') })}
          </span>
          <span>
            {t('{used} / {budget} tok.', { used: fmtNum(used), budget: fmtNum(budget) })}
          </span>
        </div>
        <div className="cs-progress">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        type="button"
        className="cs-btn cs-btn--mint"
        disabled={busy || pend.count === 0}
        onClick={() => summarizeChapter().catch((e) => toastError(e, 'Memory Book'))}
      >
        {busy ? <span className="cs-spinner" /> : null}
        {t('Condense chapter {n} into an entry', { n })}
      </button>
    </section>
  );
}

export function LoreWidget() {
  const lore = useStore((s) => s.activeLore);
  const hasBooks = useStore((s) => {
    const c = s.chat?.ownerType === 'character' ? s.characters.find((x) => x.id === s.chat!.ownerId) : undefined;
    return !!(c?.worldIds.length || s.chat?.meta.worldIds.length || s.settings.worldInfo.globalWorldIds.length);
  });
  return (
    <section className="cs-panel" style={{ gap: 10 }}>
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Active lore')}
        </h2>
        <a
          href="#/library/lorebooks"
          className="cs-ml-auto"
          style={{ fontSize: 13 }}
          onClick={(e) => {
            e.preventDefault();
            navigate('library', 'lorebooks');
          }}
        >
          {t('Lorebooks')}
        </a>
      </div>
      {lore.length ? (
        lore.slice(0, 12).map((e) => (
          <div key={e.uid} className={`cs-lore-row${e.state === 'waiting' ? ' cs-lore-row--waiting' : ''}`}>
            <span className={`cs-dot${e.state === 'waiting' ? ' cs-dot--hollow' : ''}`} />
            <span className="cs-grow cs-ellipsis" style={{ fontWeight: 700 }}>
              {e.title}
            </span>
            <span className="cs-lore-row__keys" style={e.state === 'waiting' ? { fontFamily: 'var(--cs-font-body)', fontSize: 12 } : undefined}>
              {e.keys}
            </span>
          </div>
        ))
      ) : (
        <p className="cs-hint">{hasBooks ? t('Entries show up here when their keywords come up in the conversation.') : t('No lorebook is attached to this chat.')}</p>
      )}
    </section>
  );
}

export function SceneWidget() {
  const scene = useStore((s) => s.chat?.meta.sceneImage);
  const endpoint = useStore((s) => s.imageSettings.endpoint);
  const busy = useStore((s) => s.gen.kind === 'image');
  const w = useStore((s) => s.imageSettings.width);
  const h = useStore((s) => s.imageSettings.height);
  const n = useStore((s) => s.imageSettings.sceneMessages);
  return (
    <section className="cs-panel">
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Scene frame')}
        </h2>
        <span className="cs-pill cs-ml-auto">{endpoint ? t('own API') : t('not set up')}</span>
      </div>
      <div className="cs-scene-frame">
        {scene ? (
          <img src={scene} alt={t('Scene frame')} />
        ) : (
          <>
            <div className="cs-backdrop__orb cs-backdrop__orb--pink" style={{ position: 'absolute', left: 20, top: 18, width: 70, height: 70, filter: 'blur(2px)' }} />
            <div className="cs-backdrop__orb cs-backdrop__orb--blue" style={{ position: 'absolute', right: 26, bottom: 16, width: 60, height: 60, filter: 'blur(2px)' }} />
            <span className="cs-scene-frame__label">
              {t('[scene frame · {w}×{h}]', { w, h })}
            </span>
          </>
        )}
      </div>
      <p className="cs-hint">{t("The image prompt is built from the last {n} messages and the character's appearance.", { n })}</p>
      <button
        type="button"
        className="cs-btn cs-btn--primary"
        disabled={busy}
        onClick={async () => {
          if (!endpoint) return navigate('images');
          try {
            const { generateSceneFrame } = await import('../../lib/images');
            await generateSceneFrame({ insert: false });
          } catch (err) {
            toastError(err, t('Scene frame'));
          }
        }}
      >
        {busy ? <span className="cs-spinner" /> : null}
        {endpoint ? t('Generate a frame') : t('Set up your own API')}
      </button>
    </section>
  );
}

export function AuthorNoteWidget() {
  const an = useStore((s) => s.chat?.meta.authorNote);
  const [open, setOpen] = useState(!!an?.text);
  if (!an) return null;
  const set = (patch: Partial<typeof an>) => setChat((c) => ({ ...c, meta: { ...c.meta, authorNote: { ...c.meta.authorNote, ...patch } } }));
  return (
    <section className="cs-panel" style={{ gap: 10 }}>
      <button type="button" className="cs-panel-head" style={{ border: 'none', background: 'none', padding: 0, color: 'inherit', textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t("Author's note")}
        </h2>
        {an.text ? <span className="cs-dot cs-dot--sm" /> : null}
        <Icon name={open ? 'up' : 'down'} size={18} className="cs-ml-auto" />
      </button>
      {open ? (
        <>
          <textarea className="cs-textarea" rows={3} placeholder={t("For example: it's pouring outside; Rin is a little jealous.")} value={an.text} onChange={(e) => set({ text: e.target.value })} />
          <div className="cs-grid-fields cs-grid-fields--sm">
            <Field label={t('Depth')}>
              <input className="cs-input" type="number" min={0} value={an.depth} onChange={(e) => set({ depth: Math.max(0, Number(e.target.value)) })} />
            </Field>
            <Field label={t('Every N')}>
              <input className="cs-input" type="number" min={0} value={an.interval} onChange={(e) => set({ interval: Math.max(0, Number(e.target.value)) })} />
            </Field>
          </div>
          <Field label={t('Where')}>
            <select className="cs-select" value={an.position} onChange={(e) => set({ position: e.target.value as typeof an.position })}>
              <option value="depth">{t('Into the history, at depth')}</option>
              <option value="after_main">{t('After the main prompt')}</option>
              <option value="before_main">{t('Before the main prompt')}</option>
            </select>
          </Field>
        </>
      ) : null}
    </section>
  );
}

export function ContextAside() {
  const enabled = useStore((s) => s.settings.extensions.enabled);
  return (
    <>
      {enabled.memory ? <MemoryWidget /> : null}
      <LoreWidget />
      {enabled.images ? <SceneWidget /> : null}
      <AuthorNoteWidget />
    </>
  );
}
