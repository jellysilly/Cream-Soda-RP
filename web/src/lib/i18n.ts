import { RU } from '../i18n/ru';

/**
 * Interface language. English is the source language: t('Send') returns the
 * Russian translation from i18n/ru.ts when Russian is on, and the English text
 * otherwise (also for anything that has no translation yet).
 *
 * The language is known before any module runs (localStorage mirrors the
 * profile setting), so t() works in module-level constants too; switching the
 * language reloads the page. Prompts sent to the model never go through t():
 * they stay English whatever the interface language is.
 */
export type Lang = 'en' | 'ru';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
];

const STORAGE_KEY = 'cs-lang';

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = storedLang();
document.documentElement.lang = lang;

export function getLang(): Lang {
  return lang;
}

/** Locale for dates and numbers shown in the interface. */
export function locale(): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US';
}

/**
 * Applies the language from the profile settings. Returns true when it differs
 * from the one this page was built with (the caller then reloads the page).
 */
export function syncLang(next: string | undefined): boolean {
  const target: Lang = next === 'ru' ? 'ru' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, target);
  } catch {
    // Without storage a reload would come back in the same language: stay put.
    return false;
  }
  return target !== lang;
}

type Vars = Record<string, string | number | undefined | null>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m));
}

/** Translates an English interface string; {name} placeholders are filled from `vars`. */
export function t(en: string, vars?: Vars): string {
  const text = lang === 'ru' ? RU[en] ?? en : en;
  return fill(text, vars);
}

let patterns: { re: RegExp; names: string[]; ru: string }[] | null = null;

/**
 * Translates a message that came from elsewhere (an error from the server or the
 * engine): an exact key first, then keys with {placeholders} used as patterns,
 * so «Unknown collection: books» finds «Unknown collection: {name}».
 */
export function translateMessage(message: string): string {
  if (lang !== 'ru' || !message) return message;
  if (RU[message] !== undefined) return RU[message];
  patterns ??= Object.entries(RU)
    .filter(([en]) => /\{\w+\}/.test(en) && en.replace(/\{\w+\}/g, '').trim().length >= 8)
    .map(([en, ru]) => {
      const names: string[] = [];
      const source = en
        .split(/(\{\w+\})/)
        .map((part) => {
          const m = /^\{(\w+)\}$/.exec(part);
          if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          names.push(m[1]);
          return '([\\s\\S]+?)';
        })
        .join('');
      return { re: new RegExp(`^${source}$`), names, ru };
    });
  for (const p of patterns) {
    const m = p.re.exec(message);
    if (m) return fill(p.ru, Object.fromEntries(p.names.map((name, i) => [name, m[i + 1]])));
  }
  return message;
}

/**
 * Plural form for `n`: `forms` is the English «one|other» pair (e.g. 'message|messages'),
 * the Russian dictionary maps it to «one|few|many».
 */
export function tn(n: number, forms: string): string {
  const list = (lang === 'ru' ? RU[forms] ?? forms : forms).split('|');
  if (lang === 'ru' && list.length >= 3) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return list[2];
    if (b === 1) return list[0];
    if (b >= 2 && b <= 4) return list[1];
    return list[2];
  }
  return Math.abs(n) === 1 ? list[0] : list[list.length - 1];
}
