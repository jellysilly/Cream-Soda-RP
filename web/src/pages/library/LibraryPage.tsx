import { useEffect, useState } from 'react';
import { useStore, navigate } from '../../lib/store';
import { useShallow } from 'zustand/react/shallow';
import { Tabs, PageHead } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { CharactersTab } from './CharactersTab';
import { PersonasTab } from './PersonasTab';
import { LorebooksTab } from './LorebooksTab';
import { PlotsTab } from './PlotsTab';
import { importCharactersInteractive, importCharacterFromUrl } from '../../lib/appActions';
import { promptDialog } from '../../components/ui';
import { t } from '../../lib/i18n';

type Tab = 'chars' | 'personas' | 'lorebooks' | 'plots';

function tabFromParam(p: string): Tab {
  if (p.startsWith('personas') || p.startsWith('persona:')) return 'personas';
  if (p.startsWith('lorebooks') || p.startsWith('lore:')) return 'lorebooks';
  if (p.startsWith('plots') || p.startsWith('plot:')) return 'plots';
  return 'chars';
}

export default function LibraryPage() {
  const param = useStore((s) => s.routeParam);
  const counts = useStore(useShallow((s) => ({ c: s.characters.length + s.groups.length, p: s.personas.length, l: s.worlds.length, s: s.plots.length })));
  const [tab, setTab] = useState<Tab>(tabFromParam(param));
  const [query, setQuery] = useState('');
  useEffect(() => setTab(tabFromParam(param)), [param]);

  return (
    <div className="cs-page">
      <PageHead title={t('Library')} kana="ライブラリ">
        <Tabs<Tab>
          label={t('Type')}
          value={tab}
          onChange={(next) => {
            setTab(next);
            navigate('library', next === 'chars' ? '' : next);
          }}
          items={[
            { id: 'chars', label: t('Characters · {c}', { c: counts.c }) },
            { id: 'personas', label: t('Personas · {p}', { p: counts.p }) },
            { id: 'lorebooks', label: t('Lorebooks · {l}', { l: counts.l }) },
            { id: 'plots', label: t('Plots · {s}', { s: counts.s }) },
          ]}
        />
        <label className="cs-search" style={{ flex: '1 1 200px' }}>
          <Icon name="search" size={18} stroke={2} />
          <span className="cs-sr-only">{t('Search')}</span>
          <input type="search" placeholder={tab === 'lorebooks' ? t('Title, key or entry text') : t('Name, tag or creator')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="cs-row">
          {tab === 'chars' ? (
            <>
              <button type="button" className="cs-btn" onClick={() => importCharactersInteractive()}>
                {t('Import PNG / JSON')}
              </button>
              <button
                type="button"
                className="cs-icon-btn"
                title={t('Import from a link (Chub, direct link)')}
                aria-label={t('Import from a link')}
                onClick={async () => {
                  const url = await promptDialog(t('Import from a link'), { label: t('Link to a card (chub.ai or a direct PNG/JSON)') });
                  if (url) importCharacterFromUrl(url);
                }}
              >
                <Icon name="link" size={18} />
              </button>
            </>
          ) : null}
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => navigate('generator', tab === 'personas' ? 'persona' : tab === 'lorebooks' ? 'lore' : tab === 'plots' ? 'plot' : 'char')}>
            <Icon name="sparkle" size={16} />
            {t('Generate')}
          </button>
        </div>
      </PageHead>
      {tab === 'chars' && <CharactersTab query={query} />}
      {tab === 'personas' && <PersonasTab query={query} />}
      {tab === 'lorebooks' && <LorebooksTab query={query} />}
      {tab === 'plots' && <PlotsTab query={query} />}
    </div>
  );
}
