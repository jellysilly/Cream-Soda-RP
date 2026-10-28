import { useStore, navigate, type SettingsTab } from '../../lib/store';
import { PageHead } from '../../components/ui';
import { ConnectionsTab } from './ConnectionsTab';
import { ThemeTab } from './ThemeTab';
import { DataTab } from './DataTab';
import { ChatTab } from './ChatTab';
import { LauncherTab } from './LauncherTab';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'connections', label: 'Подключения' },
  { id: 'theme', label: 'Тема и CSS' },
  { id: 'data', label: 'Импорт и экспорт' },
  { id: 'chat', label: 'Чат' },
  { id: 'launcher', label: 'Лаунчер' },
];

export default function SettingsPage() {
  const tab = useStore((s) => s.settingsTab);
  return (
    <div className="cs-page">
      <PageHead title="Настройки" kana="せってい">
        <nav aria-label="Разделы настроек" className="cs-tabs">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/settings/${t.id}`}
              className="cs-tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate('settings', t.id);
              }}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </PageHead>
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'theme' && <ThemeTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'launcher' && <LauncherTab />}
    </div>
  );
}
