import { useState } from 'react';
import { useStore, navigate, setChat, updateSettings, isNight } from '../../lib/store';
import { Avatar, openMenu, promptDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { toggleNight, exportChat, deleteChat, renameChat, uploadImage } from '../../lib/appActions';
import { fmtK, fmtNum, pickFiles } from '../../lib/utils';
import { startNewChat, generateReplies } from '../../lib/generate';
import { ChatsModal } from './ChatsModal';

export function ChatHeader({ onSearch, onContext, searchOpen }: { onSearch: () => void; onContext: () => void; searchOpen: boolean }) {
  const chat = useStore((s) => s.chat);
  const char = useStore((s) => (s.chat?.ownerType === 'character' ? s.characters.find((c) => c.id === s.chat!.ownerId) : undefined));
  const group = useStore((s) => (s.chat?.ownerType === 'group' ? s.groups.find((g) => g.id === s.chat!.ownerId) : undefined));
  const characters = useStore((s) => s.characters);
  const preset = useStore((s) => s.presets.find((p) => p.id === s.settings.activePresetId) || s.presets[0]);
  const conn = useStore((s) => s.connections.find((c) => c.id === s.settings.profileFor.chat) || s.connections[0]);
  const tokens = useStore((s) => s.contextTokens);
  const worlds = useStore((s) => s.worlds);
  const night = useStore(isNight);
  const generating = useStore((s) => s.gen.kind !== null);
  const [chatsOpen, setChatsOpen] = useState<null | 'all' | 'branches'>(null);
  if (!chat) return null;

  const ctx = conn?.contextOverride || preset?.samplers.contextSize || 8192;
  const bookNames = [...new Set([...(char?.worldIds || []), ...chat.meta.worldIds])]
    .map((id) => worlds.find((w) => w.id === id)?.name)
    .filter(Boolean);
  const name = char?.name || group?.name || 'Чат';

  const moreMenu = (el: HTMLElement) =>
    openMenu(el, [
      { label: 'Контекст сцены', icon: 'memory', onClick: onContext },
      { label: 'Поиск по чату', icon: 'search', onClick: onSearch },
      { label: 'Ветки чата', icon: 'branch', onClick: () => setChatsOpen('branches') },
      { label: night ? 'Дневная тема' : 'Ночная тема', icon: night ? 'sun' : 'moon', onClick: toggleNight },
      { separator: true, label: '' },
      { label: 'Новый чат', icon: 'plus', onClick: () => startNewChat(chat.ownerType, chat.ownerId) },
      { label: 'Все чаты', icon: 'list', onClick: () => setChatsOpen('all') },
      {
        label: 'Переименовать чат',
        icon: 'edit',
        onClick: async () => {
          const t = await promptDialog('Название чата', { value: chat.title });
          if (t) renameChat(chat.id, t);
        },
      },
      { label: 'Карточка персонажа', icon: 'chars', hidden: !char, onClick: () => navigate('library', `char:${char!.id}`) },
      { label: 'Настройки группы', icon: 'group', hidden: !group, onClick: () => navigate('library', `group:${group!.id}`) },
      { separator: true, label: '' },
      {
        label: 'Сценарий только для этого чата',
        icon: 'note',
        onClick: async () => {
          const t = await promptDialog('Сценарий чата (заменяет сценарий карточки)', { value: chat.meta.scenarioOverride || '', multiline: true });
          if (t !== null) setChat((c) => ({ ...c, meta: { ...c.meta, scenarioOverride: t.trim() || undefined } }));
        },
      },
      {
        label: 'Лорбуки чата',
        icon: 'memory',
        onClick: () =>
          openMenu(el, [
            ...worlds.map((w) => ({
              label: `${chat.meta.worldIds.includes(w.id) ? '✓ ' : ''}${w.name}`,
              onClick: () =>
                setChat((c) => ({
                  ...c,
                  meta: { ...c.meta, worldIds: c.meta.worldIds.includes(w.id) ? c.meta.worldIds.filter((x) => x !== w.id) : [...c.meta.worldIds, w.id] },
                })),
            })),
            ...(worlds.length ? [] : [{ label: 'Лорбуков пока нет', disabled: true }]),
          ]),
      },
      {
        label: 'Фон чата…',
        icon: 'images',
        onClick: async () => {
          const [f] = await pickFiles('image/*');
          if (f) {
            const url = await uploadImage('backgrounds', f, f.name);
            setChat((c) => ({ ...c, meta: { ...c.meta, background: url } }));
          }
        },
      },
      { label: 'Убрать фон чата', icon: 'close', hidden: !chat.meta.background, onClick: () => setChat((c) => ({ ...c, meta: { ...c.meta, background: undefined } })) },
      { separator: true, label: '' },
      { label: 'Экспорт · .jsonl', icon: 'upload', onClick: () => exportChat(chat.id, 'jsonl') },
      { label: 'Экспорт · текст', icon: 'upload', onClick: () => exportChat(chat.id, 'txt') },
      { label: 'Удалить чат', icon: 'trash', danger: true, onClick: () => deleteChat(chat.id) },
    ]);

  return (
    <header className="cs-chat-header">
      <button type="button" className="cs-icon-btn cs-mobile-only" style={{ background: 'transparent' }} aria-label="Чаты" onClick={() => setChatsOpen('all')}>
        <Icon name="left" size={20} stroke={2.2} />
      </button>
      {group ? (
        <div className="cs-members">
          {group.memberIds.slice(0, 4).map((id) => {
            const c = characters.find((x) => x.id === id);
            if (!c) return null;
            const muted = group.mutedIds.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={muted}
                title={`${c.name}: нажми — ответит, долгое нажатие/ПКМ — заглушить`}
                disabled={generating}
                onClick={() => generateReplies(id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const g = { ...group, mutedIds: muted ? group.mutedIds.filter((x) => x !== id) : [...group.mutedIds, id] };
                  import('../../lib/store').then(({ upsert }) => upsert('groups', g));
                }}
              >
                <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={40} ring />
              </button>
            );
          })}
        </div>
      ) : (
        <Avatar src={char?.avatar} name={name} kana={char?.kana} palette={char?.palette} size={52} ring />
      )}
      <button type="button" className="cs-chat-header__who" onClick={() => setChatsOpen('all')} title="Все чаты">
        <div className="cs-chat-header__name">
          <h1 className="cs-ellipsis">{name}</h1>
          {char?.tagline ? <span className="cs-chat-header__tag">{char.tagline}</span> : null}
        </div>
        <div className="cs-chat-header__sub cs-ellipsis">
          <span className="cs-chat-header__sub--desktop">
            Чат «{chat.title}»{bookNames.length ? ` · лорбук «${bookNames.join('», «')}»` : ''}
          </span>
          <span className="cs-mobile-only-inline">
            {preset?.name} · {fmtK(tokens)} ток.
          </span>
        </div>
      </button>
      <div className="cs-chat-header__tools">
        <a
          href="#/presets"
          className="cs-chip-link"
          onClick={(e) => {
            e.preventDefault();
            navigate('presets');
          }}
          title="Пресет"
        >
          <span className="cs-dot cs-dot--sm" />
          <span className="cs-ellipsis">{preset?.name || 'Пресет'}</span>
        </a>
        <a
          href="#/settings/connections"
          className="cs-chip-link"
          title={conn ? `${conn.name} · ${conn.model}` : 'Подключение не настроено'}
          onClick={(e) => {
            e.preventDefault();
            openMenu(e.currentTarget, [
              ...useStore.getState().connections.map((c) => ({
                label: `${c.id === conn?.id ? '✓ ' : ''}${c.name}${c.model ? ` · ${c.model}` : ''}`,
                onClick: () => updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: c.id } })),
              })),
              { separator: true, label: '' },
              { label: 'Настроить подключения', icon: 'settings', onClick: () => navigate('settings', 'connections') },
            ]);
          }}
        >
          {conn ? <span className={`cs-dot cs-dot--sm${conn.status && !conn.status.ok ? ' cs-dot--danger' : ''}`} /> : null}
          <span className="cs-ellipsis">{conn ? conn.model || conn.name : '[нет подключения]'}</span>
        </a>
        <button
          type="button"
          className={`cs-token-pill${tokens > ctx ? ' cs-token-pill--over' : ''}`}
          title="Размер последнего запроса / контекст. Нажми, чтобы посмотреть запрос."
          onClick={() => navigate('presets', 'preview')}
        >
          {fmtNum(tokens)} / {fmtK(ctx)}
        </button>
        <button type="button" className="cs-icon-btn" aria-label={night ? 'Дневная тема' : 'Ночная тема'} title={night ? 'Дневная тема' : 'Ночная тема'} onClick={toggleNight}>
          <Icon name={night ? 'sun' : 'moon'} size={20} />
        </button>
        <button type="button" className="cs-icon-btn" aria-label="Ветки чата" title="Ветки чата" onClick={() => setChatsOpen('branches')}>
          <Icon name="branch" size={20} />
        </button>
        <button type="button" className={`cs-icon-btn${searchOpen ? ' cs-icon-btn--active' : ''}`} aria-label="Поиск по чату" title="Поиск по чату" onClick={onSearch}>
          <Icon name="search" size={20} />
        </button>
        <button type="button" className="cs-icon-btn cs-context-btn" aria-label="Контекст сцены" title="Контекст сцены" onClick={onContext}>
          <Icon name="memory" size={20} />
        </button>
        <button type="button" className="cs-icon-btn cs-keep-mobile" aria-label="Меню чата" title="Меню чата" onClick={(e) => moreMenu(e.currentTarget)}>
          <Icon name="more" size={20} />
        </button>
      </div>
      {chatsOpen ? <ChatsModal focusBranches={chatsOpen === 'branches'} onClose={() => setChatsOpen(null)} /> : null}
    </header>
  );
}
