import { useStore, updateSettingsSection, updateSettings, setChat } from '../../lib/store';
import { Check, RangeField, Field, Choices } from '../../components/ui';
import { useTokenizer } from '../../lib/tokenizer';
import type { Settings } from '../../lib/types';
import { t } from '../../lib/i18n';

export function ChatTab() {
  const chat = useStore((s) => s.settings.chat);
  const tokenizer = useStore((s) => s.settings.tokenizer);
  const globalVars = useStore((s) => s.settings.globalVariables);
  const chatVars = useStore((s) => s.chat?.meta.variables);
  const tokKind = useTokenizer((s) => s.kind);
  const set = (p: Partial<Settings['chat']>) => updateSettingsSection('chat', p);
  return (
    <div className="cs-columns">
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Input and messages')}
        </h2>
        <Field label={t('Sending')}>
          <Choices<'enter' | 'ctrlEnter'>
            small
            value={chat.sendOnEnter}
            onChange={(sendOnEnter) => set({ sendOnEnter })}
            items={[
              { id: 'enter', label: t('Enter sends, Shift+Enter makes a new line') },
              { id: 'ctrlEnter', label: t('Ctrl+Enter sends') },
            ]}
          />
        </Field>
        <Check checked={chat.showTimestamps} onChange={(showTimestamps) => set({ showTimestamps })}>
          {t('Time on messages')}
        </Check>
        <Check checked={chat.showGenInfo} onChange={(showGenInfo) => set({ showGenInfo })}>
          {t('Model, time and tokens on replies')}
        </Check>
        <Check checked={chat.renderMarkdown} onChange={(renderMarkdown) => set({ renderMarkdown })}>
          {t('Formatting (*italics*, **bold**, lists)')}
        </Check>
        <Check checked={chat.renderHtml} onChange={(renderHtml) => set({ renderHtml })}>
          {t('Show HTML from messages (cleaned up, no scripts)')}
        </Check>
        <Check checked={chat.htmlIframe} onChange={(htmlIframe) => set({ htmlIframe })}>
          {t('HTML documents with styles in an isolated sandbox')}
        </Check>
        <Check checked={chat.allowScripts} onChange={(allowScripts) => set({ allowScripts })}>
          {t('JavaScript in message widgets (status panels, trackers, ```html blocks)')}
        </Check>
        {chat.allowScripts ? (
          <p className="cs-hint">
            {t('Scripts run in a sandboxed frame: they can not reach Cream Soda, your keys or other chats, but they can load things from the internet. Keep this on only for cards you trust.')}
          </p>
        ) : null}
        <Check checked={chat.collapseReasoning} onChange={(collapseReasoning) => set({ collapseReasoning })}>
          {t("Collapse the model's reasoning")}
        </Check>
        <Check checked={chat.confirmDelete} onChange={(confirmDelete) => set({ confirmDelete })}>
          {t('Ask before deleting a message')}
        </Check>
        <Check checked={chat.autoScroll} onChange={(autoScroll) => set({ autoScroll })}>
          {t('Scroll to new messages')}
        </Check>
        <RangeField label={t('Messages on screen at once')} value={chat.renderLimit} min={20} max={500} step={10} onChange={(renderLimit) => set({ renderLimit })} />
      </section>
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          {t('Generation')}
        </h2>
        <Check checked={chat.autoContinue} onChange={(autoContinue) => set({ autoContinue })}>
          {t('Auto-continue if a reply was cut off by length')}
        </Check>
        {chat.autoContinue ? <RangeField label={t('…and shorter than, characters')} value={chat.autoContinueMinChars} min={50} max={2000} step={50} onChange={(autoContinueMinChars) => set({ autoContinueMinChars })} /> : null}
        <Check checked={chat.trimIncomplete} onChange={(trimIncomplete) => set({ trimIncomplete })}>
          {t('Trim an unfinished sentence at the end')}
        </Check>
        <Field label={t('Token counting · now {x}', { x: tokKind === 'estimate' ? t('estimate') : tokKind })}>
          <select className="cs-select" value={tokenizer} onChange={(e) => updateSettings({ tokenizer: e.target.value as Settings['tokenizer'] })}>
            <option value="auto">{t('Auto (o200k: GPT-4o and similar)')}</option>
            <option value="cl100k">{t('cl100k (GPT-4, many open-source models)')}</option>
            <option value="estimate">{t('Quick estimate by characters')}</option>
          </select>
        </Field>
        <h3 className="cs-h3" style={{ marginTop: 8 }}>
          {t('Variables')}
        </h3>
        <p className="cs-hint">{t('Set by the macros')} {t('{{setvar::name::value}}')} {t('and the /setvar command. You can edit them by hand here.')}</p>
        <VarTable title={t('This chat')} vars={chatVars} onChange={(v) => setChat((c) => ({ ...c, meta: { ...c.meta, variables: v } }))} />
        <VarTable title={t('Global (all chats)')} vars={globalVars} onChange={(v) => updateSettings({ globalVariables: v })} />
      </section>
    </div>
  );
}

function VarTable({ title, vars, onChange }: { title: string; vars?: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!vars) return <p className="cs-hint">{title}{t(': open a chat.')}</p>;
  const entries = Object.entries(vars);
  return (
    <div className="cs-col" style={{ gap: 6 }}>
      <span className="cs-label">{title}</span>
      {entries.map(([k, v]) => (
        <div key={k} className="cs-row" style={{ gap: 6 }}>
          <code className="cs-mono" style={{ minWidth: 90, fontSize: 12 }}>
            {k}
          </code>
          <input className="cs-input cs-grow" style={{ minHeight: 36 }} value={v} onChange={(e) => onChange({ ...vars, [k]: e.target.value })} aria-label={k} />
          <button
            type="button"
            className="cs-icon-btn cs-icon-btn--xs"
            aria-label={t('Delete')}
            onClick={() => {
              const n = { ...vars };
              delete n[k];
              onChange(n);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {!entries.length ? <span className="cs-hint">{t('empty')}</span> : null}
    </div>
  );
}
