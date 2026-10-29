import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, RegexScript } from '../../lib/types';
import { applyRegex, PLACEMENT } from '../../lib/regex';
import { formatMessage, isDocumentHtml, hasLiveHtml } from '../../lib/markdown';
import { t } from '../../lib/i18n';
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
  allowScripts: boolean;
  collapseReasoning: boolean;
  dark: boolean;
}

// Height reporter injected into frames that run scripts: the parent can't look inside them.
const RESIZE_SCRIPT = `<script>(function(){
  var last = 0;
  function post() {
    var b = document.body;
    var h = Math.ceil(Math.max(b ? b.scrollHeight : 0, b ? b.getBoundingClientRect().height : 0));
    if (h !== last) { last = h; parent.postMessage({ csFrameHeight: h }, '*'); }
  }
  addEventListener('load', post);
  document.addEventListener('DOMContentLoaded', function () {
    post();
    if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
    new MutationObserver(post).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
})();</script>`;

/**
 * Renders HTML in an isolated frame. Without scripts the frame shares nothing but
 * styles with the app; with scripts it gets an opaque origin instead (no
 * allow-same-origin), so card code can't reach the app, its storage or the keys.
 */
function HtmlFrame({ html, dark, scripts }: { html: string; dark: boolean; scripts: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);
  const doc = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n);
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
      html,body{margin:0;padding:0;background:transparent;color:${v('--cs-text')};font:15px/1.55 ${v('--cs-font-body')};color-scheme:${dark ? 'dark' : 'light'}}
      body{overflow-wrap:anywhere}
      img{max-width:100%}
      .cs-quote{color:${v('--cs-quote')}}
      pre{white-space:pre-wrap}
    </style>${scripts ? RESIZE_SCRIPT : ''}</head><body>${scripts ? html : html.replace(/<script[\s\S]*?<\/script>/gi, '')}</body></html>`;
  }, [html, dark, scripts]);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const fit = (h: number) => setHeight(Math.min(4000, Math.max(24, h)));
    if (scripts) {
      const onMessage = (e: MessageEvent) => {
        if (e.source === frame.contentWindow && typeof e.data?.csFrameHeight === 'number') fit(e.data.csFrameHeight);
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) fit(body.scrollHeight);
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
  }, [doc, scripts]);
  return (
    <iframe
      ref={ref}
      className="cs-html-frame"
      title={t('HTML block')}
      sandbox={scripts ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'}
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

  // Widgets with scripts run once the reply is complete: a frame reloads on every change.
  const live = p.allowScripts && !p.streaming && hasLiveHtml(displayText, p.html);
  const docHtml = !live && p.html && p.htmlIframe && isDocumentHtml(displayText);
  const html = useMemo(
    () => (docHtml ? '' : formatMessage(displayText, { markdown: p.markdown, html: p.html, live })),
    [displayText, docHtml, live, p.markdown, p.html],
  );

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
      { label: t('Edit'), icon: 'edit', onClick: startEdit },
      { label: t('Copy text'), icon: 'copy', onClick: () => copyText(msg.text).then(() => toast(t('Copied'))) },
      { label: msg.hidden ? t('Bring back into the context') : t('Hide from the model'), icon: msg.hidden ? 'eye' : 'eyeOff', onClick: () => setHidden([msg.id], !msg.hidden) },
      { label: t('Branch from here'), icon: 'branch', onClick: () => branchFrom(msg.id) },
      { label: msg.bookmark ? t('Remove bookmark') : t('Bookmark'), icon: 'bookmark', onClick: () => updateMessage(msg.id, { bookmark: !msg.bookmark }) },
      { separator: true, label: '' },
      { label: t('Continue the reply'), icon: 'arrow', hidden: role !== 'char', onClick: () => continueMessage(msg.id) },
      { label: t('New variant (swipe)'), icon: 'refresh', hidden: role !== 'char' || !p.isLast, onClick: () => generateSwipe(msg.id) },
      { label: t('Delete this variant'), icon: 'close', hidden: msg.swipes.length < 2, onClick: () => deleteSwipe(msg.id) },
      { label: t('Reply as this character'), icon: 'chat', hidden: role !== 'char' || !msg.charId || s.chat?.ownerType !== 'group', onClick: () => generateReplies(msg.charId) },
      { label: t('Condense the chapter up to here'), icon: 'memory', hidden: !s.settings.extensions.enabled.memory, onClick: () => summarizeChapter({ start: pendingRange(s.chat!).start, end: idx }).catch((e) => toastError(e)) },
      { label: t('Translate'), icon: 'globe', hidden: !s.settings.extensions.enabled.translate, onClick: () => translateMessage(msg.id).catch((e) => toastError(e)) },
      { label: t('Read aloud'), icon: 'speaker', hidden: !s.settings.extensions.enabled.tts, onClick: () => import('../../lib/tts').then((m) => m.speak(msg.text)) },
      { label: t('Move up'), icon: 'up', hidden: idx === 0, onClick: () => moveMessage(msg.id, -1) },
      { label: t('Move down'), icon: 'down', hidden: p.isLast, onClick: () => moveMessage(msg.id, 1) },
      { label: t('Request to the model'), icon: 'eye', hidden: role !== 'char' || !p.isLast || !s.lastPrompt, onClick: () => navigate('presets', 'preview') },
      { separator: true, label: '' },
      {
        label: t('Delete the message'),
        icon: 'trash',
        danger: true,
        onClick: async () => {
          if (getState().settings.chat.confirmDelete && !(await confirmDialog(t('Delete the message?'), { ok: t('Delete') }))) return;
          deleteMessages([msg.id]);
        },
      },
      {
        label: t('Delete from here to the end'),
        icon: 'trash',
        danger: true,
        hidden: p.isLast,
        onClick: async () => {
          const ids = getState().chat!.messages.slice(idx).map((m) => m.id);
          if (await confirmDialog(t('Delete {n} messages starting from this one?', { n: ids.length }), { ok: t('Delete') })) deleteMessages(ids);
        },
      },
    ];
  };

  const genInfo = msg.gen && p.showGen && role === 'char' ? [msg.gen.model, msg.gen.ms ? t('{x} s', { x: (msg.gen.ms / 1000).toFixed(1) }) : '', msg.gen.tokens ? t('{tokens} tok.', { tokens: fmtNum(msg.gen.tokens) }) : ''].filter(Boolean).join(' · ') : '';
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
        const touch = e.touches[0];
        pressTimer.current = setTimeout(() => openMenu({ clientX: touch.clientX, clientY: touch.clientY }, menuItems()), 520);
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
                <button type="button" className="cs-icon-btn" aria-label={t('New variant')} title={t('New variant')} onClick={() => generateSwipe(msg.id)} disabled={p.generating}>
                  <Icon name="refresh" size={15} />
                </button>
              ) : null}
              <button type="button" className="cs-icon-btn" aria-label={t('Edit')} title={t('Edit')} onClick={startEdit}>
                <Icon name="edit" size={15} />
              </button>
              <button type="button" className="cs-icon-btn" aria-label={t('Branch')} title={t('Branch from here')} onClick={() => branchFrom(msg.id)}>
                <Icon name="branch" size={15} />
              </button>
              <button type="button" className="cs-icon-btn" aria-label={t('More')} title={t('More')} onClick={(e) => openMenu(e.currentTarget, menuItems())}>
                <Icon name="dots" size={15} />
              </button>
            </div>
          ) : null}
          <div className="cs-msg-head">
            <strong className="cs-name">{msg.name}</strong>
            {p.showTime ? (
              <span className="cs-msg-time">
                {fmtTime(msg.sendDate)}
                {role === 'user' && msg.personaId ? t(' · persona') : ''}
              </span>
            ) : null}
            {msg.hidden ? (
              <span className="cs-badge-hidden" title={t('Not sent to the model')}>
                <Icon name="eyeOff" size={13} /> {t('hidden')}
              </span>
            ) : null}
            {msg.bookmark ? <Icon name="bookmark" size={14} style={{ color: 'var(--cs-accent)' }} /> : null}
            {genInfo ? <span className="cs-msg-meta">{genInfo}</span> : null}
            {showSwipes ? (
              <span className="cs-swipes">
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label={t('Previous variant')} disabled={msg.swipeId === 0 || p.generating} onClick={() => swipe(msg.id, -1)}>
                  <Icon name="left" size={14} stroke={2.2} />
                </button>
                <span>
                  {msg.swipeId + 1} / {msg.swipes.length}
                </span>
                <button type="button" className="cs-icon-btn cs-icon-btn--xs" aria-label={t('Next variant')} disabled={p.generating || (!p.isLast && msg.swipeId >= msg.swipes.length - 1)} onClick={() => swipe(msg.id, 1)}>
                  <Icon name="right" size={14} stroke={2.2} />
                </button>
              </span>
            ) : null}
          </div>

          {msg.reasoning ? (
            <details className="cs-reasoning" open={!p.collapseReasoning || (p.streaming && !msg.text)}>
              <summary>
                <Icon name="thought" size={16} />
                {p.streaming && !msg.text ? t('The model is thinking…') : t('Model reasoning')}
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
                  {t('Cancel')}
                </button>
                <button type="button" className="cs-btn cs-btn--sm cs-btn--primary" onClick={saveEdit}>
                  {t('Save')}
                </button>
                <span className="cs-hint">{t('Ctrl+Enter — save')}</span>
              </div>
            </>
          ) : showTyping ? (
            <span className="cs-typing" aria-label={t('Typing')}>
              <i />
              <i />
              <i />
            </span>
          ) : translation ? (
            <div className="cs-msg-text" dangerouslySetInnerHTML={{ __html: formatMessage(msg.translation!, { markdown: p.markdown, html: p.html }) }} />
          ) : live ? (
            <HtmlFrame html={html} dark={p.dark} scripts />
          ) : docHtml ? (
            <>
              <HtmlFrame html={displayText} dark={p.dark} scripts={false} />
              <span className="cs-html-note">{p.allowScripts ? t('HTML block · in a sandbox') : t('HTML block · in a sandbox, scripts are off (Settings → General)')}</span>
            </>
          ) : (
            <div className={`cs-msg-text${p.streaming ? ' cs-caret' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
          )}

          {msg.translation ? (
            <button type="button" className="cs-btn cs-btn--xs" style={{ alignSelf: 'flex-start' }} onClick={() => setShowOriginal(!showOriginal)}>
              <Icon name="globe" size={14} /> {showOriginal ? t('Show the translation') : t('Show the original')}
            </button>
          ) : null}

          {msg.image ? (
            <img
              className="cs-msg-image"
              src={msg.image}
              alt={t('Scene frame')}
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
              {t('Swipe')}
            </button>
            <button type="button" className="cs-msg-action" onClick={() => continueMessage(msg.id)}>
              <Icon name="arrow" size={16} stroke={2} />
              {t('Continue')}
            </button>
            <button type="button" className="cs-msg-action" onClick={startEdit}>
              <Icon name="edit" size={16} stroke={2} />
              {t('Edit')}
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
                    toastError(err, t('Scene frame'));
                  }
                }}
              >
                <Icon name="images" size={16} stroke={2} />
                {t('Scene frame')}
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
                <Icon name="memory" size={16} stroke={2} />{t('To memory')}
              </button>
            ) : null}
            <button type="button" className="cs-msg-action" onClick={() => branchFrom(msg.id)}>
              <Icon name="branch" size={16} stroke={2} />
              {t('Branch')}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const Message = memo(MessageView);
