import { useEffect, useState } from 'react';
import { useStore, updateSettingsSection, toast, toastError, getState } from '../../lib/store';
import { Kana, Check } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import {
  importThemesInteractive,
  exportTheme,
  importChatInteractive,
  exportAllChats,
  importCharactersInteractive,
  exportCharacter,
  importPersonasInteractive,
  exportPersonas,
  importLorebooksInteractive,
  exportLorebook,
  importPresetsInteractive,
  exportPreset,
  importRegexInteractive,
  exportRegex,
  exportMemory,
  importMemoryInteractive,
  downloadBackup,
  restoreBackupInteractive,
} from '../../lib/appActions';
import { download, fmtBytes, fmtDate, pickFiles } from '../../lib/utils';

async function exportAllCharacters() {
  const { characters } = getState();
  if (characters.length > 5) toast(`Экспортирую ${characters.length} карточек — браузер может спросить разрешение на несколько загрузок`);
  for (const c of characters) await exportCharacter(c, 'png');
}

export function DataTab() {
  const backup = useStore((s) => s.settings.backup);
  const isLocal = useStore((s) => s.isLocal);
  const [list, setList] = useState<{ name: string; size: number; createdAt: number }[]>([]);
  useEffect(() => {
    api.backups().then(setList).catch(() => {});
  }, []);

  const rows: { name: string; fmt: string; onImport: () => unknown; onExport: () => unknown }[] = [
    { name: 'Темы', fmt: '.json · .css', onImport: importThemesInteractive, onExport: () => getState().themes.filter((t) => !t.builtin).forEach(exportTheme) },
    { name: 'Чаты', fmt: '.jsonl · с ветками', onImport: importChatInteractive, onExport: () => exportAllChats().catch((e) => toastError(e)) },
    { name: 'Персонажи', fmt: 'PNG-карточка · .json', onImport: importCharactersInteractive, onExport: () => exportAllCharacters().catch((e) => toastError(e)) },
    { name: 'Персоны', fmt: '.json', onImport: importPersonasInteractive, onExport: () => exportPersonas() },
    { name: 'Лорбуки', fmt: '.json', onImport: importLorebooksInteractive, onExport: () => getState().worlds.forEach(exportLorebook) },
    { name: 'Пресеты', fmt: '.json · формат SillyTavern', onImport: importPresetsInteractive, onExport: () => getState().presets.forEach((p) => exportPreset(p.id)) },
    { name: 'Регексы', fmt: '.json', onImport: () => importRegexInteractive(), onExport: () => exportRegex() },
    {
      name: 'Memory Book',
      fmt: '.json · .md',
      onImport: importMemoryInteractive,
      onExport: () => {
        const chat = getState().chat;
        if (!chat) return toast('Откройте чат, чтобы выгрузить его память', 'warn');
        exportMemory(chat, 'md');
        exportMemory(chat, 'json');
      },
    },
    {
      name: 'Список расширений',
      fmt: '.json',
      onImport: async () => {
        const [f] = await pickFiles('.json');
        if (!f) return;
        const list = JSON.parse(await f.text()) as { name: string; url?: string }[];
        for (const e of list) {
          if (!e.url) continue;
          try {
            await api.installExtension(e.url);
            toast(`Установлено: ${e.name}`);
          } catch (err) {
            toastError(err, e.name);
          }
        }
      },
      onExport: () => download('extensions.json', JSON.stringify(getState().extensions.map((e) => ({ name: e.name, url: e.homePage })), null, 2), 'application/json'),
    },
  ];

  return (
    <div className="cs-columns">
      <section id="cs-data" aria-label="Импорт и экспорт" className="cs-panel cs-panel--pad-lg" style={{ flex: '999 1 520px', minWidth: 0, gap: 10 }}>
        <div className="cs-row" style={{ alignItems: 'baseline', gap: 10 }}>
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Импорт и экспорт
          </h2>
          <Kana>おもちかえり</Kana>
        </div>
        <div className="cs-col" style={{ gap: 6 }}>
          {rows.map((d) => (
            <div key={d.name} className="cs-data-row">
              <span className="cs-grow">
                <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{d.name}</span>
                <span className="cs-mono" style={{ display: 'block', fontSize: 11, color: 'var(--cs-muted)' }}>
                  {d.fmt}
                </span>
              </span>
              <button type="button" className="cs-btn cs-btn--sm" style={{ background: 'transparent' }} aria-label={`Импорт: ${d.name}`} onClick={() => d.onImport()}>
                <Icon name="download" size={14} stroke={2.2} />
                Импорт
              </button>
              <button type="button" className="cs-btn cs-btn--sm" style={{ border: 'none', background: 'var(--cs-rose-soft)', color: 'var(--cs-link)', fontWeight: 800 }} aria-label={`Экспорт: ${d.name}`} onClick={() => d.onExport()}>
                <Icon name="upload" size={14} stroke={2.2} />
                Экспорт
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="cs-panel cs-panel--pad-lg cs-col-side" style={{ flex: '1 1 420px' }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Бэкап
        </h2>
        <div className="cs-backup-box">
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--honey cs-btn--flex" onClick={() => downloadBackup(backup.includeKeys)}>
              Полный бэкап · .zip
            </button>
            <button type="button" className="cs-btn cs-btn--flex" style={{ background: 'transparent', borderColor: 'var(--cs-card-border)', color: 'inherit' }} disabled={!isLocal} onClick={restoreBackupInteractive}>
              Восстановить
            </button>
          </div>
          <Check checked={backup.auto} onChange={(auto) => updateSettingsSection('backup', { auto })}>
            Автобэкап раз в день, хранить {backup.keep} копий
          </Check>
          <Check checked={backup.includeKeys} onChange={(includeKeys) => updateSettingsSection('backup', { includeKeys })}>
            Включать API-ключи (не советуем)
          </Check>
        </div>
        <div className="cs-row">
          <span className="cs-label">Копии на сервере</span>
          <button
            type="button"
            className="cs-btn cs-btn--xs cs-ml-auto"
            onClick={async () => {
              try {
                const r = await api.saveBackup();
                toast(`Сохранено: ${r.name}`);
                setList(await api.backups());
              } catch (err) {
                toastError(err);
              }
            }}
          >
            Сделать сейчас
          </button>
        </div>
        <div className="cs-col" style={{ gap: 6, maxHeight: 320, overflow: 'auto' }}>
          {list.map((b) => (
            <a key={b.name} className="cs-log-row" href={`api/backups/${encodeURIComponent(b.name)}`} download style={{ textDecoration: 'none', fontWeight: 600 }}>
              <Icon name="database" size={16} />
              <span className="cs-grow cs-ellipsis">{b.name.startsWith('auto-') ? 'Автобэкап' : b.name.startsWith('before-restore') ? 'Перед восстановлением' : 'Вручную'} · {fmtDate(b.createdAt)}</span>
              <span className="cs-mono" style={{ fontSize: 11, color: 'var(--cs-muted)' }}>
                {fmtBytes(b.size)}
              </span>
            </a>
          ))}
          {!list.length ? <p className="cs-hint">Копий пока нет.</p> : null}
        </div>
      </section>
    </div>
  );
}
