import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Icon } from './Icon';
import { paletteFor, toKana } from '../lib/utils';
import { t } from '../lib/i18n';

// ───────── Switch ─────────

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className="cs-switch"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

// ───────── Field ─────────

export function Field({ label, hint, children, className = '', honey, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; honey?: boolean; htmlFor?: string }) {
  const content = (
    <>
      <span className={`cs-label${honey ? ' cs-label--honey' : ''}`}>{label}</span>
      {children}
      {hint ? <span className="cs-hint">{hint}</span> : null}
    </>
  );
  if (htmlFor) {
    return (
      <div className={`cs-field ${honey ? 'cs-field--honey' : ''} ${className}`}>
        <label htmlFor={htmlFor} className={`cs-label${honey ? ' cs-label--honey' : ''}`}>
          {label}
        </label>
        {children}
        {hint ? <span className="cs-hint">{hint}</span> : null}
      </div>
    );
  }
  return <label className={`cs-field ${honey ? 'cs-field--honey' : ''} ${className}`}>{content}</label>;
}

// ───────── Range with editable value ─────────

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (format ? format(value) : String(value));
  return (
    <label className="cs-range" title={hint}>
      <span className="cs-range-head">
        <span>{label}</span>
        <input
          className="cs-range-value"
          value={shown}
          inputMode="decimal"
          aria-label={typeof label === 'string' ? t('{label}: value', { label }) : t('value')}
          onFocus={() => setDraft(String(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(String(draft).replace(/\s/g, '').replace(',', '.'));
            if (Number.isFinite(n)) onChange(n);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

// ───────── Tabs & choices ─────────

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  block,
  label,
}: {
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  block?: boolean;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`cs-tabs${block ? ' cs-tabs--block' : ''}`}>
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className="cs-tab" onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Choices<T extends string>({
  items,
  value,
  onChange,
  small,
  label,
}: {
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="cs-chips">
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={`cs-choice${small ? ' cs-choice--sm' : ''}`} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children, chip, row, style }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; chip?: boolean; row?: boolean; style?: CSSProperties }) {
  return (
    <label className={`cs-check${chip ? ' cs-check--chip' : ''}${row ? ' cs-check--row' : ''}`} style={style}>
      {row ? children : null}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {row ? null : children}
    </label>
  );
}

// ───────── Avatar ─────────

export function Avatar({
  src,
  name,
  kana,
  palette,
  size = 40,
  ring,
  className = '',
}: {
  src?: string;
  name: string;
  kana?: string;
  palette?: number;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const p = paletteFor(palette, name);
  const letter = (kana || toKana(name, 1)).slice(0, 1);
  return (
    <span
      className={`cs-avatar${ring ? ' cs-avatar--ring' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: p.orb, color: p.ink }}
      aria-hidden="true"
    >
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : letter}
    </span>
  );
}

// ───────── Modal ─────────

export function Modal({
  title,
  onClose,
  children,
  footer,
  size,
  kana,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide' | 'narrow';
  kana?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.cs-modal-close)')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="cs-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`cs-modal${size ? ` cs-modal--${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="cs-modal-head">
          <h2 className="cs-h2">{title}</h2>
          {kana ? <span className="cs-kana" aria-hidden="true">{kana}</span> : null}
          <button type="button" className="cs-icon-btn cs-icon-btn--soft cs-modal-close cs-ml-auto" aria-label={t('Close')} onClick={onClose}>
            <Icon name="close" size={16} stroke={2.2} />
          </button>
        </div>
        {children}
        {footer ? <div className="cs-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div className="cs-drawer-backdrop" onClick={onClose} />
      <aside className="cs-drawer" role="dialog" aria-modal="true">
        <div className="cs-row">
          {title ? <h2 className="cs-h2">{title}</h2> : null}
          <button type="button" className="cs-icon-btn cs-icon-btn--soft cs-ml-auto" aria-label={t('Close')} onClick={onClose}>
            <Icon name="close" size={16} stroke={2.2} />
          </button>
        </div>
        {children}
      </aside>
    </>,
    document.body,
  );
}

// ───────── Global menus & dialogs ─────────

export interface MenuItem {
  label: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  hidden?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

interface DialogState {
  menu: { x: number; y: number; items: MenuItem[]; sheet: boolean } | null;
  confirm: { text: string; title: string; ok: string; danger: boolean; resolve: (v: boolean) => void } | null;
  prompt: { title: string; label: string; value: string; multiline: boolean; resolve: (v: string | null) => void } | null;
}

const useDialogs = create<DialogState>(() => ({ menu: null, confirm: null, prompt: null }));

export function openMenu(e: { clientX: number; clientY: number } | HTMLElement, items: MenuItem[]) {
  const visible = items.filter((i) => !i.hidden);
  const sheet = window.matchMedia('(max-width: 760px)').matches;
  if (e instanceof HTMLElement) {
    const r = e.getBoundingClientRect();
    useDialogs.setState({ menu: { x: r.right, y: r.bottom + 6, items: visible, sheet } });
  } else useDialogs.setState({ menu: { x: e.clientX, y: e.clientY, items: visible, sheet } });
}

export function closeMenu() {
  useDialogs.setState({ menu: null });
}

export function confirmDialog(text: string, opts: { title?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) =>
    useDialogs.setState({ confirm: { text, title: opts.title || t('Confirm'), ok: opts.ok || t('Yes'), danger: opts.danger ?? true, resolve } }),
  );
}

export function promptDialog(title: string, opts: { label?: string; value?: string; multiline?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) =>
    useDialogs.setState({ prompt: { title, label: opts.label || '', value: opts.value || '', multiline: !!opts.multiline, resolve } }),
  );
}

function MenuView({ menu }: { menu: NonNullable<DialogState['menu']> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || menu.sheet) return;
    const r = el.getBoundingClientRect();
    let left = menu.x - r.width;
    if (left < 8) left = Math.min(menu.x, window.innerWidth - r.width - 8);
    let top = menu.y;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, menu.y - r.height - 12);
    setPos({ left: Math.max(8, left), top });
  }, [menu]);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('scroll', close, true);
    });
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const items = menu.items.map((it, i) =>
    it.separator ? (
      <div key={i} className="cs-menu-sep" />
    ) : (
      <button
        key={i}
        type="button"
        role="menuitem"
        disabled={it.disabled}
        className={`cs-menu-item${it.danger ? ' cs-menu-item--danger' : ''}`}
        onClick={() => {
          closeMenu();
          it.onClick?.();
        }}
      >
        {it.icon ? <Icon name={it.icon} size={18} /> : null}
        {it.label}
      </button>
    ),
  );
  if (menu.sheet) {
    return (
      <>
        <div className="cs-drawer-backdrop" style={{ zIndex: 100 }} />
        <div ref={ref} className="cs-sheet" role="menu">
          {items}
        </div>
      </>
    );
  }
  return (
    <div ref={ref} className="cs-menu" role="menu" style={pos}>
      {items}
    </div>
  );
}

export function DialogHost() {
  const { menu, confirm, prompt } = useDialogs();
  const [value, setValue] = useState('');
  useEffect(() => setValue(prompt?.value || ''), [prompt]);
  return (
    <>
      {menu ? createPortal(<MenuView menu={menu} />, document.body) : null}
      {confirm ? (
        <Modal
          title={confirm.title}
          size="narrow"
          onClose={() => {
            confirm.resolve(false);
            useDialogs.setState({ confirm: null });
          }}
          footer={
            <>
              <button
                type="button"
                className="cs-btn"
                onClick={() => {
                  confirm.resolve(false);
                  useDialogs.setState({ confirm: null });
                }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className={`cs-btn ${confirm.danger ? 'cs-btn--primary' : 'cs-btn--mint'}`}
                onClick={() => {
                  confirm.resolve(true);
                  useDialogs.setState({ confirm: null });
                }}
              >
                {confirm.ok}
              </button>
            </>
          }
        >
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{confirm.text}</p>
        </Modal>
      ) : null}
      {prompt ? (
        <Modal
          title={prompt.title}
          size="narrow"
          onClose={() => {
            prompt.resolve(null);
            useDialogs.setState({ prompt: null });
          }}
          footer={
            <>
              <button
                type="button"
                className="cs-btn"
                onClick={() => {
                  prompt.resolve(null);
                  useDialogs.setState({ prompt: null });
                }}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="cs-btn cs-btn--primary"
                onClick={() => {
                  prompt.resolve(value);
                  useDialogs.setState({ prompt: null });
                }}
              >
                {t('Done')}
              </button>
            </>
          }
        >
          <Field label={prompt.label || t('Value')}>
            {prompt.multiline ? (
              <textarea className="cs-textarea" rows={5} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            ) : (
              <input
                className="cs-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    prompt.resolve(value);
                    useDialogs.setState({ prompt: null });
                  }
                }}
              />
            )}
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

// ───────── Tag input ─────────

export function TagInput({ value, onChange, placeholder = t('+ key'), mono = true }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; mono?: boolean }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <div className="cs-chips" style={{ alignItems: 'center' }}>
      {value.map((chip, i) => (
        <span key={`${chip}-${i}`} className="cs-tag" style={mono ? undefined : { fontFamily: 'var(--cs-font-body)' }}>
          {chip}
          <button type="button" aria-label={t('Remove {chip}', { chip })} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="cs-tag-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) {
            setDraft(e.target.value);
            setTimeout(commit);
          } else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}

// ───────── Code editor (textarea over a highlighted layer) ─────────

function highlight(code: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (lang === 'css') {
    return esc(code)
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-com">$1</span>')
      .replace(/(--[\w-]+)(?=\s*:)/g, '<span class="tok-var">$1</span>')
      .replace(/^(\s*)([\w-]+)(\s*:)(?![^{]*\{)/gm, '$1<span class="tok-prop">$2</span><span class="tok-pun">$3</span>')
      .replace(/(:\s*)([^;{}\n]+)(;)/g, '$1<span class="tok-val">$2</span><span class="tok-pun">$3</span>')
      .replace(/^([^{}\n]+)(\{)/gm, '<span class="tok-sel">$1</span><span class="tok-pun">$2</span>')
      .replace(/(\})/g, '<span class="tok-pun">$1</span>');
  }
  if (lang === 'json') {
    return esc(code)
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="tok-prop">$1</span><span class="tok-pun">$2</span>')
      .replace(/(:\s*)("(?:[^"\\]|\\.)*")/g, '$1<span class="tok-str">$2</span>')
      .replace(/\b(-?\d+(?:\.\d+)?|true|false|null)\b/g, '<span class="tok-num">$1</span>')
      .replace(/(\{\{[^}]+\}\})/g, '<span class="tok-var">$1</span>');
  }
  if (lang === 'html') {
    return esc(code)
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tok-sel">$2</span>')
      .replace(/([\w-]+)(=)("[^"]*")/g, '<span class="tok-prop">$1</span>$2<span class="tok-str">$3</span>')
      .replace(/(\$\d+|\{\{[^}]+\}\})/g, '<span class="tok-var">$1</span>');
  }
  if (lang === 'regex') {
    return esc(code)
      .replace(/(\\.)/g, '<span class="tok-prop">$1</span>')
      .replace(/(\((?:\?[:=!<]?)?|\))/g, '<span class="tok-sel">$1</span>')
      .replace(/([*+?]|\{\d+(?:,\d*)?\})/g, '<span class="tok-var">$1</span>')
      .replace(/^(\/)|(\/[dgimsuvy]*)$/g, '<span class="tok-pun">$1$2</span>');
  }
  return esc(code).replace(/(\{\{[^}]+\}\})/g, '<span class="tok-var">$1</span>');
}

export function CodeEditor({
  value,
  onChange,
  lang = 'text',
  minHeight = 200,
  label,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  lang?: 'css' | 'json' | 'html' | 'regex' | 'text';
  minHeight?: number;
  label?: string;
  readOnly?: boolean;
}) {
  const lines = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const html = useMemo(() => highlight(value, lang) + '\n', [value, lang]);
  const gutter = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1).join('\n'), [lines]);
  const hlRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  // 13px * 1.75 line height + 28px padding; grows with content up to 600px, then scrolls.
  const height = Math.min(600, Math.max(minHeight, lines * 22.75 + 30));
  const sync = (el: HTMLTextAreaElement) => {
    if (hlRef.current) {
      hlRef.current.scrollTop = el.scrollTop;
      hlRef.current.scrollLeft = el.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
  };
  return (
    <div className="cs-code-editor" style={{ height }}>
      <div className="cs-code-editor__gutter" aria-hidden="true" ref={gutterRef}>
        {gutter}
        {'\n\n'}
      </div>
      <div className="cs-code-editor__body">
        <pre className="cs-code-editor__hl" aria-hidden="true" ref={hlRef} dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          className="cs-code-editor__input"
          spellCheck={false}
          aria-label={label}
          value={value}
          readOnly={readOnly}
          onScroll={(e) => sync(e.currentTarget)}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !readOnly) {
              e.preventDefault();
              const area = e.currentTarget;
              const s = area.selectionStart;
              const next = `${value.slice(0, s)}  ${value.slice(area.selectionEnd)}`;
              onChange?.(next);
              requestAnimationFrame(() => area.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      </div>
    </div>
  );
}

// ───────── Sortable list (pointer-based, works with touch) ─────────

export function useSortable(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const handleProps = (index: number) => ({
    onPointerDown: (e: RPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ from: index, over: index });
    },
    onPointerMove: (e: RPointerEvent) => {
      if (!drag || !container.current) return;
      const rows = Array.from(container.current.querySelectorAll<HTMLElement>('[data-sort-row]'));
      let over = drag.over;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) over = i;
      }
      if (e.clientY < (rows[0]?.getBoundingClientRect().top ?? 0)) over = 0;
      if (e.clientY > (rows[rows.length - 1]?.getBoundingClientRect().bottom ?? 0)) over = count - 1;
      if (over !== drag.over) setDrag({ ...drag, over });
    },
    onPointerUp: () => {
      if (drag && drag.from !== drag.over) onMove(drag.from, drag.over);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    style: { cursor: 'grab', touchAction: 'none' } as CSSProperties,
  });
  return { drag, container, handleProps };
}

// ───────── Misc ─────────

export function Empty({ icon = 'sparkle', title, children }: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="cs-empty">
      <Icon name={icon} size={28} />
      <div style={{ fontSize: 15, color: 'var(--cs-text)', fontWeight: 800 }}>{title}</div>
      {children}
    </div>
  );
}

export function Kana({ children }: { children: ReactNode }) {
  return (
    <span className="cs-kana" aria-hidden="true">
      {children}
    </span>
  );
}

export function PageHead({ title, kana, sub, children, extra }: { title: ReactNode; kana?: string; sub?: ReactNode; children?: ReactNode; extra?: ReactNode }) {
  return (
    <header className="cs-page-head">
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div className="cs-page-title">
          <h1 className="cs-h1">{title}</h1>
          {kana ? <Kana>{kana}</Kana> : null}
          {extra}
        </div>
        {sub ? <div className="cs-sub">{sub}</div> : null}
      </div>
      {children}
    </header>
  );
}
