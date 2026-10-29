import { useEffect, useMemo, useState } from 'react';
import { useStore, upsert, navigate, updateSettings, patchItem, toastError } from '../../lib/store';
import { Avatar, Field, openMenu, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newCharacter, newGroup, newPersona } from '../../lib/defaults';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, paletteFor, toKana } from '../../lib/utils';
import { openCharacter, openGroup, startNewChat } from '../../lib/generate';
import { deleteCharacter, duplicateCharacter, exportCharacter } from '../../lib/appActions';
import { CharacterEditor } from './CharacterEditor';
import { GroupEditor } from './GroupEditor';
import type { Character, Group } from '../../lib/types';
import { locale, t, tn } from '../../lib/i18n';

export function charTokens(c: Character) {
  return countTokens([c.description, c.personality, c.scenario, c.exampleMessages, c.systemPrompt, c.postHistoryInstructions].join('\n'));
}

function CharCard({ c, selected, onSelect }: { c: Character; selected: boolean; onSelect: () => void }) {
  const p = paletteFor(c.palette, c.name);
  const tokens = useMemo(() => charTokens(c), [c]);
  return (
    <button
      type="button"
      className="cs-char-card"
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={() => openCharacter(c.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, [
          { label: t('Start a chat'), icon: 'chat', onClick: () => openCharacter(c.id) },
          { label: t('New chat'), icon: 'plus', onClick: () => startNewChat('character', c.id).then(() => navigate('chat')) },
          { label: c.fav ? t('Remove from favorites') : t('Add to favorites'), icon: 'star', onClick: () => patchItem('characters', c.id, { fav: !c.fav }) },
          { label: t('Export PNG'), icon: 'upload', onClick: () => exportCharacter(c, 'png').catch((err) => toastError(err)) },
          { label: t('Export JSON'), icon: 'upload', onClick: () => exportCharacter(c, 'json') },
          { label: t('Duplicate'), icon: 'copy', onClick: () => duplicateCharacter(c) },
          { separator: true, label: '' },
          { label: t('Delete'), icon: 'trash', danger: true, onClick: () => deleteCharacter(c) },
        ]);
      }}
    >
      <div className="cs-char-card__art" style={{ background: p.bg }}>
        <div className="cs-char-card__kana" aria-hidden="true">
          {c.kana || toKana(c.name)}
        </div>
        {c.avatar ? <img src={c.avatar} alt="" loading="lazy" /> : <span className="cs-char-card__badge">{t('[avatar]')}</span>}
        {c.fav ? (
          <span className="cs-char-card__fav" aria-label={t('Favorites')}>
            <Icon name="starFill" size={16} />
          </span>
        ) : null}
      </div>
      <div className="cs-char-card__info">
        <span className="cs-char-card__name cs-ellipsis">{c.name}</span>
        <span className="cs-char-card__tagline cs-ellipsis">{c.tagline}</span>
        <span className="cs-char-card__meta">
          <span className="cs-ellipsis">{c.tags.slice(0, 2).join(' · ') || t('no tags')}</span>
          <span>{fmtNum(tokens)}</span>
        </span>
      </div>
    </button>
  );
}

function GroupCard({ g, selected, onSelect }: { g: Group; selected: boolean; onSelect: () => void }) {
  const characters = useStore((s) => s.characters);
  const members = g.memberIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean) as Character[];
  return (
    <button type="button" className="cs-char-card" aria-pressed={selected} onClick={onSelect} onDoubleClick={() => openGroup(g.id)}>
      <div className="cs-char-card__art" style={{ background: 'linear-gradient(160deg, #F0E6FB, #FFC2D8)' }}>
        <div className="cs-group-collage">
          {members.slice(0, 4).map((m) => (
            <Avatar key={m.id} src={m.avatar} name={m.name} kana={m.kana} palette={m.palette} size={100} />
          ))}
        </div>
        <span className="cs-char-card__badge">{t('group')}</span>
      </div>
      <div className="cs-char-card__info">
        <span className="cs-char-card__name cs-ellipsis">{g.name}</span>
        <span className="cs-char-card__tagline cs-ellipsis">{members.map((m) => m.name).join(', ') || t('empty so far')}</span>
        <span className="cs-char-card__meta">
          <span>
            {members.length} {tn(members.length, 'member|members')}
          </span>
          <span>{g.activation === 'manual' ? t('manual') : g.activation === 'list' ? t('by list') : t('natural')}</span>
        </span>
      </div>
    </button>
  );
}

