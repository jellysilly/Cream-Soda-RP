import { useEffect, useState } from 'react';
import { useStore, upsert, removeItem, updateSettingsSection, toast, getState, currentThemeId } from '../../lib/store';
import { Field, RangeField, Check, CodeEditor, confirmDialog, openMenu, Kana, promptDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { THEME_TOKEN_LABELS, UI_CLASSES, BUILTIN_THEMES } from '../../lib/defaults';
import type { Theme, ThemeTokens } from '../../lib/types';
import { formatCss, applyTheme } from '../../lib/theme';
import { exportTheme, importThemesInteractive, uploadImage } from '../../lib/appActions';
import { pickFiles, uid } from '../../lib/utils';

type CssFile = 'theme' | 'chat' | 'mobile';

const HEADING_FONTS = ['M PLUS Rounded 1c', 'Nunito', 'Playfair Display', 'JetBrains Mono'];
const BODY_FONTS = ['Nunito', 'M PLUS Rounded 1c', 'Playfair Display'];

function toHex(v: string): string | null {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}

function Swatch({ t, selected, onClick, slot }: { t: Theme; selected: boolean; onClick: () => void; slot: string }) {
  return (
    <button
      type="button"
      className="cs-theme-swatch"
      aria-pressed={selected}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, [
          { label: 'Экспорт', icon: 'upload', onClick: () => exportTheme(t) },
          {
            label: 'Удалить',
            icon: 'trash',
            danger: true,
            hidden: !!t.builtin,
            onClick: async () => {
              if (await confirmDialog(`Удалить тему «${t.name}»?`, { ok: 'Удалить' })) removeItem('themes', t.id);
            },
          },
        ]);
      }}
    >
      <span className="cs-theme-swatch__bar" aria-hidden="true" style={{ background: t.tokens.bg }}>
        <span style={{ background: t.tokens.accent }} />
        <span style={{ background: t.tokens.bubbleUser }} />
        <span style={{ background: t.tokens.card }} />
        <span style={{ marginLeft: 'auto', width: 44, height: 14, borderRadius: 99, background: t.tokens.bubbleChar }} />
      </span>
      <span className="cs-row" style={{ gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{t.name}</span>
        <span style={{ fontSize: 12, color: 'var(--cs-muted)' }}>{t.note}</span>
        {slot ? <span className="cs-pill cs-ml-auto" style={{ fontSize: 10 }}>{slot}</span> : null}
      </span>
    </button>
  );
}

