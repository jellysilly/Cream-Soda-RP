import { useState } from 'react';
import { useStore } from '../lib/store';
import { DEFAULT_PROMPTS, PROMPT_INFO, setPrompt, type PromptKey } from '../lib/prompts';
import { t } from '../lib/i18n';
import { Field } from './ui';

/**
 * Editor for one of Cream Soda's own prompts (Settings → Prompts, and next to the
 * feature that uses it). Shows the prompt in effect; an edit saves an override,
 * «Reset» brings the English default back.
 */
export function PromptEditor({ id, rows = 4, label }: { id: PromptKey; rows?: number; label?: string }) {
  const custom = useStore((s) => s.settings.prompts?.[id]);
  const info = PROMPT_INFO.find((p) => p.key === id)!;
  const saved = custom && custom.trim() ? custom : DEFAULT_PROMPTS[id];
  // While typing, an emptied field must stay empty instead of snapping back to the default.
  const [draft, setDraft] = useState<string | null>(null);
  const changed = !!custom && custom.trim() !== '' && custom !== DEFAULT_PROMPTS[id];
  const vars = info.vars.map((v) => `{{${v}}}`).join(', ');
  return (
    <Field
      label={
        <span className="cs-prompt-editor__label">
          {label ?? info.title}
          {changed ? <span className="cs-pill cs-pill--rose">{t('edited')}</span> : null}
        </span>
      }
      honey
      hint={
        <span className="cs-prompt-editor__hint">
          <span>{vars ? t('Filled in: {vars}. Macros like {{char}} and {{user}} work too.', { vars }) : t('Macros like {{char}} and {{user}} work here.')}</span>
          {changed ? (
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => (setDraft(null), setPrompt(id, ''))}>
              {t('Reset to default')}
            </button>
          ) : null}
        </span>
      }
    >
      <textarea
        className="cs-textarea"
        rows={rows}
        spellCheck={false}
        value={draft ?? saved}
        onChange={(e) => {
          setDraft(e.target.value);
          setPrompt(id, e.target.value);
        }}
        onBlur={() => setDraft(null)}
      />
    </Field>
  );
}
