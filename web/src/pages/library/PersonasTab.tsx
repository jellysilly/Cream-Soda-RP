import { useEffect, useState } from 'react';
import { useStore, upsert, removeItem, updateSettings, toast } from '../../lib/store';
import { Avatar, Field, Choices, confirmDialog, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newPersona } from '../../lib/defaults';
import type { Persona, PersonaPosition, Role } from '../../lib/types';
import { pickFiles, toKana, fmtNum } from '../../lib/utils';
import { uploadImage, importPersonasInteractive, exportPersonas } from '../../lib/appActions';
import { countTokens } from '../../lib/tokenizer';
import { t } from '../../lib/i18n';

export function PersonasTab({ query }: { query: string }) {
  const personas = useStore((s) => s.personas);
  const active = useStore((s) => s.settings.activePersonaId);
  const characters = useStore((s) => s.characters);
  const param = useStore((s) => s.routeParam);
  const [sel, setSel] = useState(() => param.replace(/^persona:/, '') || active || personas[0]?.id || '');
  useEffect(() => {
    const m = /^persona:(.+)$/.exec(param);
    if (m) setSel(m[1]);
  }, [param]);
  const q = query.toLowerCase();
  const list = personas.filter((p) => !q || `${p.name} ${p.description}`.toLowerCase().includes(q));
  const p = personas.find((x) => x.id === sel);
  const set = (patch: Partial<Persona>) => p && upsert('personas', { ...p, ...patch });

  return (
    <div className="cs-columns">
      <section className="cs-panel cs-col-side" style={{ flex: '1 1 300px' }}>
        <div className="cs-panel-head">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            {t('Personas')}
          </h2>
          <button type="button" className="cs-icon-btn cs-icon-btn--mint cs-ml-auto" style={{ width: 40, height: 40 }} aria-label={t('New persona')} onClick={() => setSel(upsert('personas', newPersona({ name: t('New persona') })).id)}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        {list.map((x) => (
          <button key={x.id} type="button" className="cs-select-item" aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
            <Avatar src={x.avatar} name={x.name} kana={x.kana} palette={x.palette} size={36} />
            <span className="cs-grow">
              <span className="cs-select-item__title">{x.name}</span>
              <span className="cs-select-item__sub cs-ellipsis">{x.id === active ? t('current') : x.title || x.description.slice(0, 50)}</span>
            </span>
          </button>
        ))}
        {!list.length ? <Empty icon="user" title={t('No personas yet')} /> : null}
        <div className="cs-row">
          <button type="button" className="cs-btn cs-btn--sm cs-btn--flex" onClick={importPersonasInteractive}>
            {t('Import')}
          </button>
          <button type="button" className="cs-btn cs-btn--sm cs-btn--flex" onClick={() => exportPersonas()}>
            {t('Export')}
          </button>
        </div>
      </section>
      {p ? (
        <section className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-main" style={{ flex: '999 1 460px' }}>
          <div className="cs-row" style={{ gap: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cs-avatar-edit"
              aria-label={t('Change the avatar')}
              onClick={async () => {
                const [f] = await pickFiles('image/*');
                if (f) set({ avatar: await uploadImage('avatars', f, f.name) });
              }}
            >
              <Avatar src={p.avatar} name={p.name} kana={p.kana} palette={p.palette} size={84} ring />
            </button>
            <div className="cs-grid-fields cs-grow">
              <Field label={t('Name')}>
                <input className="cs-input cs-input--title" value={p.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('Tagline')}>
                <input className="cs-input" value={p.title} placeholder={t('e.g. late guest')} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label={t('Kana')}>
                <input className="cs-input" value={p.kana} placeholder={toKana(p.name)} onChange={(e) => set({ kana: e.target.value })} />
              </Field>
            </div>
          </div>
          <Field label={t('Description · {x} tok.', { x: fmtNum(countTokens(p.description)) })} hint={t('Goes into the prompt as {{persona}}: appearance, character, relationships.')}>
            <textarea className="cs-textarea cs-textarea--lg" rows={7} value={p.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label={t('Where in the prompt')}>
            <Choices<PersonaPosition>
              small
              value={p.position}
              onChange={(position) => set({ position })}
              items={[
                { id: 'prompt', label: t('In the persona block') },
                { id: 'an_top', label: t("Above the author's note") },
                { id: 'an_bottom', label: t("Below the author's note") },
                { id: 'depth', label: t('At depth') },
                { id: 'none', label: t("Don't send") },
              ]}
            />
          </Field>
          {p.position === 'depth' ? (
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label={t('Depth')}>
                <input className="cs-input" type="number" min={0} value={p.depth} onChange={(e) => set({ depth: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label={t('Role')}>
                <select className="cs-select" value={p.role} onChange={(e) => set({ role: e.target.value as Role })}>
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
              </Field>
            </div>
          ) : null}
          <span className="cs-label">{t('Turn on automatically with characters')}</span>
          <div className="cs-chips">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cs-choice cs-choice--sm"
                aria-pressed={p.lockedCharIds.includes(c.id)}
                onClick={() => set({ lockedCharIds: p.lockedCharIds.includes(c.id) ? p.lockedCharIds.filter((x) => x !== c.id) : [...p.lockedCharIds, c.id] })}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--primary cs-btn--flex" disabled={p.id === active} onClick={() => updateSettings({ activePersonaId: p.id })}>
              {p.id === active ? t('Active') : t('Make active')}
            </button>
            <button
              type="button"
              className="cs-btn cs-btn--danger"
              onClick={async () => {
                if (!(await confirmDialog(t('Delete the persona “{name}”?', { name: p.name }), { ok: t('Delete') }))) return;
                await removeItem('personas', p.id);
                toast(t('Persona deleted'));
                setSel(personas.find((x) => x.id !== p.id)?.id || '');
              }}
            >
              {t('Delete')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