export function ThemeTab() {
  const themes = useStore((s) => s.themes);
  const cfg = useStore((s) => s.settings.theme);
  const activeId = useStore(currentThemeId);
  const [selId, setSelId] = useState(activeId);
  const [file, setFile] = useState<CssFile>('theme');
  const sel = themes.find((t) => t.id === selId) || themes[0];
  const [draftCss, setDraftCss] = useState(sel.css);
  useEffect(() => setDraftCss(sel.css), [sel.id]);

  /** Built-in themes are read-only: the first edit makes a personal copy. */
  const editable = (): Theme => {
    if (!sel.builtin) return sel;
    const copy: Theme = { ...structuredClone(sel), id: uid(), name: `${sel.name} · моя`, builtin: false };
    upsert('themes', copy);
    const slot = sel.dark ? 'nightId' : 'dayId';
    updateSettingsSection('theme', { [slot]: copy.id } as Partial<typeof cfg>);
    setSelId(copy.id);
    return copy;
  };
  const set = (patch: Partial<Theme>) => {
    const t = editable();
    upsert('themes', { ...t, ...patch });
  };
  const setToken = (k: keyof ThemeTokens, v: string) => {
    const t = editable();
    upsert('themes', { ...t, tokens: { ...t.tokens, [k]: v } });
  };

  const choose = (t: Theme) => {
    setSelId(t.id);
    updateSettingsSection('theme', t.dark ? { nightId: t.id, mode: 'night' } : { dayId: t.id, mode: 'day' });
  };

  const onCss = (v: string) => {
    const next = { ...draftCss, [file]: v };
    setDraftCss(next);
    if (cfg.applyImmediately) {
      if (sel.builtin) set({ css: next });
      else upsert('themes', { ...sel, css: next });
    }
  };

  const saveCss = () => {
    set({ css: draftCss });
    toast('Тема сохранена');
  };

  const p = sel.tokens;
  return (
    <div className="cs-stack-gap">
      <div className="cs-columns cs-columns--stretch">
        <section aria-label="Темы" className="cs-panel" style={{ flex: '1 1 250px', minWidth: 0, gap: 10 }}>
          <h2 className="cs-h2" style={{ fontSize: 17, marginBottom: 4 }}>
            Темы
          </h2>
          {themes.map((t) => (
            <Swatch key={t.id} t={t} selected={t.id === sel.id} onClick={() => choose(t)} slot={t.id === cfg.dayId ? 'день' : t.id === cfg.nightId ? 'ночь' : ''} />
          ))}
          <Field label="Режим">
            <select className="cs-select" value={cfg.mode} onChange={(e) => updateSettingsSection('theme', { mode: e.target.value as typeof cfg.mode })}>
              <option value="day">Всегда дневная</option>
              <option value="night">Всегда ночная</option>
              <option value="auto">По времени (ночь с 21 до 7)</option>
            </select>
          </Field>
          <div className="cs-row" style={{ marginTop: 'auto' }}>
            <button
              type="button"
              className="cs-btn cs-btn--dashed cs-btn--flex"
              onClick={async () => {
                const name = await promptDialog('Новая тема', { value: 'Моя тема' });
                if (!name) return;
                const t = upsert('themes', { ...structuredClone(sel), id: uid(), name, note: sel.dark ? 'ночь' : 'день', builtin: false });
                choose(t);
              }}
            >
              + Новая
            </button>
            <button type="button" className="cs-btn cs-btn--flex" onClick={() => choose(upsert('themes', { ...structuredClone(sel), id: uid(), name: `${sel.name} (копия)`, builtin: false }))}>
              Дублировать
            </button>
          </div>
          <div className="cs-row">
            <button type="button" className="cs-btn cs-btn--sm cs-btn--flex" onClick={importThemesInteractive}>
              Импорт
            </button>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--flex" onClick={() => exportTheme(sel)}>
              Экспорт
            </button>
          </div>
        </section>

        <section aria-label="CSS-редактор" className="cs-panel" style={{ flex: '999 1 480px', minWidth: 0 }}>
          <div className="cs-row cs-row--wrap">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Свой CSS
            </h2>
            <div role="tablist" aria-label="Файлы темы" className="cs-code-tabs" style={{ marginLeft: 6 }}>
              {(['theme', 'chat', 'mobile'] as CssFile[]).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={file === f} className="cs-code-tab" onClick={() => setFile(f)}>
                  {f}.css
                </button>
              ))}
            </div>
            <label className="cs-check cs-ml-auto" style={{ fontSize: 13, color: 'var(--cs-muted)' }}>
              <input type="checkbox" checked={cfg.applyImmediately} onChange={(e) => updateSettingsSection('theme', { applyImmediately: e.target.checked })} />
              Применять сразу
            </label>
          </div>
          <CodeEditor value={draftCss[file]} lang="css" minHeight={300} onChange={onCss} label={`${file}.css`} />
          <div className="cs-col" style={{ gap: 6 }}>
            <span className="cs-label">Классы интерфейса · нажми, чтобы вставить</span>
            <div className="cs-chips">
              {UI_CLASSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cs-btn cs-btn--xs"
                  style={{ fontFamily: 'var(--cs-font-mono)', fontWeight: 600, background: 'var(--cs-sky-soft)', color: 'var(--cs-sky-deep)', borderColor: 'transparent' }}
                  onClick={() => onCss(`${draftCss[file]}${draftCss[file].endsWith('\n') || !draftCss[file] ? '' : '\n'}\n${c} {\n  \n}\n`)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--primary cs-btn--glow" onClick={saveCss}>
              Сохранить тему
            </button>
            <button type="button" className="cs-btn" onClick={() => onCss(formatCss(draftCss[file]))}>
              Форматировать
            </button>
            <button
              type="button"
              className="cs-btn"
              onClick={async () => {
                if (await confirmDialog('Очистить свой CSS во всех файлах темы?', { ok: 'Очистить' })) {
                  setDraftCss({ theme: '', chat: '', mobile: '' });
                  set({ css: { theme: '', chat: '', mobile: '' } });
                }
              }}
            >
              Сбросить
            </button>
            <Check checked={cfg.customCss} onChange={(customCss) => updateSettingsSection('theme', { customCss })}>
              Свой CSS включён
            </Check>
            <span className="cs-hint">Сломал вид? Открой с ?safe в адресе или зажми Shift при загрузке — свой CSS отключится.</span>
          </div>
        </section>

        <section aria-label="Живой предпросмотр" className="cs-panel" style={{ flex: '1 1 320px', minWidth: 0, gap: 10 }}>
          <div className="cs-row">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Предпросмотр
            </h2>
            <span className="cs-ml-auto" style={{ fontSize: 12, fontWeight: 700, color: 'var(--cs-muted)' }}>
              {sel.name}
            </span>
          </div>
          <div className="cs-preview-phone" style={{ background: p.bg, color: p.text, fontFamily: `'${sel.fontBody}', system-ui` }}>
            <div className="cs-row" style={{ padding: '8px 10px', borderRadius: 18, background: p.surface, border: `1px solid ${p.border}` }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: `'${sel.fontHeading}'`, fontWeight: 800, fontSize: 12, color: p.accentText }}>リ</span>
              <span style={{ fontFamily: `'${sel.fontHeading}'`, fontWeight: 800, fontSize: 14 }}>Ханами Рин</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: p.muted }}>6,4k</span>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: `6px ${sel.radius * 0.65}px ${sel.radius * 0.65}px ${sel.radius * 0.65}px`, background: p.bubbleChar, fontSize: 13, lineHeight: 1.5 }}>
              <em style={{ color: p.em }}>Ставит бокал на стойку.</em> «За счёт заведения».
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 12, background: p.card, color: p.cardLabel, fontSize: 11, fontWeight: 700 }}>23:40 · ливень · симпатия 62</div>
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '10px 12px', borderRadius: `${sel.radius * 0.65}px 6px ${sel.radius * 0.65}px ${sel.radius * 0.65}px`, background: p.bubbleUser, fontSize: 13, lineHeight: 1.5 }}>
              «Проводить тебя до станции?»
            </div>
            <div className="cs-row" style={{ marginTop: 'auto', padding: 8, borderRadius: 18, background: p.surface, border: `1px solid ${p.border}` }}>
              <span style={{ flex: 1, padding: '0 8px', fontSize: 12, color: p.muted }}>Твой ход…</span>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: p.accent, color: p.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow" size={16} stroke={2.4} />
              </span>
            </div>
          </div>
        </section>
      </div>

      <section aria-label="Токены темы" className="cs-panel cs-panel--pad-lg">
        <div className="cs-row" style={{ alignItems: 'baseline', gap: 10 }}>
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Без кода
          </h2>
          <Kana>デザイン</Kana>
          <span className="cs-hint">меняет переменные, которые видны в CSS выше</span>
          {sel.builtin ? <span className="cs-pill cs-ml-auto">встроенная · правка создаст копию</span> : null}
        </div>
        <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 8 }}>
          {THEME_TOKEN_LABELS.map(({ key, label }) => {
            const v = p[key];
            const hex = toHex(v);
            return (
              <div key={key} className="cs-token">
                <span className="cs-token__swatch" style={{ background: v }}>
                  {hex ? <input type="color" value={hex} aria-label={label} onChange={(e) => setToken(key, e.target.value.toUpperCase())} /> : null}
                </span>
                <span className="cs-token__text">
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{label}</span>
                  <input value={v} aria-label={`${label}: значение`} onChange={(e) => setToken(key, e.target.value)} />
                </span>
              </div>
            );
          })}
        </div>
        <Field label="Фон (CSS-градиент)">
          <input className="cs-input cs-input--mono" value={p.bg} onChange={(e) => setToken('bg', e.target.value)} />
        </Field>
        <div className="cs-grid-fields">
          <RangeField label="Скругление" value={sel.radius} min={0} max={40} onChange={(radius) => set({ radius })} format={(v) => `${v}px`} />
          <RangeField label="Размытие стекла" value={sel.blur} min={0} max={40} onChange={(blur) => set({ blur })} format={(v) => `${v}px`} />
          <RangeField label="Зерно" value={sel.grain} min={0} max={60} onChange={(grain) => set({ grain })} format={(v) => `${v}%`} />
          <RangeField label="Неоновое свечение" value={sel.glow} min={0} max={100} onChange={(glow) => set({ glow })} format={(v) => `${v}%`} />
        </div>
        <div className="cs-grid-fields">
          <Field label="Шрифт заголовков">
            <select className="cs-select" value={HEADING_FONTS.includes(sel.fontHeading) ? sel.fontHeading : '__custom'} onChange={async (e) => {
              if (e.target.value !== '__custom') return set({ fontHeading: e.target.value });
              const name = await promptDialog('Шрифт заголовков (Google Fonts)', { label: 'Название семейства, например «Comfortaa»' });
              if (name) set({ fontHeading: name, fontUrl: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;700;800&display=swap` });
            }}>
              {HEADING_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              <option value="__custom">{HEADING_FONTS.includes(sel.fontHeading) ? 'Свой (Google Fonts)…' : sel.fontHeading}</option>
            </select>
          </Field>
          <Field label="Шрифт текста">
            <select className="cs-select" value={BODY_FONTS.includes(sel.fontBody) ? sel.fontBody : '__custom'} onChange={async (e) => {
              if (e.target.value !== '__custom') return set({ fontBody: e.target.value });
              const name = await promptDialog('Шрифт текста (Google Fonts)', { label: 'Название семейства, например «Rubik»' });
              if (name) set({ fontBody: name, fontUrl: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:ital,wght@0,400;0,700;0,800;1,400&display=swap` });
            }}>
              {BODY_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              <option value="__custom">{BODY_FONTS.includes(sel.fontBody) ? 'Свой (Google Fonts)…' : sel.fontBody}</option>
            </select>
          </Field>
          <Field label="Вид чата">
            <select className="cs-select" value={sel.chatView} onChange={(e) => set({ chatView: e.target.value as Theme['chatView'] })}>
              <option value="bubbles">Пузыри</option>
              <option value="document">Документ</option>
              <option value="vn">Визуальная новелла</option>
            </select>
          </Field>
          <Field label="Фон">
            <select
              className="cs-select"
              value={sel.background}
              onChange={async (e) => {
                const v = e.target.value as Theme['background'];
                if (v === 'image') {
                  const [f] = await pickFiles('image/*');
                  if (!f) return;
                  set({ background: 'image', backgroundImage: await uploadImage('backgrounds', f, f.name) });
                } else set({ background: v });
              }}
            >
              <option value="gradient">Градиент + помпоны</option>
              <option value="image">Своя картинка…</option>
              <option value="scene">Кадр сцены из чата</option>
            </select>
          </Field>
        </div>
        {!sel.builtin ? (
          <div className="cs-grid-fields">
            <Field label="Название темы">
              <input className="cs-input" value={sel.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Подпись">
              <input className="cs-input" value={sel.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            <Check
              checked={sel.dark}
              onChange={(dark) => {
                set({ dark });
                applyTheme({ ...sel, dark }, { customCss: getState().settings.theme.customCss });
              }}
            >
              Тёмная тема (ночная палитра элементов)
            </Check>
            <button
              type="button"
              className="cs-btn cs-btn--sm"
              onClick={() => {
                const base = BUILTIN_THEMES.find((b) => b.dark === sel.dark) || BUILTIN_THEMES[0];
                set({ tokens: { ...base.tokens } });
              }}
            >
              <Icon name="undo" size={14} /> Цвета как у «{(BUILTIN_THEMES.find((b) => b.dark === sel.dark) || BUILTIN_THEMES[0]).name}»
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
