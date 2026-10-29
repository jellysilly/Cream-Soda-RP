import { useState } from 'react';
import { useStore, setState, toast, toastError, getState, updateSettingsSection } from '../../lib/store';
import { Switch, Kana, confirmDialog, openMenu } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { extensionEnabled, setExtensionEnabled, loadExtensions } from '../../lib/extensions';
import { t } from '../../lib/i18n';

export const BUILTIN_MODULES: { id: string; name: string; note: string; kana: string; bg: string; fg: string }[] = [
  { id: 'memory', name: 'Memory Book', note: t('built-in'), kana: 'メ', bg: 'var(--cs-mint-soft)', fg: 'var(--cs-mint-deep)' },
  { id: 'impersonate', name: 'Impersonate+', note: t('built-in'), kana: 'ナ', bg: 'var(--cs-rose-soft)', fg: 'var(--cs-rose-deep)' },
  { id: 'images', name: t('Image generator'), note: t('built-in · your own API'), kana: 'エ', bg: 'var(--cs-sky-soft)', fg: 'var(--cs-sky-deep)' },
  { id: 'tts', name: t('Text to speech (TTS)'), note: t('built-in · system voices'), kana: 'コ', bg: 'var(--cs-lilac-soft)', fg: 'var(--cs-lilac-deep)' },
  { id: 'translate', name: t('Chat translator'), note: t('built-in · through the model'), kana: 'ヤ', bg: 'var(--cs-honey-soft)', fg: 'var(--cs-honey-deep)' },
  { id: 'dice', name: t('Dice and stats'), note: t('built-in · /roll'), kana: 'サ', bg: 'var(--cs-rose-soft)', fg: 'var(--cs-rose-deep)' },
  { id: 'quickreplies', name: t('Quick replies'), note: t('built-in · buttons above the input'), kana: 'ク', bg: 'var(--cs-mint-soft)', fg: 'var(--cs-mint-deep)' },
  { id: 'expressions', name: t('Expressions'), note: t('built-in · emotion sprites'), kana: 'カ', bg: 'var(--cs-sky-soft)', fg: 'var(--cs-sky-deep)' },
];

export function ExtensionsSection() {
  const enabled = useStore((s) => s.settings.extensions.enabled);
  const extensions = useStore((s) => s.extensions);
  useStore((s) => s.extensionsState);
  const isLocal = useStore((s) => s.isLocal);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const install = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const ext = await api.installExtension(url.trim());
      setState({ extensions: await api.extensions() });
      setUrl('');
      toast(t('Extension “{displayName}” installed', { displayName: ext.displayName }));
      await loadExtensions();
    } catch (err) {
      toastError(err, t('Installing'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('Extensions')} className="cs-panel cs-panel--pad-lg">
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 19 }}>
          {t('Extensions')}
        </h2>
        <Kana>トッピング</Kana>
        <label className="cs-inline-field cs-ml-auto" style={{ flex: '0 1 380px' }}>
          Git
          <input type="url" placeholder={t('link to the extension repository')} value={url} disabled={!isLocal} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && install()} />
          <button type="button" className="cs-btn cs-btn--primary cs-btn--sm" style={{ minHeight: 34 }} disabled={busy || !url.trim()} onClick={install}>
            {busy ? <span className="cs-spinner" style={{ width: 16, height: 16 }} /> : null}
            {t('Install')}
          </button>
        </label>
      </div>
      <div className="cs-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
        {BUILTIN_MODULES.map((m) => (
          <div key={m.id} className="cs-ext-card">
            <div className="cs-ext-card__icon" aria-hidden="true" style={{ background: m.bg, color: m.fg }}>
              {m.kana}
            </div>
            <div className="cs-grow">
              <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cs-muted)' }}>{m.note}</div>
            </div>
            <Switch checked={!!enabled[m.id]} label={enabled[m.id] ? t('Turn off') : t('Turn on')} onChange={(v) => updateSettingsSection('extensions', { enabled: { ...getState().settings.extensions.enabled, [m.id]: v } })} />
          </div>
        ))}
        {extensions.map((e) => (
          <div key={e.name} className="cs-ext-card">
            <div className="cs-ext-card__icon" aria-hidden="true" style={{ background: 'var(--cs-lilac-soft)', color: 'var(--cs-lilac-deep)' }}>
              {e.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="cs-grow" style={{ minWidth: 0 }}>
              <div className="cs-ellipsis" style={{ fontWeight: 800, fontSize: 14 }}>
                {e.displayName}
              </div>
              <div className="cs-ellipsis" style={{ fontSize: 12, color: 'var(--cs-muted)' }}>
                {[e.version && `v${e.version}`, e.author || t('community')].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              className="cs-icon-btn cs-icon-btn--xs"
              aria-label={t('Actions')}
              onClick={(ev) =>
                openMenu(ev.currentTarget, [
                  { label: t('Project page'), icon: 'external', hidden: !e.homePage, onClick: () => window.open(e.homePage, '_blank', 'noopener') },
                  {
                    label: t('Update (git pull)'),
                    icon: 'refresh',
                    hidden: !e.isGit || !isLocal,
                    onClick: async () => {
                      try {
                        const r = await api.updateExtension(e.name);
                        toast(r.output || t('Updated. Reload the page.'));
                      } catch (err) {
                        toastError(err);
                      }
                    },
                  },
                  {
                    label: t('Delete'),
                    icon: 'trash',
                    danger: true,
                    hidden: !isLocal,
                    onClick: async () => {
                      if (!(await confirmDialog(t('Delete the extension “{displayName}”?', { displayName: e.displayName }), { ok: t('Delete') }))) return;
                      await api.removeExtension(e.name);
                      setState({ extensions: await api.extensions() });
                      toast(t('Deleted. Reload the page to unload its code.'));
                    },
                  },
                ])
              }
            >
              <Icon name="dots" size={14} />
            </button>
            <Switch
              checked={extensionEnabled(e.name)}
              label={extensionEnabled(e.name) ? t('Turn off') : t('Turn on')}
              onChange={(v) => {
                setExtensionEnabled(e.name, v);
                toast(v ? t('On, loading…') : t('Off. The code unloads after a page reload.'));
                if (v) loadExtensions();
              }}
            />
          </div>
        ))}
      </div>
      {!isLocal ? <p className="cs-hint">{t('Extensions can be installed and removed only on the computer where the server runs.')}</p> : null}
    </section>
  );
}
