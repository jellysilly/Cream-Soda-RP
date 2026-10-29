import { api } from './api';
import { getState, setState, upsert, removeItem, toast, toastError, updateSettings, navigate, setChat, isNight } from './store';
import {
  characterFromCard,
  characterToCardV2,
  characterToCardV3,
  chatFromJsonl,
  chatToJsonl,
  chatToText,
  instructFromJson,
  lorebookFromJson,
  lorebookToST,
  personaFromJson,
  presetFromJson,
  presetToST,
  regexListFromJson,
  regexToST,
} from './formats';
import { embedCardJson, extractCardJson, isPng, toPngBytes } from './png';
import type { Character, Chat, Lorebook, MemoryBook, Persona, Theme } from './types';
import { download, safeFileName, uid, pickFiles, toKana } from './utils';
import { openChat, startNewChat } from './generate';
import { newLorebook, newWorldEntry } from './defaults';
import { confirmDialog } from '../components/ui';
import { t } from './i18n';

export function toggleNight() {
  const mode = isNight() ? 'day' : 'night';
  updateSettings((s) => ({ theme: { ...s.theme, mode } }));
}

// ───────── Characters ─────────

export async function uploadImage(kind: 'avatars' | 'backgrounds' | 'images' | 'sprites', file: Blob, name = 'image.png'): Promise<string> {
  const res = await api.upload(kind, file, name);
  return res.url;
}

export async function importCharacterFile(file: File): Promise<Character | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let json: any;
  let avatarBlob: Blob | null = null;
  if (isPng(bytes)) {
    json = extractCardJson(bytes);
    if (!json) throw new Error(t('“{name}” has no card data', { name: file.name }));
    avatarBlob = file;
  } else if (/\.(webp|jpe?g)$/i.test(file.name)) {
    throw new Error(t('Cards come only as PNG or JSON'));
  } else {
    json = JSON.parse(new TextDecoder().decode(bytes));
  }
  const parsed = characterFromCard(json);
  const c = parsed.character;
  if (avatarBlob) c.avatar = await uploadImage('avatars', avatarBlob, `${safeFileName(c.name)}.png`);
  if (!c.kana) c.kana = toKana(c.name);
  if (parsed.book) {
    upsert('worlds', parsed.book);
    c.worldIds = [parsed.book.id];
  }
  for (const r of parsed.regex) upsert('regex', { ...r, scope: { type: 'character', id: c.id } });
  upsert('characters', c);
  return c;
}

export async function importCharactersInteractive() {
  const files = await pickFiles('.png,.json,image/png,application/json', true);
  let ok = 0;
  let last: Character | null = null;
  for (const f of files) {
    try {
      last = await importCharacterFile(f);
      ok++;
    } catch (err) {
      toastError(err, f.name);
    }
  }
  if (ok) toast(ok === 1 && last ? t('Character “{name}” imported', { name: last.name }) : t('Characters imported: {ok}', { ok }));
  return last;
}

export async function importCharacterFromUrl(url: string) {
  try {
    const file = await api.importUrl(url);
    const c = await importCharacterFile(file);
    if (c) toast(t('Character “{name}” imported', { name: c.name }));
    return c;
  } catch (err) {
    toastError(err, t('Import from a link'));
    return null;
  }
}

function scopedRegex(charId: string) {
  return getState().regex.filter((r) => r.scope.type === 'character' && r.scope.id === charId);
}

export async function exportCharacter(c: Character, format: 'png' | 'json') {
  const book = getState().worlds.find((w) => w.id === c.worldIds[0]) || null;
  const v2 = characterToCardV2(c, book, scopedRegex(c.id));
  if (format === 'json') {
    download(`${safeFileName(c.name)}.json`, JSON.stringify(v2, null, 2), 'application/json');
    return;
  }
  const v3 = characterToCardV3(c, book, scopedRegex(c.id));
  const png = await toPngBytes(c.avatar || null);
  const out = embedCardJson(png, v2, v3);
  download(`${safeFileName(c.name)}.png`, new Blob([out as BlobPart], { type: 'image/png' }));
}

export async function duplicateCharacter(c: Character) {
  const copy = { ...structuredClone(c), id: uid(), name: t('{name} (copy)', { name: c.name }), createdAt: Date.now() };
  upsert('characters', copy);
  for (const r of scopedRegex(c.id)) upsert('regex', { ...r, id: uid(), scope: { type: 'character', id: copy.id } });
  toast(t('Copy created'));
  return copy;
}