function CharacterAside({ c }: { c: Character }) {
  const worlds = useStore((s) => s.worlds);
  const presets = useStore((s) => s.presets);
  const regex = useStore((s) => s.regex);
  const [full, setFull] = useState(false);
  const tokens = useMemo(() => charTokens(c), [c]);
  const greetings = [c.firstMessage, ...c.alternateGreetings].filter((g) => g.trim()).length;
  const set = (patch: Partial<Character>) => upsert('characters', { ...c, ...patch });
  const scoped = regex.filter((r) => r.scope.type === 'character' && r.scope.id === c.id);
  const preset = presets.find((p) => p.id === c.presetId);
  return (
    <aside className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-side" aria-label={t('Character card')} style={{ flex: '1 1 360px' }}>
      <div className="cs-row" style={{ gap: 12 }}>
        <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={64} ring />
        <div className="cs-grow">
          <h2 className="cs-h2" style={{ fontSize: 20 }}>
            {c.name}
          </h2>
          <div className="cs-sub">
            {t('V2 card · {tokens} tok. · {greetings} {x}', { tokens: fmtNum(tokens), greetings, x: tn(greetings, 'greeting|greetings') })}
          </div>
        </div>
        <button
          type="button"
          className="cs-icon-btn cs-icon-btn--soft"
          aria-label={t('Actions')}
          onClick={(e) =>
            openMenu(e.currentTarget, [
              { label: t('Export PNG'), icon: 'upload', onClick: () => exportCharacter(c, 'png').catch((err) => toastError(err)) },
              { label: t('Export JSON'), icon: 'upload', onClick: () => exportCharacter(c, 'json') },
              { label: t('Duplicate'), icon: 'copy', onClick: () => duplicateCharacter(c) },
              { label: c.fav ? t('Remove from favorites') : t('Add to favorites'), icon: 'star', onClick: () => set({ fav: !c.fav }) },
              { label: t('New chat'), icon: 'plus', onClick: () => startNewChat('character', c.id).then(() => navigate('chat')) },
              { separator: true, label: '' },
              { label: t('Delete'), icon: 'trash', danger: true, onClick: () => deleteCharacter(c) },
            ])
          }
        >
          <Icon name="dots" size={18} />
        </button>
      </div>
      <Field label={t('Description')}>
        <textarea className="cs-textarea" rows={4} value={c.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label={t('Scenario')}>
        <textarea className="cs-textarea" rows={2} value={c.scenario} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <div className="cs-col" style={{ gap: 6 }}>
        <span className="cs-label">{t('Linked')}</span>
        <div className="cs-linked">
          {c.worldIds.map((id) => {
            const w = worlds.find((x) => x.id === id);
            return w ? (
              <button key={id} type="button" className="cs-pill cs-pill--lilac cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('library', `lore:${id}`)}>
                {t('Lorebook · {name}', { name: w.name })}
              </button>
            ) : null;
          })}
          {scoped.map((r) => (
            <button key={r.id} type="button" className="cs-pill cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('regex', r.id)}>
              {t('Regex · {name}', { name: r.name })}
            </button>
          ))}
          {preset ? (
            <button type="button" className="cs-pill cs-pill--mint cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('presets')}>
              {t('Preset · {name}', { name: preset.name })}
            </button>
          ) : null}
          {!c.worldIds.length && !scoped.length && !preset ? <span className="cs-hint">{t('Nothing: link a lorebook or a preset in “All fields”')}</span> : null}
        </div>
      </div>
      <div className="cs-row cs-row--wrap" style={{ marginTop: 4 }}>
        <button type="button" className="cs-btn cs-btn--primary cs-btn--flex" onClick={() => openCharacter(c.id)}>
          {t('Start a chat')}
        </button>
        <button type="button" className="cs-btn cs-btn--flex" onClick={() => setFull(true)}>
          {t('All fields')}
        </button>
      </div>
      {full ? <CharacterEditor character={c} onClose={() => setFull(false)} /> : null}
    </aside>
  );
}

export function PersonasStrip() {
  const personas = useStore((s) => s.personas);
  const active = useStore((s) => s.settings.activePersonaId);
  return (
    <section className="cs-panel cs-panel--flat" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <h2 className="cs-h2" style={{ fontSize: 17, marginRight: 8 }}>
        {t('My personas')}
      </h2>
      {personas.map((p) => (
        <button
          key={p.id}
          type="button"
          className="cs-persona-chip"
          aria-pressed={p.id === active}
          onClick={() => updateSettings({ activePersonaId: p.id })}
          onDoubleClick={() => navigate('library', `persona:${p.id}`)}
        >
          <Avatar src={p.avatar} name={p.name} kana={p.kana} palette={p.palette} size={36} />
          {p.name}
          {p.id === active ? t(' · active') : ''}
        </button>
      ))}
      <button
        type="button"
        className="cs-icon-btn cs-icon-btn--dashed"
        style={{ width: 48, height: 48 }}
        aria-label={t('Add a persona')}
        onClick={() => {
          const p = upsert('personas', newPersona({ name: t('New persona') }));
          navigate('library', `persona:${p.id}`);
        }}
      >
        <Icon name="plus" size={20} stroke={2} />
      </button>
    </section>
  );
}

type Filter = 'all' | 'fav' | 'groups' | `tag:${string}`;

export function CharactersTab({ query }: { query: string }) {
  const characters = useStore((s) => s.characters);
  const groups = useStore((s) => s.groups);
  const param = useStore((s) => s.routeParam);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'tokens'>('recent');
  const [selected, setSelected] = useState<string>(() => param.replace(/^(char|group):/, '') || characters[0]?.id || '');

  useEffect(() => {
    const m = /^(char|group):(.+)$/.exec(param);
    if (m) setSelected(m[2]);
  }, [param]);

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of characters) for (const tag of c.tags) count.set(tag, (count.get(tag) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
  }, [characters]);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    let out = characters.filter((c) => !q || [c.name, c.tagline, c.creator, ...c.tags].join(' ').toLowerCase().includes(q));
    if (filter === 'fav') out = out.filter((c) => c.fav);
    if (filter === 'groups') out = [];
    if (filter.startsWith('tag:')) out = out.filter((c) => c.tags.includes(filter.slice(4)));
    out = [...out].sort((a, b) => {
      if (a.fav !== b.fav) return a.fav ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name, locale());
      if (sort === 'tokens') return charTokens(b) - charTokens(a);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return out;
  }, [characters, q, filter, sort]);
  const groupList = filter === 'all' || filter === 'groups' ? groups.filter((g) => !q || g.name.toLowerCase().includes(q)) : [];

  const selChar = characters.find((c) => c.id === selected);
  const selGroup = groups.find((g) => g.id === selected);

  return (
    <div className="cs-columns">
      <div className="cs-col-main cs-stack-gap" style={{ flex: '999 1 520px' }}>
        <div className="cs-row cs-row--wrap">
          <div className="cs-chips">
            {(
              [
                ['all', t('All')],
                ['fav', t('Favorites')],
                ['groups', t('Groups · {n}', { n: groups.length })],
                ...tags.map((tagName) => [`tag:${tagName}`, `#${tagName}`]),
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className="cs-choice cs-choice--sm" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? 'all' : id)}>
                {label}
              </button>
            ))}
          </div>
          <select className="cs-select cs-select--sm cs-ml-auto" style={{ width: 170 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('Sorting')}>
            <option value="recent">{t('Recent')}</option>
            <option value="name">{t('By name')}</option>
            <option value="tokens">{t('By size')}</option>
          </select>
        </div>
        <div className="cs-card-grid">
          {groupList.map((g) => (
            <GroupCard key={g.id} g={g} selected={selected === g.id} onSelect={() => setSelected(g.id)} />
          ))}
          {list.map((c) => (
            <CharCard key={c.id} c={c} selected={selected === c.id} onSelect={() => setSelected(c.id)} />
          ))}
          {filter !== 'groups' ? (
            <button
              type="button"
              className="cs-new-card"
              onClick={() => {
                const c = upsert('characters', newCharacter({ name: t('New character') }));
                setSelected(c.id);
              }}
            >
              <Icon name="plus" size={32} />
              {t('New character')}
              <span>{t('by hand or from an instruction')}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="cs-new-card"
            onClick={() => {
              const g = upsert('groups', newGroup({ name: t('New group'), memberIds: characters.slice(0, 2).map((c) => c.id) }));
              setSelected(g.id);
            }}
          >
            <Icon name="group" size={32} />
            {t('New group')}
            <span>{t('a group chat with several characters')}</span>
          </button>
        </div>
        {!list.length && !groupList.length && q ? <Empty icon="search" title={t('Nobody found')} /> : null}
        <PersonasStrip />
      </div>
      {selChar ? <CharacterAside key={selChar.id} c={selChar} /> : selGroup ? <GroupEditor key={selGroup.id} group={selGroup} /> : null}
    </div>
  );
}
