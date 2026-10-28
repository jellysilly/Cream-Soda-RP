import { useStore, upsert, removeItem, toast } from '../../lib/store';
import { Avatar, Field, Check, Choices, confirmDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { openGroup, startNewChat } from '../../lib/generate';
import { navigate } from '../../lib/store';
import type { Group, GroupActivation } from '../../lib/types';
import { pickFiles } from '../../lib/utils';
import { uploadImage } from '../../lib/appActions';

export function GroupEditor({ group }: { group: Group }) {
  const g = useStore((s) => s.groups.find((x) => x.id === group.id)) || group;
  const characters = useStore((s) => s.characters);
  const set = (patch: Partial<Group>) => upsert('groups', { ...g, ...patch });
  const toggle = (id: string) => set({ memberIds: g.memberIds.includes(id) ? g.memberIds.filter((x) => x !== id) : [...g.memberIds, id] });
  return (
    <aside className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-side" style={{ flex: '1 1 360px' }} aria-label="Группа">
      <div className="cs-row" style={{ gap: 12 }}>
        <button
          type="button"
          className="cs-avatar-edit"
          aria-label="Обложка группы"
          onClick={async () => {
            const [f] = await pickFiles('image/*');
            if (f) set({ avatar: await uploadImage('avatars', f, f.name) });
          }}
        >
          <Avatar src={g.avatar} name={g.name} palette={4} size={64} ring />
        </button>
        <input className="cs-input cs-input--title cs-grow" value={g.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название группы" />
      </div>
      <span className="cs-label">Участники · нажми, чтобы добавить или убрать</span>
      <div className="cs-col" style={{ gap: 6, maxHeight: 280, overflow: 'auto' }}>
        {characters.map((c) => {
          const inGroup = g.memberIds.includes(c.id);
          const muted = g.mutedIds.includes(c.id);
          return (
            <div key={c.id} className="cs-row-item" style={{ opacity: inGroup ? 1 : 0.6 }}>
              <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={32} />
              <span className="cs-grow cs-ellipsis" style={{ fontWeight: 700 }}>
                {c.name}
              </span>
              {inGroup ? (
                <button type="button" className="cs-btn cs-btn--xs" onClick={() => set({ mutedIds: muted ? g.mutedIds.filter((x) => x !== c.id) : [...g.mutedIds, c.id] })}>
                  {muted ? 'заглушён' : 'активен'}
                </button>
              ) : null}
              <button type="button" className={`cs-icon-btn cs-icon-btn--xs${inGroup ? ' cs-icon-btn--active' : ''}`} aria-label={inGroup ? 'Убрать' : 'Добавить'} onClick={() => toggle(c.id)}>
                <Icon name={inGroup ? 'check' : 'plus'} size={14} stroke={2.4} />
              </button>
            </div>
          );
        })}
      </div>
      <Field label="Кто отвечает">
        <Choices<GroupActivation>
          small
          value={g.activation}
          onChange={(activation) => set({ activation })}
          items={[
            { id: 'natural', label: 'Естественно' },
            { id: 'list', label: 'По очереди' },
            { id: 'pooled', label: 'Кто молчал' },
            { id: 'manual', label: 'Вручную' },
          ]}
        />
      </Field>
      <Field label="Карточки в промпте">
        <Choices<'swap' | 'append'>
          small
          value={g.generationMode}
          onChange={(generationMode) => set({ generationMode })}
          items={[
            { id: 'swap', label: 'Только говорящий' },
            { id: 'append', label: 'Все участники' },
          ]}
        />
      </Field>
      <Check checked={g.allowSelfResponses} onChange={(allowSelfResponses) => set({ allowSelfResponses })}>
        Можно отвечать самому себе
      </Check>
      <Check checked={g.autoMode} onChange={(autoMode) => set({ autoMode })}>
        Автоматический режим (персонажи говорят сами)
      </Check>
      <Field label="Сценарий группы" hint="Заменяет сценарии карточек в групповом чате.">
        <textarea className="cs-textarea" rows={3} value={g.scenario} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <div className="cs-row cs-row--wrap">
        <button type="button" className="cs-btn cs-btn--primary cs-btn--flex" disabled={!g.memberIds.length} onClick={() => openGroup(g.id)}>
          Открыть чат
        </button>
        <button type="button" className="cs-btn cs-btn--flex" disabled={!g.memberIds.length} onClick={() => startNewChat('group', g.id).then(() => navigate('chat'))}>
          Новый чат
        </button>
        <button
          type="button"
          className="cs-btn cs-btn--danger"
          onClick={async () => {
            if (await confirmDialog(`Удалить группу «${g.name}» и её чаты?`, { ok: 'Удалить' })) {
              await removeItem('groups', g.id, true);
              toast('Группа удалена');
            }
          }}
        >
          Удалить
        </button>
      </div>
    </aside>
  );
}