export async function deleteCharacter(c: Character) {
  const ok = await confirmDialog(t("Delete “{name}” and all its chats? This can't be undone (but there is an automatic backup).", { name: c.name }), { ok: t('Delete') });
  if (!ok) return false;
  try {
    await removeItem('characters', c.id, true);
    for (const r of scopedRegex(c.id)) await removeItem('regex', r.id);
    const s = getState();
    if (s.chat?.ownerType === 'character' && s.chat.ownerId === c.id) setState({ chat: null, chatList: [] });
    if (s.settings.activeCharacterId === c.id) updateSettings({ activeCharacterId: '', activeChatId: '' });
    toast(t('“{name}” deleted', { name: c.name }));
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

// ───────── Lorebooks ─────────

export async function importLorebooksInteractive(): Promise<Lorebook | null> {
  const files = await pickFiles('.json,application/json', true);
  let last: Lorebook | null = null;
  for (const f of files) {
    try {
      const json = JSON.parse(await f.text());
      const book = lorebookFromJson(json, f.name.replace(/\.json$/i, ''));
      upsert('worlds', book);
      last = book;
      toast(t('Lorebook “{name}” · {n} entries', { name: book.name, n: book.entries.length }));
    } catch (err) {
      toastError(err, f.name);
    }
  }
  return last;
}

export function exportLorebook(book: Lorebook) {
  download(`${safeFileName(book.name)}.json`, JSON.stringify(lorebookToST(book), null, 2), 'application/json');
}

// ───────── Presets ─────────

export async function importPresetsInteractive() {
  const files = await pickFiles('.json,application/json', true);
  for (const f of files) {
    try {
      const json = JSON.parse(await f.text());
      if (json?.input_sequence !== undefined || json?.instruct?.input_sequence !== undefined) {
        const tpl = instructFromJson(json);
        upsert('instruct', tpl);
        toast(t('Instruct template “{name}” added', { name: tpl.name }));
        continue;
      }
      const p = json?.cream_soda ? presetFromJson(json.cream_soda) : presetFromJson(json, f.name.replace(/\.json$/i, ''));
      upsert('presets', p);
      updateSettings({ activePresetId: p.id });
      toast(t('Preset “{name}” imported', { name: p.name }));
    } catch (err) {
      toastError(err, f.name);
    }
  }
}

export function exportPreset(id: string) {
  const p = getState().presets.find((x) => x.id === id);
  if (!p) return;
  download(`${safeFileName(p.name)}.json`, JSON.stringify(presetToST(p), null, 2), 'application/json');
}

// ───────── Regex ─────────

export async function importRegexInteractive(scope?: { type: 'character'; id: string }) {
  const files = await pickFiles('.json,application/json', true);
  let n = 0;
  for (const f of files) {
    try {
      for (const r of regexListFromJson(JSON.parse(await f.text()))) {
        upsert('regex', { ...r, scope: scope || { type: 'global' } });
        n++;
      }
    } catch (err) {
      toastError(err, f.name);
    }
  }
  if (n) toast(t('Regexes imported: {n}', { n }));
}

export function exportRegex(ids?: string[]) {
  const list = getState().regex.filter((r) => !ids || ids.includes(r.id));
  if (list.length === 1) download(`${safeFileName(list[0].name)}.json`, JSON.stringify(regexToST(list[0]), null, 2), 'application/json');
  else download('regex-scripts.json', JSON.stringify(list.map(regexToST), null, 2), 'application/json');
}

// ───────── Chats ─────────

export async function importChatInteractive() {
  const s = getState();
  const owner = s.chat
    ? { type: s.chat.ownerType, id: s.chat.ownerId }
    : s.settings.activeCharacterId
      ? { type: 'character' as const, id: s.settings.activeCharacterId }
      : null;
  if (!owner) {
    toast(t('Open a chat with a character first: the imported chat will be attached to it'), 'warn');
    return;
  }
  const files = await pickFiles('.jsonl,.json', true);
  const charName = s.characters.find((c) => c.id === owner.id)?.name || s.groups.find((g) => g.id === owner.id)?.name || t('Character');
  for (const f of files) {
    try {
      const text = await f.text();
      let chat: Chat;
      if (f.name.endsWith('.json') && text.trim().startsWith('{') && JSON.parse(text).messages) {
        chat = { ...JSON.parse(text), id: uid(), ownerType: owner.type, ownerId: owner.id };
      } else chat = chatFromJsonl(text, { type: owner.type, id: owner.id, charName }, s.settings.activePersonaId);
      chat.title = f.name.replace(/\.(jsonl|json)$/i, '');
      await api.putChat(chat);
      await openChat(chat.id);
      toast(t('Chat “{title}” imported · {n} messages', { title: chat.title, n: chat.messages.length }));
    } catch (err) {
      toastError(err, f.name);
    }
  }
}

export async function exportChat(chatId: string, format: 'jsonl' | 'txt' | 'json') {
  const s = getState();
  const chat = s.chat?.id === chatId ? s.chat : await api.getChat(chatId);
  const charName = s.characters.find((c) => c.id === chat.ownerId)?.name || s.groups.find((g) => g.id === chat.ownerId)?.name || 'char';
  const user = s.personas.find((p) => p.id === s.settings.activePersonaId)?.name || 'user';
  const base = safeFileName(chat.title || charName);
  if (format === 'jsonl') download(`${base}.jsonl`, chatToJsonl(chat, user, charName), 'application/jsonl');
  else if (format === 'txt') download(`${base}.txt`, chatToText(chat), 'text/plain');
  else download(`${base}.json`, JSON.stringify(chat, null, 1), 'application/json');
}

export async function exportAllChats() {
  const list = await api.listChats();
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const s = getState();
  for (const meta of list) {
    const chat = await api.getChat(meta.id);
    const owner = s.characters.find((c) => c.id === chat.ownerId)?.name || s.groups.find((g) => g.id === chat.ownerId)?.name || chat.ownerId;
    files[`${safeFileName(owner)}/${safeFileName(chat.title)}-${chat.id}.jsonl`] = strToU8(chatToJsonl(chat, 'user', owner));
  }
  download('cream-soda-chats.zip', new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }));
}

