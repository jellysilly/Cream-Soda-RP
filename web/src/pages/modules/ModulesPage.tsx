import { useEffect, useRef, useState } from 'react';
import { useStore, updateSettingsSection, upsert, removeItem, getState } from '../../lib/store';
import { PageHead, Field, RangeField, Check, Switch, Empty, Tabs } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ExtensionsSection } from './ExtensionsSection';
import { voices, speak, ttsAvailable } from '../../lib/tts';
import { newQuickReplySet } from '../../lib/defaults';
import { uid } from '../../lib/utils';
import { slashHelp } from '../../lib/slash';
import { useExtensionPanels, type ExtensionPanel } from '../../lib/extensions';
import { PromptEditor } from '../../components/PromptEditor';
import { LANGUAGE_LABELS, type PromptKey } from '../../lib/prompts';
import { t } from '../../lib/i18n';
import type { ImpersonateMode, QuickReplySet } from '../../lib/types';

const MODE_PROMPTS: Record<ImpersonateMode, PromptKey> = {
  continue: 'impersonateContinue',
  variants: 'impersonateVariants',
  action: 'impersonateAction',
  voice: 'impersonateVoice',
};

function TtsPanel() {
  const tts = useStore((s) => s.settings.extensions.tts);
  const [list, setList] = useState(voices());
  useEffect(() => {
    if (!ttsAvailable()) return;
    const update = () => setList(voices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  const set = (p: Partial<typeof tts>) => updateSettingsSection('extensions', { tts: { ...getState().settings.extensions.tts, ...p } });
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        {t('Text to speech')}
      </h2>
      {!ttsAvailable() ? <p className="cs-hint">{t('This browser does not support speech synthesis.')}</p> : null}
      <Field label={t('Voice')}>
        <select className="cs-select" value={tts.voice} onChange={(e) => set({ voice: e.target.value })}>
          <option value="">{t('Automatic (by the language of the text)')}</option>
          {list.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      </Field>
      <RangeField label={t('Speed')} value={tts.rate} min={0.5} max={2} step={0.05} onChange={(rate) => set({ rate })} />
      <RangeField label={t('Pitch')} value={tts.pitch} min={0.5} max={2} step={0.05} onChange={(pitch) => set({ pitch })} />
      <Check checked={tts.auto} onChange={(auto) => set({ auto })}>
        {t('Read new replies automatically')}
      </Check>
      <Check checked={tts.onlyQuotes} onChange={(onlyQuotes) => set({ onlyQuotes })}>
        {t('Only direct speech (“…”)')}
      </Check>
      <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => speak(t('“On the house. You came five minutes before closing again.”'))}>
        <Icon name="speaker" size={16} /> {t('Test the voice')}
      </button>
    </section>
  );
}

function TranslatePanel() {
  const tr = useStore((s) => s.settings.extensions.translate);
  const set = (p: Partial<typeof tr>) => updateSettingsSection('extensions', { translate: { ...getState().settings.extensions.translate, ...p } });
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        {t('Chat translator')}
      </h2>
      <p className="cs-hint">{t('Translates messages with the utility model (Settings → “Which profile for what”). In the message menu: “Translate”.')}</p>
      <Field label={t('Translation language')}>
        <select className="cs-select" value={tr.target} onChange={(e) => set({ target: e.target.value })}>
          <option value="">{t('Interface language')}</option>
          {Object.entries(LANGUAGE_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Check checked={tr.auto} onChange={(auto) => set({ auto })}>
        {t('Translate new replies automatically')}
      </Check>
    </section>
  );
}

function ImpersonatePanel() {
  const imp = useStore((s) => s.settings.impersonate);
  const [mode, setMode] = useState<ImpersonateMode>('variants');
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        Impersonate+
      </h2>
      <RangeField label={t('How many variants')} value={imp.count} min={2} max={5} onChange={(count) => updateSettingsSection('impersonate', { count })} />
      <Tabs<ImpersonateMode>
        value={mode}
        onChange={setMode}
        items={[
          { id: 'continue', label: t('Continue') },
          { id: 'variants', label: t('Variants') },
          { id: 'action', label: t('Action') },
          { id: 'voice', label: t('Voice') },
        ]}
      />
      <PromptEditor id={MODE_PROMPTS[mode]} rows={6} />
      <PromptEditor id="impersonateDirection" rows={1} />
      <Check checked={!imp.hidden} onChange={(shown) => updateSettingsSection('impersonate', { hidden: !shown })}>
        {t('Show the Impersonate+ bar above the message box')}
      </Check>
    </section>
  );
}

function QuickRepliesPanel() {
  const sets = useStore((s) => s.quickreplies);
  const [sel, setSel] = useState(sets[0]?.id || '');
  const qs = sets.find((s) => s.id === sel) || sets[0];
  const set = (p: Partial<QuickReplySet>) => qs && upsert('quickreplies', { ...qs, ...p });
  return (
    <section className="cs-panel" style={{ gridColumn: '1 / -1' }}>
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Quick replies')}
        </h2>
        <select className="cs-select cs-select--sm cs-ml-auto" value={qs?.id || ''} onChange={(e) => setSel(e.target.value)} aria-label={t('Set')}>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="cs-icon-btn cs-icon-btn--mint" style={{ width: 36, height: 36 }} aria-label={t('New set')} onClick={() => setSel(upsert('quickreplies', newQuickReplySet({ name: t('New set') })).id)}>
          <Icon name="plus" size={16} stroke={2.2} />
        </button>
      </div>
      {qs ? (
        <>
          <div className="cs-row cs-row--wrap">
            <input className="cs-input cs-grow" value={qs.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('Set name')} />
            <Check checked={qs.enabled} onChange={(enabled) => set({ enabled })}>
              {t('Show above the input')}
            </Check>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--danger" onClick={() => removeItem('quickreplies', qs.id)}>
              {t('Delete the set')}
            </button>
          </div>
          <p className="cs-hint">{t('The text is sent as a message; a line starting with “/” runs as a command (you can chain them with “|”).')}</p>
          {qs.replies.map((r) => (
            <div key={r.id} className="cs-row-item" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <input className="cs-input" style={{ flex: '0 1 160px' }} value={r.label} placeholder={t('Tagline')} onChange={(e) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} />
              <input className="cs-input cs-input--mono cs-grow" style={{ minWidth: 200 }} value={r.message} placeholder={t('/roll 1d20 or text')} onChange={(e) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, message: e.target.value } : x)) })} />
              <div className="cs-chips">
                <Check chip checked={r.autoOnNewChat} onChange={(autoOnNewChat) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, autoOnNewChat } : x)) })}>
                  {t('on a new chat')}
                </Check>
                <Check chip checked={r.autoOnAi} onChange={(autoOnAi) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, autoOnAi } : x)) })}>
                  {t('after an AI reply')}
                </Check>
              </div>
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label={t('Delete')} onClick={() => set({ replies: qs.replies.filter((x) => x.id !== r.id) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cs-btn cs-btn--dashed"
            onClick={() => set({ replies: [...qs.replies, { id: uid(), label: t('Button'), message: '', title: '', autoOnNewChat: false, autoOnUser: false, autoOnAi: false }] })}
          >
            {t('+ button')}
          </button>
        </>
      ) : (
        <Empty icon="zap" title={t('No sets')} />
      )}
    </section>
  );
}

