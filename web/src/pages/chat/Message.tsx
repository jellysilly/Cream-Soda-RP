import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, RegexScript } from '../../lib/types';
import { applyRegex, PLACEMENT } from '../../lib/regex';
import { formatMessage, isDocumentHtml } from '../../lib/markdown';
import { Avatar, openMenu, confirmDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { fmtTime, copyText, fmtNum } from '../../lib/utils';
import { getState, toast, toastError, navigate } from '../../lib/store';
import {
  swipe,
  editMessage,
  deleteMessages,
  deleteSwipe,
  setHidden,
  branchFrom,
  continueMessage,
  generateSwipe,
  summarizeChapter,
  translateMessage,
  moveMessage,
  updateMessage,
  generateReplies,
} from '../../lib/generate';
import { pendingRange } from '../../lib/memory';
import type { MacroEnv } from '../../lib/macros';

export interface MessageProps {
  msg: ChatMessage;
  index: number;
  depth: number;
  isLast: boolean;
  isLastChar: boolean;
  streaming: boolean;
  generating: boolean;
  scripts: RegexScript[];
  env: MacroEnv;
  avatar?: string;
  kana?: string;
  palette?: number;
  showTime: boolean;
  showGen: boolean;
  markdown: boolean;
  html: boolean;
  htmlIframe: boolean;
  collapseReasoning: boolean;
  dark: boolean;
}

/** Renders a full HTML document (with <style>) inside a script-less sandbox. */
function HtmlFrame({ html, dark }: { html: string; dark: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  const doc = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n);
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
      html,body{margin:0;padding:0;background:transparent;color:${v('--cs-text')};font:15px/1.55 ${v('--cs-font-body')};color-scheme:${dark ? 'dark' : 'light'}}
      img{max-width:100%}
    </style></head><body>${html.replace(/<script[\s\S]*?<\/script>/gi, '')}</body></html>`;
  }, [html, dark]);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(Math.min(4000, Math.max(40, body.scrollHeight)));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && 'ResizeObserver' in window) {
        ro = new ResizeObserver(measure);
        ro.observe(body);
      }
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      ro?.disconnect();
    };
  }, [doc]);
  return (
    <iframe
      ref={ref}
      className="cs-html-frame"
      title="HTML-блок"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
    />
  );
}

function MessageView(p: MessageProps) {
  const { msg } = p;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const role = msg.role;
  const displayText = useMemo(() => {
    const placement = role === 'user' ? PLACEMENT.USER_INPUT : PLACEMENT.AI_OUTPUT;
    return applyRegex(msg.text || '', p.scripts, { placement, display: true, depth: p.depth, env: p.env });
  }, [msg.text, role, p.scripts, p.depth, p.env]);

  const docHtml = p.html && p.htmlIframe && isDocumentHtml(displayText);
  const html = useMemo(() => (docHtml ? '' : formatMessage(displayText, { markdown: p.markdown, html: p.html })), [displayText, docHtml, p.markdown, p.html]);

  const startEdit = () => {
    setDraft(msg.text);
    setEditing(true);
  };
  const saveEdit = () => {
    editMessage(msg.id, draft);
    setEditing(false);
  };

  const menuItems = () => {
    const s = getState();
    const idx = p.index;
    return [
      { label: 'Править', icon: 'edit', onClick: startEdit },
      { label: 'Копировать текст', icon: 'copy', onClick: () => copyText(msg.text).then(() => toast('Скопировано')) },
      { label: msg.hidden ? 'Вернуть в контекст' : 'Скрыть от модели', icon: msg.hidden ? 'eye' : 'eyeOff', onClick: () => setHidden([msg.id], !msg.hidden) },
      { label: 'Ветка отсюда', icon: 'branch', onClick: () => branchFrom(msg.id) },
      { label: msg.bookmark ? 'Убрать закладку' : 'Закладка', icon: 'bookmark', onClick: () => updateMessage(msg.id, { bookmark: !msg.bookmark }) },
      { separator: true, label: '' },
      { label: 'Продолжить ответ', icon: 'arrow', hidden: role !== 'char', onClick: () => continueMessage(msg.id) },
      { label: 'Новый вариант (свайп)', icon: 'refresh', hidden: role !== 'char' || !p.isLast, onClick: () => generateSwipe(msg.id) },
      { label: 'Удалить этот вариант', icon: 'close', hidden: msg.swipes.length < 2, onClick: () => deleteSwipe(msg.id) },
      { label: 'Ответить от этого персонажа', icon: 'chat', hidden: role !== 'char' || !msg.charId || s.chat?.ownerType !== 'group', onClick: () => generateReplies(msg.charId) },
      { label: 'Сжать главу до сюда', icon: 'memory', hidden: !s.settings.extensions.enabled.memory, onClick: () => summarizeChapter({ start: pendingRange(s.chat!).start, end: idx }).catch((e) => toastError(e)) },
      { label: 'Перевести', icon: 'globe', hidden: !s.settings.extensions.enabled.translate, onClick: () => translateMessage(msg.id).catch((e) => toastError(e)) },
      { label: 'Озвучить', icon: 'speaker', hidden: !s.settings.extensions.enabled.tts, onClick: () => import('../../lib/tts').then((m) => m.speak(msg.text)) },
      { label: 'Сдвинуть выше', icon: 'up', hidden: idx === 0, onClick: () => moveMessage(msg.id, -1) },
      { label: 'Сдвинуть ниже', icon: 'down', hidden: p.isLast, onClick: () => moveMessage(msg.id, 1) },
      { label: 'Запрос к модели', icon: 'eye', hidden: role !== 'char' || !p.isLast || !s.lastPrompt, onClick: () => navigate('presets', 'preview') },
      { separator: true, label: '' },
      {
        label: 'Удалить сообщение',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          if (getState().settings.chat.confirmDelete && !(await confirmDialog('Удалить сообщение?', { ok: 'Удалить' }))) return;
          deleteMessages([msg.id]);
        },
      },
      {
        label: 'Удалить отсюда и до конца',
        icon: 'trash',
        danger: true,
        hidden: p.isLast,
        onClick: async () => {
          const ids = getState().chat!.messages.slice(idx).map((m) => m.id);
          if (await confirmDialog(`Удалить ${ids.length} сообщений начиная с этого?`, { ok: 'Удалить' })) deleteMessages(ids);
        },
      },
    ];
  };

  const genInfo = msg.gen && p.showGen && role === 'char' ? [msg.gen.model, msg.gen.ms ? `${(msg.gen.ms / 1000).toFixed(1)} с` : '', msg.gen.tokens ? `${fmtNum(msg.gen.tokens)} ток.` : ''].filter(Boolean).join(' · ') : '';
  const showTyping = p.streaming && !msg.text && !msg.reasoning;
  const showSwipes = role === 'char' && (msg.swipes.length > 1 || (p.isLast && p.index > 0));
  const translation = msg.translation && !showOriginal;

  return (
    <article
      className={`cs-message is-${role}${msg.hidden ? ' is-hidden' : ''}${editing ? ' cs-message--editing' : ''}`}
      data-mid={msg.id}
      onContextMenu={(e) => {
        if (editing) return;
        e.preventDefault();
        openMenu(e, menuItems());
      }}
      onTouchStart={(e) => {
        if (editing) return;
        const t = e.touches[0];
        pressTimer.current = setTimeout(() => openMenu({ clientX: t.clientX, clientY: t.clientY }, menuItems()), 520);
      }}
      onTouchEnd={() => pressTimer.current && clearTimeout(pressTimer.current)}
      onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
    >
      {role !== 'system' ? <Avatar src={p.avatar} name={msg.name} kana={p.kana} palette={p.palette} size={40} /> : null}
      <div className="cs-message__body">
        <div className="cs-bubble">
          {!editing ? (
            <div className="cs-msg-tools">
              {role === 'char' && p.isLast ? (
                <button type="button" className="cs-icon-btn" aria-label="Новый вариант" title="Новый вариант" onClick={() => generateSwipe(msg.id)} disabled={p.generating}>
                  <Icon name="refresh" size={15} />
                </button>
              ) : null}
              <button type="button" className="cs-icon-btn" aria-label="Править" title="Править" onClick={startEdit}>
                <Icon name="edit" size={15} />
              </button>
              <button type="button" className="cs-icon-btn" aria-label="Ветка" title="Ветка отсюда" onClick={() => branchFrom(msg.id)}>
                <Icon name="branch" size={15} />
              </button>
              <button type="button" className="cs-icon-btn" aria-label="Ещё" title="Ещё" onClick={(e) => openMenu(e.currentTarget, menuItems())}>
                <Icon name="dots" size={15} />
              </button>
            </div>
          ) : null}
          <div className="cs-msg-head">
            <strong className="cs-name">{msg.name}</strong>
            {p.showTime ? (
              <span className="cs-msg-time">
                {fmtTime(msg.sendDate)}
                {role === 'user' && msg.personaId ? ' · персона' : ''}
              </span>
            ) : null}
            {msg.hidden ? (
              <span className="cs-badge-hidden" title="Не отправляется модели">
                <Icon name="eyeOff" size={13} /> скрыто
              </span>
            ) : null}
            {msg.bookmark ? <Icon name="bookmark" size={14} style={{ color: 'var(--cs-accent)' }} /> : null}
            {genInfo ? <span className="cs-msg-meta">{genInfo}</span> : null}
            {showSwipes ? (
              <span className="cs-swipes">
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label="Предыдущий вариант" disabled={msg.swipeId === 0 || p.generating} onClick={() => swipe(msg.id, -1)}>
                  <Icon name="left" size={14} stroke={2.2} />
                </button>
                <span>
                  {msg.swipeId + 1} / {msg.swipes.length}
                </span>
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label="Следующий вариант" disabled={p.generating || (!p.isLast && msg.swipeId >= msg.swipes.length - 1)} onClick={() => swipe(msg.id, 1)}>
                  <Icon name="right" size={14} stroke={2.2} />
                </button>
              </span>
            ) : null}
          </div>

          {msg.reasoning ? (
            <details className="cs-reasoning" open={!p.collapseReasoning || (p.streaming && !msg.text)}>
              <summary>
                <Icon name="thought" size={16} />
                {p.streaming && !msg.text ? 'Модель думает…' : 'Мысли модели'}
              </summary>
              <div className="cs-reasoning__body">{msg.reasoning}</div>
            </details>
          ) : null}

          {editing ? (
            <>
              <textarea
                className="cs-msg-edit"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false);
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                }}
                style={{ height: Math.min(520, Math.max(120, draft.split('\n').length * 26 + 40)) }}
              />
              <div className="cs-row">
                <button type="button" className="cs-btn cs-btn--sm" onClick={() => setEditing(false)}>
                  Отмена
                </button>
                <button type="button" className="cs-btn cs-btn--sm cs-btn--primary" onClick={saveEdit}>
                  Сохранить
                </button>
                <span className="cs-hint">Ctrl+Enter — сохранить</span>
              </div>
            </>
          ) : showTyping ? (
            <span className="cs-typing" aria-label="Печатает">
              <i />
              <i />
              <i />
            </span>
          ) : translation ? (
            <div className="cs-msg-text" dangerouslySetInnerHTML={{ __html: formatMessage(msg.translation!, { markdown: p.markdown, html: p.html }) }} />
          ) : docHtml ? (
            <>
              <HtmlFrame html={displayText} dark={p.dark} />
              <span className="cs-html-note">HTML-блок · в песочнице, скрипты выключены</span>
            </>
          ) : (
            <div className={`cs-msg-text${p.streaming ? ' cs-caret' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
          )}

          {msg.translation ? (
            <button type="button" className="cs-btn cs-btn--xs" style={{ alignSelf: 'flex-start' }} onClick={() => setShowOriginal(!showOriginal)}>
              <Icon name="globe" size={14} /> {showOriginal ? 'Показать перевод' : 'Показать оригинал'}
            </button>
          ) : null}

          {msg.image ? (
            <img
              className="cs-msg-image"
              src={msg.image}
              alt="Кадр сцены"
              loading="lazy"
              onClick={() => window.open(msg.image, '_blank', 'noopener')}
            />
          ) : null}

          {msg.attachments?.length ? (
            <div className="cs-msg-attachments">
              {msg.attachments.map((a, i) =>
                a.kind === 'image' ? (
                  <img key={i} src={a.url} alt={a.name} loading="lazy" />
                ) : (
                  <span key={i} className="cs-attach-chip">
                    <Icon name="attach" size={14} /> {a.name}
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>

        {p.isLastChar && !editing && !p.generating ? (
          <div className="cs-msg-actions">
            <button type="button" className="cs-msg-action" onClick={() => generateSwipe(msg.id)} disabled={p.index === 0 && p.isLast}>
              <Icon name="refresh" size={16} stroke={2} />
              Свайп
            </button>
            <button type="button" className="cs-msg-action" onClick={() => continueMessage(msg.id)}>
              <Icon name="arrow" size={16} stroke={2} />
              Продолжить
            </button>
            <button type="button" className="cs-msg-action" onClick={startEdit}>
              <Icon name="edit" size={16} stroke={2} />
              Править
            </button>
            {getState().settings.extensions.enabled.images ? (
              <button
                type="button"
                className="cs-msg-action"
                onClick={async () => {
                  try {
                    const { generateSceneFrame } = await import('../../lib/images');
                    await generateSceneFrame({ insert: true });
                  } catch (err) {
                    toastError(err, 'Кадр сцены');
                  }
                }}
              >
                <Icon name="images" size={16} stroke={2} />
                Кадр сцены
              </button>
            ) : null}
            {getState().settings.extensions.enabled.memory ? (
              <button
                type="button"
                className="cs-msg-action"
                onClick={() => {
                  const s = getState();
                  summarizeChapter({ start: pendingRange(s.chat!).start, end: p.index }).catch((e) => toastError(e, 'Memory Book'));
                }}
              >
                <Icon name="memory" size={16} stroke={2} />В память
              </button>
            ) : null}
            <button type="button" className="cs-msg-action" onClick={() => branchFrom(msg.id)}>
              <Icon name="branch" size={16} stroke={2} />
              Ветка
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const Message = memo(MessageView);