export async function deleteChat(chatId: string) {
  const ok = await confirmDialog(t('Delete this chat? Branches made from it will stay.'), { ok: t('Delete') });
  if (!ok) return false;
  await api.removeChat(chatId);
  const s = getState();
  if (s.chat?.id === chatId) {
    const rest = s.chatList.filter((c) => c.id !== chatId);
    if (rest.length) await openChat(rest[0].id);
    else await startNewChat(s.chat.ownerType, s.chat.ownerId);
  }
  return true;
}

export async function renameChat(chatId: string, title: string) {
  const s = getState();
  if (s.chat?.id === chatId) setChat((c) => ({ ...c, title }));
  else {
    const chat = await api.getChat(chatId);
    await api.putChat({ ...chat, title });
  }
  setState((st) => ({ chatList: st.chatList.map((c) => (c.id === chatId ? { ...c, title } : c)) }));
}

// ───────── Personas ─────────

export async function importPersonasInteractive() {
  const files = await pickFiles('.json,application/json,.png,image/png', true);
  for (const f of files) {
    try {
      if (/\.png$/i.test(f.name)) {
        const url = await uploadImage('avatars', f, f.name);
        const p = { ...personaFromJson({ name: f.name.replace(/\.png$/i, '') })[0], avatar: url };
        upsert('personas', p);
        continue;
      }
      for (const p of personaFromJson(JSON.parse(await f.text()))) upsert('personas', p);
      toast(t('Personas imported'));
    } catch (err) {
      toastError(err, f.name);
    }
  }
}

export function exportPersonas(list: Persona[] = getState().personas) {
  download('personas.json', JSON.stringify(list.map(({ id, updatedAt, ...p }) => p), null, 2), 'application/json');
}

// ───────── Themes ─────────

export async function importThemesInteractive() {
  const files = await pickFiles('.json,.css', true);
  for (const f of files) {
    try {
      const text = await f.text();
      if (f.name.endsWith('.css')) {
        const base = getState().themes.find((th) => th.id === getState().settings.theme.dayId) || getState().themes[0];
        const imported: Theme = { ...structuredClone(base), id: uid(), name: f.name.replace(/\.css$/, ''), builtin: false, css: { theme: text, chat: '', mobile: '' } };
        upsert('themes', imported);
      } else {
        const json = JSON.parse(text);
        if (!json.tokens) throw new Error(t('The file has no theme tokens'));
        upsert('themes', { ...json, id: uid(), builtin: false });
      }
      toast(t('Theme imported'));
    } catch (err) {
      toastError(err, f.name);
    }
  }
}