function ExtensionPanelView({ panel }: { panel: ExtensionPanel }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const cleanup = panel.render(ref.current);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [panel]);
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        {panel.title}
      </h2>
      <div ref={ref} />
    </section>
  );
}

export default function ModulesPage() {
  const enabled = useStore((s) => s.settings.extensions.enabled);
  const dice = useStore((s) => s.settings.extensions.dice);
  const panels = useExtensionPanels((s) => s.panels);
  const failed = useExtensionPanels((s) => s.failed);
  const [showCommands, setShowCommands] = useState(false);
  return (
    <div className="cs-page">
      <PageHead title={t('Modules')} kana="トッピング" sub={t('Built-in modules, community extensions and quick replies')} />
      <ExtensionsSection />
      {Object.keys(failed).length ? (
        <section className="cs-panel">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            {t('Failed to load')}
          </h2>
          {Object.entries(failed).map(([name, err]) => (
            <p key={name} className="cs-hint">
              <b>{name}</b>: {err}
            </p>
          ))}
          <p className="cs-hint">{t("SillyTavern extensions that import ST's internal files directly won't work; the window.CreamSoda API and part of SillyTavern.getContext() are supported.")}</p>
        </section>
      ) : null}
      <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: 18, alignItems: 'start' }}>
        {enabled.impersonate ? <ImpersonatePanel /> : null}
        {enabled.tts ? <TtsPanel /> : null}
        {enabled.translate ? <TranslatePanel /> : null}
        {enabled.dice ? (
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Dice and stats')}
            </h2>
            <p className="cs-hint">{t('The /roll 2d6+1 command, the {x} macro. Stats can live in variables: /setvar key=hp 10, {x2}.', { x: '{{roll:1d20}}', x2: '{{getvar::hp}}' })}</p>
            <label className="cs-check cs-check--row">
              {t('Dice bar above the input')}
              <Switch checked={dice.showBar} label={t('Dice bar')} onChange={(showBar) => updateSettingsSection('extensions', { dice: { showBar } })} />
            </label>
          </section>
        ) : null}
        {enabled.expressions ? (
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Expressions')}
            </h2>
            <p className="cs-hint">{t('Upload emotion sprites in the character card (the Sprites tab). In the Visual novel view the sprite is shown above the chat.')}</p>
          </section>
        ) : null}
        {enabled.quickreplies ? <QuickRepliesPanel /> : null}
        {panels.map((p) => (
          <ExtensionPanelView key={p.id} panel={p} />
        ))}
        <section className="cs-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="cs-panel-head">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              {t('Slash commands')}
            </h2>
            <button type="button" className="cs-btn cs-btn--sm cs-ml-auto" onClick={() => setShowCommands(!showCommands)}>
              {showCommands ? t('Hide') : t('Show all')}
            </button>
          </div>
          <p className="cs-hint">{t('Type in the chat input. Commands are chained with “|”, the result of the previous one is {x}.', { x: '{{pipe}}' })}</p>
          {showCommands ? (
            <div className="cs-col" style={{ gap: 4 }}>
              {slashHelp().map((c) => (
                <div key={c.name} style={{ fontSize: 13 }}>
                  <code className="cs-mono" style={{ color: 'var(--cs-link)', fontWeight: 600 }}>
                    /{c.name}
                  </code>
                  {c.aliases.length ? <span className="cs-muted"> ({c.aliases.map((a) => `/${a}`).join(', ')})</span> : null} — {c.help.replace(/^\/\S+\s*(—\s*)?/, '')}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
