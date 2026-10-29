import { useStore, navigate, type SettingsTab } from '../../lib/store';
import { PageHead } from '../../components/ui';
import { ConnectionsTab } from './ConnectionsTab';
import { ThemeTab } from './ThemeTab';
import { DataTab } from './DataTab';
import { ChatTab } from './ChatTab';
import { LauncherTab } from './LauncherTab';
import { GeneralTab } from './GeneralTab';
import { PromptsTab } from './PromptsTab';
import { t } from '../../lib/i18n';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'connections', label: t('Connections') },
  { id: 'general', label: t('General') },
  { id: 'theme', label: t('Theme and CSS') },
  { id: 'chat', label: t('Chat') },
  { id: 'prompts', label: t('Prompts') },
  { id: 'data', label: t('Import and export') },
  { id: 'launcher', label: t('Launcher') },
];

export default function SettingsPage() {
  const tab = useStore((s) => s.settingsTab);
  return (
    <div className="cs-page">
      <PageHead title={t('Settings')} kana="せってい">
        <nav aria-label={t('Settings sections')} className="cs-tabs">
          {TABS.map((item) => (
            <a
              key={item.id}
              href={`#/settings/${item.id}`}
              className="cs-tab"
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate('settings', item.id);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </PageHead>
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'general' && <GeneralTab />}
      {tab === 'theme' && <ThemeTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'launcher' && <LauncherTab />}
    </div>
  );
}
