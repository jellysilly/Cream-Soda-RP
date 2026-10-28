import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { Modal, openMenu, promptDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { openChat, refreshChatList, startNewChat } from '../../lib/generate';
import { deleteChat, exportChat, importChatInteractive, renameChat } from '../../lib/appActions';
import { fmtDate, plural } from '../../lib/utils';
import type { ChatSummary } from '../../lib/types';

export function ChatsModal({ onClose, focusBranches }: { onClose: () => void; focusBranches?: boolean }) {
  const chat = useStore((s) => s.chat);
  const list = useStore((s) => s.chatList);
  const [q, setQ] = useState('');
  useEffect(() => {
    refreshChatList();
  }, []);

  const tree = useMemo(() => {
    const ids = new Set(list.map((c) => c.id));
    const children = new Map<string, ChatSummary[]>();
    const roots: ChatSummary[] = [];
    for (const c of list) {
      if (c.parentId && ids.has(c.parentId)) {
        if (!children.has(c.parentId)) children.set(c.parentId, []);
        children.get(c.parentId)!.push(c);
      } else roots.push(c);
    }
    const out: { c: ChatSummary; level: number }[] = [];
    const walk = (c: ChatSummary, level: number) => {
      out.push({ c, level });
      for (const ch of (children.get(c.id) || []).sort((a, b) => a.createdAt - b.createdAt)) walk(ch, level + 1);
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [list]);

  const shown = q.trim() ? tree.filter(({ c }) => `${c.title} ${c.preview}`.toLowerCase().includes(q.toLowerCase())) : tree;
  const branchesOnly = focusBranches && chat ? shown.filter(({ c }) => c.id === chat.id || c.parentId === chat.id || c.id === chat.parentId || c.parentId === chat.parentId) : shown;

  return (
    <Modal title={focusBranches ? 'Ветки чата' : 'Чаты'} kana="チャット" onClose={onClose} size="wide">
      <div className="cs-row cs-row--wrap">
        <label className="cs-search cs-grow" style={{ minWidth: 200 }}>
          <Icon name="search" size={18} stroke={2} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или последняя реплика" aria-label="Поиск чатов" />
        </label>
        <button type="button" className="cs-btn" onClick={() => importChatInteractive().then(onClose)}>
          <Icon name="download" size={16} /> Импорт .jsonl
        </button>
        <button
          type="button"
          className="cs-btn cs-btn--primary"
          onClick={async () => {
            if (chat) await startNewChat(chat.ownerType, chat.ownerId);
            onClose();
          }}
        >
          <Icon name="plus" size={16} stroke={2.2} /> Новый чат
        </button>
      </div>
      <div className="cs-col" style={{ gap: 8 }}>
        {branchesOnly.map(({ c, level }) => (
          <div key={c.id} className="cs-row-item" style={{ marginLeft: level * 22, border: c.id === chat?.id ? '2px solid var(--cs-accent)' : '2px solid transparent', alignItems: 'flex-start' }}>
            {level > 0 ? <Icon name="branch" size={16} style={{ color: 'var(--cs-muted)', marginTop: 3 }} /> : <Icon name="chat" size={16} style={{ color: 'var(--cs-muted)', marginTop: 3 }} />}
            <button
              type="button"
              className="cs-grow"
              style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }}
              onClick={async () => {
                await openChat(c.id);
                onClose();
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>{c.title}</div>
              <div className="cs-hint" style={{ fontSize: 12 }}>
                {fmtDate(c.updatedAt)} · {c.messageCount} {plural(c.messageCount, 'сообщение', 'сообщения', 'сообщений')}
                {c.branchPoint !== null && c.branchPoint !== undefined ? ` · ветка с #${c.branchPoint + 1}` : ''}
              </div>
              {c.preview ? (
                <div className="cs-ellipsis" style={{ fontSize: 13, marginTop: 2, maxWidth: '100%' }}>
                  {c.preview}
                </div>
              ) : null}
            </button>
            <button
              type="button"
              className="cs-icon-btn cs-icon-btn--soft"
              aria-label="Действия с чатом"
              onClick={(e) =>
                openMenu(e.currentTarget, [
                  {
                    label: 'Переименовать',
                    icon: 'edit',
                    onClick: async () => {
                      const t = await promptDialog('Название чата', { value: c.title });
                      if (t) renameChat(c.id, t);
                    },
                  },
                  { label: 'Экспорт · .jsonl (SillyTavern)', icon: 'upload', onClick: () => exportChat(c.id, 'jsonl') },
                  { label: 'Экспорт · текст', icon: 'upload', onClick: () => exportChat(c.id, 'txt') },
                  { label: 'Экспорт · JSON Cream Soda', icon: 'upload', onClick: () => exportChat(c.id, 'json') },
                  { separator: true, label: '' },
                  { label: 'Удалить', icon: 'trash', danger: true, onClick: () => deleteChat(c.id).then(() => refreshChatList()) },
                ])
              }
            >
              <Icon name="dots" size={16} />
            </button>
          </div>
        ))}
        {!branchesOnly.length ? <p className="cs-hint">Чатов не найдено.</p> : null}
      </div>
    </Modal>
  );
}