export function exportTheme(theme: Theme) {
  const { builtin, ...rest } = theme;
  download(`${safeFileName(theme.name)}.json`, JSON.stringify(rest, null, 2), 'application/json');
}

// ───────── Memory Book ─────────

export function exportMemory(chat: Chat, format: 'json' | 'md') {
  const mem = chat.meta.memory;
  if (format === 'json') {
    download(`${safeFileName(chat.title)}-memory.json`, JSON.stringify(mem, null, 2), 'application/json');
    return;
  }
  const md = [
    `# Memory Book · ${chat.title}`,
    '',
    ...mem.chapters.map((c, i) => t('## Chapter {i} · {title}\n\n{summary}\n\nKeys: {keys}\n', { i: i + 1, title: c.title, summary: c.summary, keys: c.keys.join(', ') })),
    t('## Facts'),
    '',
    ...mem.facts.map((f) => `- ${f.text}`),
  ].join('\n');
  download(`${safeFileName(chat.title)}-memory.md`, md, 'text/markdown');
}

export async function importMemoryInteractive() {
  const [f] = await pickFiles('.json,application/json');
  if (!f || !getState().chat) return;
  try {
    const mem = JSON.parse(await f.text()) as MemoryBook;
    if (!Array.isArray(mem.chapters)) throw new Error(t('No chapters'));
    setChat((c) => ({ ...c, meta: { ...c.meta, memory: { chapters: [...c.meta.memory.chapters, ...mem.chapters], facts: [...c.meta.memory.facts, ...(mem.facts || [])] } } }));
    toast(t('Memory Book imported'));
  } catch (err) {
    toastError(err);
  }
}

/** «Export to a lorebook»: chapters become keyed lorebook entries. */
export function memoryToLorebook(chat: Chat) {
  const book = newLorebook({
    name: t('Memory · {title}', { title: chat.title }),
    entries: [
      ...chat.meta.memory.chapters.map((c, i) =>
        newWorldEntry({ comment: t('Chapter {i} · {title}', { i: i + 1, title: c.title }), keys: c.keys.length ? c.keys : [c.title], content: c.summary, order: 100 + c.importance * 10, constant: c.insertion === 'always' }),
      ),
      ...chat.meta.memory.facts.filter((f) => f.enabled).map((f) => newWorldEntry({ comment: f.text.slice(0, 40), constant: true, content: f.text })),
    ],
  });
  upsert('worlds', book);
  toast(t('Lorebook “{name}” created', { name: book.name }));
  return book;
}

// ───────── Full backup ─────────

export async function downloadBackup(includeKeys: boolean) {
  if ('CreamSodaAndroid' in window) {
    // Android WebView can't download links itself: fetch the zip and hand it over.
    try {
      const res = await fetch(api.backupUrl(includeKeys));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const disposition = res.headers.get('content-disposition') || '';
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const name = (utf8 && decodeURIComponent(utf8)) || /filename="?([^";]+)/.exec(disposition)?.[1] || 'cream-soda-backup.zip';
      download(name, await res.blob(), 'application/zip');
    } catch (err) {
      toastError(err);
    }
    return;
  }
  const a = document.createElement('a');
  a.href = api.backupUrl(includeKeys);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function restoreBackupInteractive() {
  const [f] = await pickFiles('.zip,application/zip');
  if (!f) return;
  const ok = await confirmDialog(t('Restore data from the backup? The current state will be saved to a separate backup, then the app reloads.'), { ok: t('Restore') });
  if (!ok) return;
  try {
    const r = await api.restore(f);
    toast(t('Files restored: {restored}. Reloading…', { restored: r.restored }));
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    toastError(err, t('Restoring'));
  }
}

export function goToMessage(messageId: string) {
  navigate('chat');
  setTimeout(() => {
    const el = document.querySelector(`[data-mid="${messageId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('cs-message--flash');
    setTimeout(() => el?.classList.remove('cs-message--flash'), 1600);
  }, 120);
}
