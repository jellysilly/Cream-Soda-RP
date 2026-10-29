import { useState } from 'react';
import { useStore, navigate, setChat, updateSettings, isNight } from '../../lib/store';
import { Avatar, openMenu, promptDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { toggleNight, exportChat, deleteChat, renameChat, uploadImage } from '../../lib/appActions';
import { fmtK, fmtNum, pickFiles } from '../../lib/utils';
import { startNewChat, generateReplies } from '../../lib/generate';
import { ChatsModal } from './ChatsModal';
import { t } from '../../lib/i18n';

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
  const name = char?.name || group?.name || t('Chat');

  const moreMenu = (el: HTMLElement) =>
    openMenu(el, [
      { label: t('Scene context'), icon: 'memory', onClick: onContext },
      { label: t('Search the chat'), icon: 'search', onClick: onSearch },
      { label: t('Chat branches'), icon: 'branch', onClick: () => setChatsOpen('branches') },
      { label: night ? t('Day theme') : t('Night theme'), icon: night ? 'sun' : 'moon', onClick: toggleNight },
      { separator: true, label: '' },
      { label: t('New chat'), icon: 'plus', onClick: () => startNewChat(chat.ownerType, chat.ownerId) },
      { label: t('All chats'), icon: 'list', onClick: () => setChatsOpen('all') },
      {
        label: t('Rename the chat'),
        icon: 'edit',
        onClick: async () => {
          const newTitle = await promptDialog(t('Chat title'), { value: chat.title });
          if (newTitle) renameChat(chat.id, newTitle);
        },
      },
      { label: t('Character card'), icon: 'chars', hidden: !char, onClick: () => navigate('library', `char:${char!.id}`) },
      { label: t('Group settings'), icon: 'group', hidden: !group, onClick: () => navigate('library', `group:${group!.id}`) },
      { separator: true, label: '' },
      {
        label: t('Scenario for this chat only'),
        icon: 'note',
        onClick: async () => {
          const newScenario = await promptDialog(t("Chat scenario (replaces the card's scenario)"), { value: chat.meta.scenarioOverride || '', multiline: true });
          if (newScenario !== null) setChat((c) => ({ ...c, meta: { ...c.meta, scenarioOverride: newScenario.trim() || undefined } }));
        },
      },
      {
        label: t('Chat lorebooks'),
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
            ...(worlds.length ? [] : [{ label: t('No lorebooks yet'), disabled: true }]),
          ]),
      },
      {
        label: t('Chat background…'),
        icon: 'images',
        onClick: async () => {
          const [f] = await pickFiles('image/*');
          if (f) {
            const url = await uploadImage('backgrounds', f, f.name);
            setChat((c) => ({ ...c, meta: { ...c.meta, background: url } }));
          }
        },
      },
      { label: t('Remove the chat background'), icon: 'close', hidden: !chat.meta.background, onClick: () => setChat((c) => ({ ...c, meta: { ...c.meta, background: undefined } })) },
      { separator: true, label: '' },
      { label: t('Export · .jsonl'), icon: 'upload', onClick: () => exportChat(chat.id, 'jsonl') },
      { label: t('Export · text'), icon: 'upload', onClick: () => exportChat(chat.id, 'txt') },
      { label: t('Delete the chat'), icon: 'trash', danger: true, onClick: () => deleteChat(chat.id) },
    ]);

  return (
    <header className="cs-chat-header">
      <button type="button" className="cs-icon-btn cs-mobile-only" style={{ background: 'transparent' }} aria-label={t('Chats')} onClick={() => setChatsOpen('all')}>
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
                title={t('{name}: tap to make them reply, long press/right click to mute', { name: c.name })}
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
      <button type="button" className="cs-chat-header__who" onClick={() => setChatsOpen('all')} title={t('All chats')}>
        <div className="cs-chat-header__name">
          <h1 className="cs-ellipsis">{name}</h1>
          {char?.tagline ? <span className="cs-chat-header__tag">{char.tagline}</span> : null}
        </div>
        <div className="cs-chat-header__sub cs-ellipsis">
          <span className="cs-chat-header__sub--desktop">
            {t('Chat “{title}”', { title: chat.title })}{bookNames.length ? t(' · lorebook “{bookNames}”', { bookNames: bookNames.join('», «') }) : ''}
          </span>
          <span className="cs-mobile-only-inline">
            {t('{name} · {tokens} tok.', { name: preset?.name, tokens: fmtK(tokens) })}
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
          title={t('Preset')}
        >
          <span className="cs-dot cs-dot--sm" />
          <span className="cs-ellipsis">{preset?.name || t('Preset')}</span>
        </a>
        <a
          href="#/settings/connections"
          className="cs-chip-link"
          title={conn ? `${conn.name} · ${conn.model}` : t('No connection set up')}
          onClick={(e) => {
            e.preventDefault();
            openMenu(e.currentTarget, [
              ...useStore.getState().connections.map((c) => ({
                label: `${c.id === conn?.id ? '✓ ' : ''}${c.name}${c.model ? ` · ${c.model}` : ''}`,
                onClick: () => updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: c.id } })),
              })),
              { separator: true, label: '' },
              { label: t('Set up connections'), icon: 'settings', onClick: () => navigate('settings', 'connections') },
            ]);
          }}
        >
          {conn ? <span className={`cs-dot cs-dot--sm${conn.status && !conn.status.ok ? ' cs-dot--danger' : ''}`} /> : null}
          <span className="cs-ellipsis">{conn ? conn.model || conn.name : t('[no connection]')}</span>
        </a>
        <button
          type="button"
          className={`cs-token-pill${tokens > ctx ? ' cs-token-pill--over' : ''}`}
          title={t('Size of the last request / context. Click to see the request.')}
          onClick={() => navigate('presets', 'preview')}
        >
          {fmtNum(tokens)} / {fmtK(ctx)}
        </button>
        <button type="button" className="cs-icon-btn" aria-label={night ? t('Day theme') : t('Night theme')} title={night ? t('Day theme') : t('Night theme')} onClick={toggleNight}>
          <Icon name={night ? 'sun' : 'moon'} size={20} />
        </button>
        <button type="button" className="cs-icon-btn" aria-label={t('Chat branches')} title={t('Chat branches')} onClick={() => setChatsOpen('branches')}>
          <Icon name="branch" size={20} />
        </button>
        <button type="button" className={`cs-icon-btn${searchOpen ? ' cs-icon-btn--active' : ''}`} aria-label={t('Search the chat')} title={t('Search the chat')} onClick={onSearch}>
          <Icon name="search" size={20} />
        </button>
        <button type="button" className="cs-icon-btn cs-context-btn" aria-label={t('Scene context')} title={t('Scene context')} onClick={onContext}>
          <Icon name="memory" size={20} />
        </button>
        <button type="button" className="cs-icon-btn cs-keep-mobile" aria-label={t('Chat menu')} title={t('Chat menu')} onClick={(e) => moreMenu(e.currentTarget)}>
          <Icon name="more" size={20} />
        </button>
      </div>
      {chatsOpen ? <ChatsModal focusBranches={chatsOpen === 'branches'} onClose={() => setChatsOpen(null)} /> : null}
    </header>
  );
}
