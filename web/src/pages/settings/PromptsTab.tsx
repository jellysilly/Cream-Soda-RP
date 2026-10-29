import { useStore, updateSettings } from '../../lib/store';
import { confirmDialog } from '../../components/ui';
import { PromptEditor } from '../../components/PromptEditor';
import { PROMPT_INFO } from '../../lib/prompts';
import { t } from '../../lib/i18n';

/** Cream Soda's own prompts, grouped by feature. Presets and cards keep their prompts themselves. */
export function PromptsTab() {
  const custom = useStore((s) => Object.keys(s.settings.prompts || {}).length);
  const groups = [...new Set(PROMPT_INFO.map((p) => p.group))];
  return (
    <div className="cs-columns">
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 100%', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Prompts')}
        </h2>
        <p className="cs-hint">
          {t('These are the requests Cream Soda itself sends to the model: Impersonate+, Memory Book, translation, images and the generator. They are in English whatever the interface language, and ask the model to write in the language of the chat. The main prompt, the post-history instruction and the other prompt blocks live in Presets; character prompts live in the cards.')}
        </p>
        {custom ? (
          <button
            type="button"
            className="cs-btn cs-btn--sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              if (await confirmDialog(t('Reset all edited prompts to the defaults?'), { ok: t('Reset') })) updateSettings({ prompts: {} });
            }}
          >
            {t('Reset all ({n})', { n: custom })}
          </button>
        ) : null}
      </section>
      {groups.map((group) => (
        <section key={group} className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            {group}
          </h2>
          {PROMPT_INFO.filter((p) => p.group === group).map((p) => (
            <PromptEditor key={p.key} id={p.key} rows={p.key === 'impersonateDirection' || p.key === 'attachment' || p.key === 'generatorTask' ? 2 : 5} />
          ))}
        </section>
      ))}
    </div>
  );
}
