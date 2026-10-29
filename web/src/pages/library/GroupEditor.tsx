import { useStore, upsert, removeItem, toast } from '../../lib/store';
import { Avatar, Field, Check, Choices, confirmDialog } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { openGroup, startNewChat } from '../../lib/generate';
import { navigate } from '../../lib/store';
import type { Group, GroupActivation } from '../../lib/types';
import { pickFiles } from '../../lib/utils';
import { uploadImage } from '../../lib/appActions';
import { t } from '../../lib/i18n';

export function GroupEditor({ group }: { group: Group }) {
  const g = useStore((s) => s.groups.find((x) => x.id === group.id)) || group;
  const characters = useStore((s) => s.characters);
  const set = (patch: Partial<Group>) => upsert('groups', { ...g, ...patch });
  const toggle = (id: string) => set({ memberIds: g.memberIds.includes(id) ? g.memberIds.filter((x) => x !== id) : [...g.memberIds, id] });
  return (
    <aside className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-side" style={{ flex: '1 1 360px' }} aria-label={t('Group')}>
      <div className="cs-row" style={{ gap: 12 }}>
        <button
          type="button"
          className="cs-avatar-edit"
          aria-label={t('Group cover')}
          onClick={async () => {
            const [f] = await pickFiles('image/*');
            if (f) set({ avatar: await uploadImage('avatars', f, f.name) });
          }}
        >
          <Avatar src={g.avatar} name={g.name} palette={4} size={64} ring />
        </button>
        <input className="cs-input cs-input--title cs-grow" value={g.name} onChange={(e) => set({ name: e.target.value })} aria-label={t('Group name')} />
      </div>
      <span className="cs-label">{t('Members · click to add or remove')}</span>
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
                  {muted ? t('muted') : t('active')}
                </button>
              ) : null}
              <button type="button" className={`cs-icon-btn cs-icon-btn--xs${inGroup ? ' cs-icon-btn--active' : ''}`} aria-label={inGroup ? t('Remove') : t('Add')} onClick={() => toggle(c.id)}>
                <Icon name={inGroup ? 'check' : 'plus'} size={14} stroke={2.4} />
              </button>
            </div>
          );
        })}
      </div>
      <Field label={t('Who replies')}>
        <Choices<GroupActivation>
          small
          value={g.activation}
          onChange={(activation) => set({ activation })}
          items={[
            { id: 'natural', label: t('Natural') },
            { id: 'list', label: t('In turn') },
            { id: 'pooled', label: t('Whoever was quiet') },
            { id: 'manual', label: t('Manually') },
          ]}
        />
      </Field>
      <Field label={t('Cards in the prompt')}>
        <Choices<'swap' | 'append'>
          small
          value={g.generationMode}
          onChange={(generationMode) => set({ generationMode })}
          items={[
            { id: 'swap', label: t('Only the speaker') },
            { id: 'append', label: t('All members') },
          ]}
        />
      </Field>
      <Check checked={g.allowSelfResponses} onChange={(allowSelfResponses) => set({ allowSelfResponses })}>
        {t('Can reply to themselves')}
      </Check>
      <Check checked={g.autoMode} onChange={(autoMode) => set({ autoMode })}>
        {t('Automatic mode (characters talk on their own)')}
      </Check>
      <Field label={t('Group scenario')} hint={t('Replaces the card scenarios in the group chat.')}>
        <textarea className="cs-textarea" rows={3} value={g.scenario} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <div className="cs-row cs-row--wrap">
        <button type="button" className="cs-btn cs-btn--primary cs-btn--flex" disabled={!g.memberIds.length} onClick={() => openGroup(g.id)}>
          {t('Open the chat')}
        </button>
        <button type="button" className="cs-btn cs-btn--flex" disabled={!g.memberIds.length} onClick={() => startNewChat('group', g.id).then(() => navigate('chat'))}>
          {t('New chat')}
        </button>
        <button
          type="button"
          className="cs-btn cs-btn--danger"
          onClick={async () => {
            if (await confirmDialog(t('Delete the group “{name}” and its chats?', { name: g.name }), { ok: t('Delete') })) {
              await removeItem('groups', g.id, true);
              toast(t('Group deleted'));
            }
          }}
        >
          {t('Delete')}
        </button>
      </div>
    </aside>
  );
}
