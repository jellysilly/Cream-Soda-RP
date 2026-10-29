import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore, currentThemeId } from '../../lib/store';
import { Message } from './Message';
import { displayRegexScripts } from '../../lib/generate';
import type { MacroEnv } from '../../lib/macros';
import { chapterRange, chapterNumber, pendingRange } from '../../lib/memory';
import { t } from '../../lib/i18n';

export function MessageList({ highlight }: { highlight?: string }) {
  const chat = useStore((s) => s.chat);
  const characters = useStore((s) => s.characters);
  const personas = useStore((s) => s.personas);
  const regex = useStore((s) => s.regex);
  const presetId = useStore((s) => s.settings.activePresetId);
  const chatSettings = useStore((s) => s.settings.chat);
  const gen = useStore((s) => s.gen);
  const persona = useStore((s) => s.personas.find((p) => p.id === (s.chat?.meta.personaId || s.settings.activePersonaId)) || s.personas[0]);
  const themeId = useStore(currentThemeId);
  const dark = useStore((s) => !!s.themes.find((th) => th.id === themeId)?.dark);
  const chatView = useStore((s) => s.themes.find((th) => th.id === themeId)?.chatView || 'bubbles');
  const [limit, setLimit] = useState(chatSettings.renderLimit || 80);
  const box = useRef<HTMLElement>(null);
  const stick = useRef(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scripts = useMemo(() => displayRegexScripts(), [regex, chat?.ownerId, presetId]);
  const owner = chat?.ownerType === 'character' ? characters.find((c) => c.id === chat.ownerId) : undefined;
  const env: MacroEnv = useMemo(() => ({ user: persona?.name || t('You'), char: owner?.name || '' }), [persona?.name, owner?.name]);

  useEffect(() => setLimit(chatSettings.renderLimit || 80), [chat?.id, chatSettings.renderLimit]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (el && chatSettings.autoScroll && stick.current) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    stick.current = true;
    const el = box.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [chat?.id]);

  if (!chat) return null;
  const messages = chat.messages;
  const start = Math.max(0, messages.length - limit);
  const lastCharIdx = messages.map((m) => m.role).lastIndexOf('char');

  // Chapter dividers: before the first message of each Memory Book chapter.
  const dividers = new Map<number, string>();
  chat.meta.memory?.chapters
    .filter((c) => c.status === 'memory')
    .forEach((c, i) => {
      const r = chapterRange(chat, c);
      if (r) dividers.set(r[0], t('chapter {i} · “{title}”', { i: i + 1, title: c.title }));
    });
  const pend = pendingRange(chat);
  if (pend.count > 0 && !dividers.has(pend.start)) dividers.set(pend.start, t('cream · soda · chapter {x}', { x: chapterNumber(chat.meta.memory) }));
  if (dark) for (const [k, v] of dividers) dividers.set(k, v.replace('cream · soda', 'midnight · soda'));

  const speaker = (charId?: string) => (charId ? characters.find((c) => c.id === charId) : owner);
  const vnChar = chatView === 'vn' ? speaker([...messages].reverse().find((m) => m.role === 'char')?.charId) : undefined;
  const vnImage = vnChar?.sprites?.neutral || vnChar?.avatar;

  return (
    <section className="cs-messages cs-chat-log" aria-label={t('Messages')} ref={box} onScroll={onScroll}>
      {vnImage ? (
        <div className="cs-vn-stage" aria-hidden="true">
          <img src={vnImage} alt="" />
        </div>
      ) : null}
      {start > 0 ? (
        <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost cs-load-earlier" onClick={() => setLimit((l) => l + 80)}>
          {t('Show earlier messages · {start}', { start })}
        </button>
      ) : null}
      {messages.slice(start).map((m, j) => {
        const i = start + j;
        const ch = m.role === 'char' ? speaker(m.charId) : undefined;
        const pr = m.role === 'user' ? personas.find((p) => p.id === m.personaId) || persona : undefined;
        const div = dividers.get(i);
        return (
          <div key={m.id} style={{ display: 'contents' }}>
            {div ? (
              <div className="cs-divider-label cs-chapter-divider">
                <span>{div}</span>
              </div>
            ) : null}
            <Message
              msg={m}
              index={i}
              depth={messages.length - 1 - i}
              isLast={i === messages.length - 1}
              isLastChar={i === lastCharIdx && i === messages.length - 1}
              streaming={gen.kind !== null && gen.messageId === m.id}
              generating={gen.kind !== null}
              scripts={scripts}
              env={ch ? (ch.name === env.char ? env : { ...env, char: ch.name }) : env}
              avatar={m.role === 'char' ? m.avatar || ch?.avatar : pr?.avatar}
              kana={m.role === 'char' ? ch?.kana : pr?.kana}
              palette={m.role === 'char' ? ch?.palette : (pr?.palette ?? 1)}
              showTime={chatSettings.showTimestamps}
              showGen={chatSettings.showGenInfo}
              markdown={chatSettings.renderMarkdown}
              html={chatSettings.renderHtml}
              htmlIframe={chatSettings.htmlIframe}
              allowScripts={chatSettings.allowScripts}
              collapseReasoning={chatSettings.collapseReasoning}
              dark={dark}
            />
          </div>
        );
      })}
      {highlight ? <SearchHighlighter query={highlight} container={box} /> : null}
      <div className="cs-messages__watermark" aria-hidden="true">
        ミッドナイト
      </div>
    </section>
  );
}

/** Highlights search matches inside rendered messages using the CSS Highlight API when available. */
function SearchHighlighter({ query, container }: { query: string; container: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const el = container.current;
    const CSSAny = CSS as any;
    if (!el || !query.trim() || !CSSAny.highlights) return;
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const q = query.toLowerCase();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.toLowerCase() || '';
      let idx = text.indexOf(q);
      while (idx !== -1) {
        const r = new Range();
        r.setStart(node, idx);
        r.setEnd(node, idx + q.length);
        ranges.push(r);
        idx = text.indexOf(q, idx + q.length);
      }
    }
    const hl = new (window as any).Highlight(...ranges);
    CSSAny.highlights.set('cs-search', hl);
    return () => CSSAny.highlights.delete('cs-search');
  });
  return null;
}
