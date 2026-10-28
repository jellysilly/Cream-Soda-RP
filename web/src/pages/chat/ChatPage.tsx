import { useEffect, useState } from 'react';
import { useStore, navigate } from '../../lib/store';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ContextAside } from './ContextAside';
import { Drawer, Avatar } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { openChat, previewPrompt } from '../../lib/generate';
import { importCharactersInteractive } from '../../lib/appActions';
import type { ChatSummary } from '../../lib/types';
import { fmtDate } from '../../lib/utils';
import { setState } from '../../lib/store';

function Welcome() {
  const characters = useStore((s) => s.characters);
  const groups = useStore((s) => s.groups);
  const hasConn = useStore((s) => s.connections.length > 0);
  const [recent, setRecent] = useState<ChatSummary[]>([]);
  useEffect(() => {
    api
      .listChats()
      .then((l) => setRecent(l.slice(0, 6)))
      .catch(() => {});
  }, []);
  const ownerOf = (c: ChatSummary) => (c.ownerType === 'character' ? characters.find((x) => x.id === c.ownerId) : groups.find((g) => g.id === c.ownerId));
  return (
    <div className="cs-page">
      <div className="cs-welcome cs-panel cs-panel--soft">
        <div className="cs-welcome__title" aria-hidden="true">
          クリーム
          <br />
          ソーダ
        </div>
        <div className="cs-welcome__script" aria-hidden="true">
          <span>cream</span>
          <span>roleplay</span>
          <span>soda</span>
        </div>
        <h1 className="cs-h1">Cream Soda</h1>
        <p className="cs-hint" style={{ maxWidth: 420 }}>
          Выбери персонажа, чтобы начать историю. Карточки SillyTavern (PNG и JSON), лорбуки и пресеты импортируются как есть.
        </p>
        {!hasConn ? (
          <button type="button" className="cs-btn cs-btn--mint" onClick={() => navigate('settings', 'connections')}>
            <Icon name="zap" size={16} /> Подключить модель
          </button>
        ) : null}
        <div className="cs-row cs-row--wrap" style={{ justifyContent: 'center' }}>
          <button type="button" className="cs-btn cs-btn--primary cs-btn--glow" onClick={() => navigate('library')}>
            <Icon name="chars" size={18} /> Выбрать персонажа
          </button>
          <button type="button" className="cs-btn" onClick={() => importCharactersInteractive()}>
            <Icon name="download" size={18} /> Импорт PNG / JSON
          </button>
          <button type="button" className="cs-btn" onClick={() => navigate('generator')}>
            <Icon name="sparkle" size={16} /> Сгенерировать
          </button>
        </div>
        {recent.length ? (
          <div className="cs-col" style={{ width: 'min(520px, 100%)', marginTop: 8 }}>
            <span className="cs-label">Недавние чаты</span>
            {recent.map((c) => {
              const o = ownerOf(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="cs-select-item"
                  onClick={async () => {
                    await openChat(c.id);
                  }}
                >
                  <Avatar src={o?.avatar} name={o?.name || '?'} kana={(o as any)?.kana} palette={(o as any)?.palette} size={36} />
                  <span className="cs-grow">
                    <span className="cs-select-item__title cs-ellipsis">{o?.name || 'Удалённый персонаж'}</span>
                    <span className="cs-select-item__sub cs-ellipsis">
                      {c.title} · {fmtDate(c.updatedAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChatPage() {
  const hasChat = useStore((s) => !!s.chat);
  const chatId = useStore((s) => s.chat?.id);
  const messagesLen = useStore((s) => s.chat?.messages.length);
  const presetVersion = useStore((s) => s.presets.find((p) => p.id === s.settings.activePresetId)?.updatedAt);
  const generating = useStore((s) => s.gen.kind !== null);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);

  // Keep the token counter and «Активный лор» fresh between generations.
  useEffect(() => {
    if (!hasChat || generating) return;
    const t = setTimeout(() => {
      const built = previewPrompt();
      if (!built) return;
      setState({
        contextTokens: built.totalTokens,
        activeLore: [
          ...built.wi.activated.map((e) => ({ uid: e.uid, title: e.comment, keys: e.constant ? 'всегда' : e.keys.slice(0, 3).join(', '), state: 'active' as const })),
          ...built.wi.waiting.map((e) => ({ uid: e.uid, title: e.comment, keys: 'ждёт 2-й ключ', state: 'waiting' as const })),
        ],
      });
    }, 250);
    return () => clearTimeout(t);
  }, [hasChat, chatId, messagesLen, presetVersion, generating]);

  if (!hasChat) return <Welcome />;

  return (
    <div className="cs-chat-page">
      <main className="cs-chat">
        <ChatHeader onSearch={() => setSearch(!search)} onContext={() => setDrawer(true)} searchOpen={search} />
        {search ? (
          <div className="cs-search-bar">
            <label className="cs-search cs-grow">
              <Icon name="search" size={18} stroke={2} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в этом чате" aria-label="Найти в чате" onKeyDown={(e) => e.key === 'Escape' && setSearch(false)} />
            </label>
            <SearchNav query={query} />
            <button
              type="button"
              className="cs-icon-btn cs-icon-btn--soft"
              aria-label="Закрыть поиск"
              onClick={() => {
                setSearch(false);
                setQuery('');
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ) : null}
        <MessageList highlight={search ? query : ''} />
        <Composer />
      </main>
      <aside className="cs-chat-aside" aria-label="Контекст сцены">
        <ContextAside />
      </aside>
      {drawer ? (
        <Drawer title="Контекст сцены" onClose={() => setDrawer(false)}>
          <ContextAside />
        </Drawer>
      ) : null}
    </div>
  );
}

const NO_MESSAGES: never[] = [];

function SearchNav({ query }: { query: string }) {
  const messages = useStore((s) => s.chat?.messages ?? NO_MESSAGES);
  const [pos, setPos] = useState(0);
  const hits = query.trim().length > 1 ? messages.filter((m) => m.text.toLowerCase().includes(query.toLowerCase())) : [];
  useEffect(() => setPos(0), [query]);
  const go = (i: number) => {
    if (!hits.length) return;
    const n = (i + hits.length) % hits.length;
    setPos(n);
    document.querySelector(`[data-mid="${hits[n].id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  return (
    <div className="cs-row" style={{ flex: 'none' }}>
      <span className="cs-pill cs-pill--white">{hits.length ? `${pos + 1} / ${hits.length}` : '0'}</span>
      <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Предыдущее" onClick={() => go(pos - 1)}>
        <Icon name="up" size={16} />
      </button>
      <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Следующее" onClick={() => go(pos + 1)}>
        <Icon name="down" size={16} />
      </button>
    </div>
  );
}
