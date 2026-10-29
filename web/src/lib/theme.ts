import type { Theme, ThemeTokens } from './types';

const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  bg: '--cs-bg',
  bgSolid: '--cs-bg-solid',
  surface: '--cs-surface',
  surfaceStrong: '--cs-surface-strong',
  border: '--cs-border',
  text: '--cs-text',
  muted: '--cs-muted',
  accent: '--cs-accent',
  accentText: '--cs-accent-text',
  link: '--cs-link',
  bubbleChar: '--cs-bubble-char',
  bubbleUser: '--cs-bubble-user',
  em: '--cs-em',
  card: '--cs-card',
  cardText: '--cs-card-text',
  cardLabel: '--cs-card-label',
  cardBorder: '--cs-card-border',
  field: '--cs-field',
  fieldBorder: '--cs-field-border',
  chip: '--cs-chip',
  mint: '--cs-mint',
};

let loadedFontUrl = '';

/** Applies a theme: CSS variables on :root, the dark flag, fonts and custom CSS. */
export function applyTheme(theme: Theme, opts: { customCss: boolean }) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(TOKEN_VARS)) {
    const val = theme.tokens[k as keyof ThemeTokens];
    if (val) root.style.setProperty(v, val);
  }
  root.style.setProperty('--cs-em-user', theme.dark ? '#F5BFD8' : theme.tokens.em);
  root.style.setProperty('--cs-radius', `${theme.radius}px`);
  root.style.setProperty('--cs-blur', `${theme.blur}px`);
  root.style.setProperty('--cs-grain', String(theme.grain / 100));
  const g = theme.glow / 100;
  root.style.setProperty('--cs-glow-strength', String(g));
  root.style.setProperty('--cs-glow', g > 0 ? `0 0 ${Math.round(8 + 22 * g)}px color-mix(in srgb, ${theme.tokens.accent} ${Math.round(25 + 30 * g)}%, transparent)` : 'none');
  root.style.setProperty('--cs-accent-shadow', `color-mix(in srgb, ${theme.tokens.accent} 35%, transparent)`);
  root.style.setProperty('--cs-font-heading', `'${theme.fontHeading || 'M PLUS Rounded 1c'}', system-ui, sans-serif`);
  root.style.setProperty('--cs-font-body', `'${theme.fontBody || 'Nunito'}', system-ui, sans-serif`);
  root.dataset.csDark = String(!!theme.dark);
  root.dataset.csChatView = theme.chatView || 'bubbles';
  root.dataset.csTheme = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.tokens.bgSolid);

  if (theme.fontUrl && theme.fontUrl !== loadedFontUrl && /^https:\/\/fonts\.googleapis\.com\//.test(theme.fontUrl)) {
    loadedFontUrl = theme.fontUrl;
    let link = document.getElementById('cs-custom-font') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'cs-custom-font';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = theme.fontUrl;
  }

  let style = document.getElementById('cs-user-css') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'cs-user-css';
    document.head.appendChild(style);
  }
  const safeMode = new URLSearchParams(location.search).has('safe') || sessionStorageGet('cs-safe') === '1';
  style.textContent =
    opts.customCss && !safeMode
      ? [theme.css.theme, theme.css.chat, theme.css.mobile ? `@media (max-width: 760px) {\n${theme.css.mobile}\n}` : ''].filter(Boolean).join('\n\n')
      : '';
}

function sessionStorageGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

/** «Broke the look? Hold Shift while loading: the custom CSS turns off.» */
export function watchSafeModeKey() {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      try {
        sessionStorage.setItem('cs-safe', '1');
      } catch {
        /* ignore */
      }
    }
  };
  window.addEventListener('keydown', onKey, { once: true });
  setTimeout(() => window.removeEventListener('keydown', onKey), 1500);
}

export function exitSafeMode() {
  try {
    sessionStorage.removeItem('cs-safe');
  } catch {
    /* ignore */
  }
}

export function isSafeMode(): boolean {
  return new URLSearchParams(location.search).has('safe') || sessionStorageGet('cs-safe') === '1';
}

/** Generates the editable CSS variables block shown at the top of theme.css. */
export function tokensToCss(theme: Theme): string {
  const lines = Object.entries(TOKEN_VARS).map(([k, v]) => `  ${v}: ${theme.tokens[k as keyof ThemeTokens]};`);
  return `/* ${theme.name} · ${theme.note} */\n:root {\n${lines.join('\n')}\n  --cs-radius: ${theme.radius}px;\n}`;
}

/** Light CSS pretty-printer for «Prettify». */
export function formatCss(css: string): string {
  let depth = 0;
  const out: string[] = [];
  const tokens = css
    .replace(/\s*\{\s*/g, ' {\n')
    .replace(/;\s*/g, ';\n')
    .replace(/\s*\}\s*/g, '\n}\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of tokens) {
    if (line.startsWith('}')) depth = Math.max(0, depth - 1);
    out.push(`${'  '.repeat(depth)}${line}`);
    if (line.endsWith('{')) depth++;
  }
  return out.join('\n').replace(/\n\}\n(?!\})/g, '\n}\n\n').trim();
}
