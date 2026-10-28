import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore, setState, updateSettingsSection, updateSettings, toastError, getState, navigate } from '../../lib/store';
import { sendUserMessage, impersonate, stopGeneration, editMessage, continueMessage, regenerateLast, generateReplies } from '../../lib/generate';
import { Icon } from '../../components/Icon';
import { openMenu } from '../../components/ui';
import { formatMessage } from '../../lib/markdown';
import { api } from '../../lib/api';
import type { Attachment, ImpersonateMode } from '../../lib/types';
import { slashHelp, runSlash } from '../../lib/slash';
import { pickFiles } from '../../lib/utils';

const MODES: { id: ImpersonateMode; label: string }[] = [
  { id: 'continue', label: 'Продолжить мою реплику' },
  { id: 'variants', label: '3 варианта' },
  { id: 'action', label: 'Только действие' },
  { id: 'voice', label: 'Голос персоны' },
];

export function Composer() {
  const draft = useStore((s) => s.composerDraft);
  const gen = useStore((s) => s.gen);
  const variants = useStore((s) => s.impersonateVariants);
  const imp = useStore((s) => s.settings.impersonate);
  const impEnabled = useStore((s) => s.settings.extensions.enabled.impersonate);
  const qrEnabled = useStore((s) => s.settings.extensions.enabled.quickreplies);
  const diceEnabled = useStore((s) => s.settings.extensions.enabled.dice && s.settings.extensions.dice.showBar);
  const quickreplies = useStore((s) => s.quickreplies);
  const sendOnEnter = useStore((s) => s.settings.chat.sendOnEnter);
  const persona = useStore((s) => s.personas.find((p) => p.id === (s.chat?.meta.personaId || s.settings.activePersonaId)) || s.personas[0]);
  const personas = useStore((s) => s.personas);
  const streamText = useStore((s) => s.streamText);
  const hasChat = useStore((s) => !!s.chat);
  const group = useStore((s) => (s.chat?.ownerType === 'group' ? s.groups.find((g) => g.id === s.chat!.ownerId) : undefined));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);

  const generating = gen.kind !== null;
  const impersonating = gen.kind === 'impersonate';
  const count = imp.count || 3;
  const modes = MODES.map((m) => (m.id === 'variants' ? { ...m, label: `${count} ${count < 5 ? 'варианта' : 'вариантов'}` } : m));

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.38)}px`;
  }, [draft]);

  useEffect(() => setSelected(0), [variants]);

  const hints = useMemo(() => {
    const m = /^\/(\w*)$/.exec(draft.trim());
    if (!m) return [];
    return slashHelp()
      .filter((c) => c.name.startsWith(m[1].toLowerCase()) || c.aliases.some((a) => a.startsWith(m[1].toLowerCase())))
      .slice(0, 12);
  }, [draft]);

  const setDraft = (v: string) => setState({ composerDraft: v });

  const send = async () => {
    if (generating) return;
    const text = draft;
    const att = attachments;
    setDraft('');
    setAttachments([]);
    try {
      await sendUserMessage(text, att);
    } catch (err) {
      toastError(err);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (hints.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setHintIdx((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + hints.length) % hints.length);
      return;
    }
    if (hints.length && e.key === 'Tab') {
      e.preventDefault();
      setDraft(`/${hints[hintIdx % hints.length].name} `);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const ctrl = e.ctrlKey || e.metaKey;
      const mobile = window.matchMedia('(max-width: 760px)').matches;
      if ((sendOnEnter === 'enter' && !ctrl && !mobile) || (sendOnEnter === 'ctrlEnter' && ctrl)) {
        e.preventDefault();
        send();
      }
    }
    if (e.key === 'ArrowUp' && !draft) {
      // ↑ in an empty box: edit your last message.
      const msgs = getState().chat?.messages || [];
      const last = [...msgs].reverse().find((m) => m.role === 'user');
      if (last) {
        e.preventDefault();
        const text = window.prompt('Править последнее сообщение', last.text);
        if (text !== null) editMessage(last.id, text);
      }
    }
  };

  const attach = async (kind: 'image' | 'file') => {
    const files = await pickFiles(kind === 'image' ? 'image/*' : '.txt,.md,.json,.csv,.html,text/*', true);
    for (const f of files) {
      try {
        if (kind === 'image') {
          const res = await api.upload('attachments', f, f.name);
          setAttachments((a) => [...a, { kind: 'image', url: res.url, name: f.name, mime: f.type || 'image/png' }]);
        } else {
          const text = (await f.text()).slice(0, 200000);
          setAttachments((a) => [...a, { kind: 'file', url: '', name: f.name, mime: f.type || 'text/plain', text }]);
        }
      } catch (err) {
        toastError(err, f.name);
      }
    }
  };

  const toolsMenu = (el: HTMLElement) =>
    openMenu(el, [
      { label: 'Прикрепить картинку', icon: 'images', onClick: () => attach('image') },
      { label: 'Прикрепить текстовый файл', icon: 'attach', onClick: () => attach('file') },
      { separator: true, label: '' },
      { label: 'Impersonate+ · предложить', icon: 'sparkle', hidden: !impEnabled, onClick: () => impersonate() },
      { label: 'Продолжить последний ответ', icon: 'arrow', onClick: () => continueMessage() },
      { label: 'Перегенерировать', icon: 'refresh', onClick: () => regenerateLast() },
      { label: 'Ответ без моего сообщения', icon: 'chat', onClick: () => generateReplies() },
      { label: 'Сообщение рассказчика', icon: 'note', onClick: () => setDraft('/sys ') },
      { label: 'Бросить кубик d20', icon: 'dice', onClick: () => runSlash('/roll 1d20') },
      { label: 'Список команд', icon: 'code', onClick: () => runSlash('/help') },
    ]);

  const personaMenu = (el: HTMLElement) =>
    openMenu(el, [
      ...personas.map((p) => ({
        label: `${p.name}${p.id === persona?.id ? ' · активна' : ''}`,
        icon: 'user',
        onClick: () => updateSettings({ activePersonaId: p.id }),
      })),
      { separator: true, label: '' },
      { label: 'Управлять персонами', icon: 'chars', onClick: () => navigate('library', 'personas') },
    ]);

  const qrs = qrEnabled ? quickreplies.filter((q) => q.enabled).flatMap((q) => q.replies) : [];

  return (
    <section className="cs-composer" aria-label="Ввод сообщения">
      {hints.length ? (
        <div className="cs-slash-hints" role="listbox" aria-label="Команды">
          {hints.map((h, i) => (
            <button key={h.name} type="button" role="option" aria-selected={i === hintIdx % hints.length} onClick={() => setDraft(`/${h.name} `)}>
              <code>/{h.name}</code>
              <span>{h.help.replace(/^\/\S+\s*(—\s*)?/, '')}</span>
            </button>
          ))}
        </div>
      ) : null}

      {impEnabled && hasChat ? (
        <div className="cs-impersonate">
          <button type="button" className="cs-impersonate__label" onClick={() => impersonate()} disabled={generating} title="Предложить реплику">
            <Icon name="sparkle" size={18} />
            Impersonate+
          </button>
          <select
            className="cs-select cs-select--sm cs-imp-mode-mobile"
            value={imp.mode}
            aria-label="Режим Impersonate+"
            onChange={(e) => updateSettingsSection('impersonate', { mode: e.target.value as ImpersonateMode })}
          >
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cs-choice cs-choice--sm"
              aria-pressed={imp.mode === m.id}
              onClick={() => {
                updateSettingsSection('impersonate', { mode: m.id });
              }}
            >
              {m.label}
            </button>
          ))}
          <label className="cs-direction">
            Направление
            <input value={imp.direction} placeholder="например: мягкий флирт, без спешки" onChange={(e) => updateSettingsSection('impersonate', { direction: e.target.value })} />
            <button
              type="button"
              className="cs-icon-btn"
              aria-label={impersonating ? 'Остановить' : 'Предложить реплику'}
              title={impersonating ? 'Остановить' : 'Предложить'}
              onClick={() => (impersonating ? stopGeneration() : impersonate())}
              disabled={generating && !impersonating}
            >
              <Icon name={impersonating ? 'stop' : 'sparkle'} size={15} />
            </button>
          </label>
        </div>
      ) : null}

      {impEnabled && (variants.length > 1 || (impersonating && imp.mode !== 'continue')) ? (
        <div className="cs-variants">
          {impersonating && !variants.length ? (
            <div className="cs-variant" aria-pressed="false">
              <span className="cs-variant__label">Придумываю варианты…</span>
              <span dangerouslySetInnerHTML={{ __html: formatMessage(streamText.slice(-400), { markdown: true, html: false }) }} />
            </div>
          ) : (
            variants.map((v, i) => (
              <button
                key={i}
                type="button"
                className="cs-variant"
                aria-pressed={selected === i}
                onClick={() => {
                  setSelected(i);
                  setDraft(v);
                  ta.current?.focus();
                }}
              >
                <span className="cs-variant__label">
                  Вариант {String.fromCharCode(65 + i)}
                  {selected === i ? ' · выбран' : ''}
                </span>
                <span dangerouslySetInnerHTML={{ __html: formatMessage(v, { markdown: true, html: false }) }} />
              </button>
            ))
          )}
        </div>
      ) : null}

      {qrs.length || diceEnabled ? (
        <div className="cs-qr-bar">
          {qrs.map((q) => (
            <button key={q.id} type="button" className="cs-btn cs-btn--xs cs-btn--ghost" title={q.title || q.message} disabled={generating} onClick={() => runSlash(q.message.startsWith('/') ? q.message : `/send ${q.message}|/trigger`)}>
              {q.label}
            </button>
          ))}
          {diceEnabled
            ? ['1d4', '1d6', '1d20', '2d6'].map((d) => (
                <button key={d} type="button" className="cs-btn cs-btn--xs cs-btn--ghost" onClick={() => runSlash(`/roll ${d}`)}>
                  <Icon name="dice" size={14} /> {d}
                </button>
              ))
            : null}
        </div>
      ) : null}

      {attachments.length ? (
        <div className="cs-attach-list">
          {attachments.map((a, i) => (
            <span key={i} className="cs-attach-chip">
              {a.kind === 'image' ? <img src={a.url} alt="" /> : <Icon name="attach" size={14} />}
              <span className="cs-ellipsis">{a.name}</span>
              <button type="button" aria-label="Убрать" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="cs-input-row">
        <button type="button" className="cs-icon-btn cs-icon-btn--soft" style={{ width: 44, height: 44 }} aria-label="Инструменты" onClick={(e) => toolsMenu(e.currentTarget)}>
          <Icon name="plus" size={20} stroke={2} />
        </button>
        <label className="cs-input-box">
          <span className="cs-input-box__label">
            Твой ход ·
            <button type="button" onClick={(e) => (e.preventDefault(), personaMenu(e.currentTarget))}>
              {persona?.name || 'персона'}
            </button>
            {group ? <span style={{ marginLeft: 'auto' }}>группа · {group.activation === 'manual' ? 'ручной порядок' : 'естественный порядок'}</span> : null}
          </span>
          <textarea
            ref={ta}
            rows={2}
            value={draft}
            placeholder={hasChat ? 'Напиши реплику или /команду…' : 'Выберите персонажа в библиотеке'}
            disabled={!hasChat}
            onChange={(e) => {
              setDraft(e.target.value);
              setHintIdx(0);
            }}
            onKeyDown={onKeyDown}
            onPaste={async (e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
              if (!files.length) return;
              e.preventDefault();
              for (const f of files) {
                const res = await api.upload('attachments', f, f.name || 'paste.png');
                setAttachments((a) => [...a, { kind: 'image', url: res.url, name: f.name || 'картинка', mime: f.type }]);
              }
            }}
          />
        </label>
        {generating && !impersonating ? (
          <button type="button" className="cs-send" aria-label="Остановить" title="Остановить генерацию" onClick={stopGeneration}>
            <Icon name="stop" size={22} />
          </button>
        ) : (
          <button type="button" className="cs-send" aria-label="Отправить" title="Отправить" onClick={send} disabled={!hasChat || impersonating}>
            <Icon name="arrow" size={22} stroke={2.2} />
          </button>
        )}
      </div>
    </section>
  );
}
