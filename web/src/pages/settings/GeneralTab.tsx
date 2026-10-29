import { useStore, setLanguage, navigate, updateSettingsSection } from '../../lib/store';
import { Choices, Check } from '../../components/ui';
import { LANGUAGES, t, type Lang } from '../../lib/i18n';

export function GeneralTab() {
  const language = useStore((s) => s.settings.language);
  const allowScripts = useStore((s) => s.settings.chat.allowScripts);
  const impHidden = useStore((s) => s.settings.impersonate.hidden);
  return (
    <div className="cs-columns">
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Interface language')}
        </h2>
        <Choices<Lang> label={t('Interface language')} value={language} onChange={(lang) => setLanguage(lang)} items={LANGUAGES} />
        <p className="cs-hint">
          {t('The page reloads to switch the language. Prompts that Cream Soda sends to the model stay in English whatever the interface language; the model is asked to answer in the language of the chat.')}{' '}
          <a
            href="#/settings/prompts"
            onClick={(e) => {
              e.preventDefault();
              navigate('settings', 'prompts');
            }}
          >
            {t('Edit the prompts')}
          </a>
        </p>
      </section>
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Chat')}
        </h2>
        <Check checked={!impHidden} onChange={(shown) => updateSettingsSection('impersonate', { hidden: !shown })}>
          {t('Show the Impersonate+ bar above the message box')}
        </Check>
        <Check checked={allowScripts} onChange={(on) => updateSettingsSection('chat', { allowScripts: on })}>
          {t('JavaScript in message widgets (status panels, trackers, ```html blocks)')}
        </Check>
        <p className="cs-hint">
          {allowScripts
            ? t('Scripts run in a sandboxed frame: they can not reach Cream Soda, your keys or other chats, but they can load things from the internet. Keep this on only for cards you trust.')
            : t('Off: widgets are shown without their scripts. Some status panels from cards only work with JavaScript.')}
        </p>
      </section>
    </div>
  );
}
