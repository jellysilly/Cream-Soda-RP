import { useEffect, useState } from 'react';
import { useStore, upsert, removeItem, navigate, toast } from '../../lib/store';
import { Field, TagInput, confirmDialog, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newPlot } from '../../lib/defaults';
import type { Plot } from '../../lib/types';
import { startNewChat } from '../../lib/generate';

export function PlotsTab({ query }: { query: string }) {
  const plots = useStore((s) => s.plots);
  const characters = useStore((s) => s.characters);
  const param = useStore((s) => s.routeParam);
  const [sel, setSel] = useState(() => param.replace(/^plot:/, '') || plots[0]?.id || '');
  useEffect(() => {
    const m = /^plot:(.+)$/.exec(param);
    if (m) setSel(m[1]);
  }, [param]);
  const q = query.toLowerCase();
  const list = plots.filter((p) => !q || `${p.title} ${p.premise} ${p.tags.join(' ')}`.toLowerCase().includes(q));
  const p = plots.find((x) => x.id === sel);
  const set = (patch: Partial<Plot>) => p && upsert('plots', { ...p, ...patch });

  return (
    <div className="cs-columns">
      <section className="cs-panel cs-col-side" style={{ flex: '1 1 280px' }}>
        <div className="cs-panel-head">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Сюжеты
          </h2>
          <button type="button" className="cs-icon-btn cs-icon-btn--mint cs-ml-auto" style={{ width: 40, height: 40 }} aria-label="Новый сюжет" onClick={() => setSel(upsert('plots', newPlot()).id)}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        <p className="cs-hint">Сюжет — готовая завязка: сценарий и первое сообщение, с которых можно начать чат с любым персонажем.</p>
        {list.map((x) => (
          <button key={x.id} type="button" className="cs-select-item" aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
            <Icon name="scene" size={20} />
            <span className="cs-grow">
              <span className="cs-select-item__title cs-ellipsis">{x.title}</span>
              <span className="cs-select-item__sub cs-ellipsis">{x.premise || 'без описания'}</span>
            </span>
          </button>
        ))}
        {!list.length ? <Empty icon="scene" title="Сюжетов пока нет">Создай вручную или в Генераторе</Empty> : null}
      </section>
      {p ? (
        <section className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-main" style={{ flex: '999 1 460px' }}>
          <Field label="Название">
            <input className="cs-input cs-input--title" value={p.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Завязка (для себя)">
            <textarea className="cs-textarea" rows={2} value={p.premise} onChange={(e) => set({ premise: e.target.value })} />
          </Field>
          <Field label="Сценарий" hint="Заменит сценарий карточки в чате, начатом по этому сюжету.">
            <textarea className="cs-textarea" rows={5} value={p.scenario} onChange={(e) => set({ scenario: e.target.value })} />
          </Field>
          <Field label="Первое сообщение">
            <textarea className="cs-textarea" rows={5} value={p.firstMessage} onChange={(e) => set({ firstMessage: e.target.value })} />
          </Field>
          <Field label="Теги">
            <TagInput value={p.tags} onChange={(tags) => set({ tags })} placeholder="+ тег" mono={false} />
          </Field>
          <span className="cs-label">Начать чат по сюжету с…</span>
          <div className="cs-chips">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cs-choice cs-choice--sm"
                onClick={async () => {
                  await startNewChat('character', c.id, { title: `${p.title} · ${c.name}`, plot: { scenario: p.scenario, firstMessage: p.firstMessage, id: p.id } });
                  navigate('chat');
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cs-btn cs-btn--danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              if (!(await confirmDialog(`Удалить сюжет «${p.title}»?`, { ok: 'Удалить' }))) return;
              await removeItem('plots', p.id);
              toast('Сюжет удалён');
            }}
          >
            Удалить
          </button>
        </section>
      ) : null}
    </div>
  );
}
