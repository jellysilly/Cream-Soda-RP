import { useEffect, useMemo, useState } from 'react';
import { useStore, upsert, navigate, updateSettings, patchItem, toastError } from '../../lib/store';
import { Avatar, Field, openMenu, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { newCharacter, newGroup, newPersona } from '../../lib/defaults';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, paletteFor, plural, toKana } from '../../lib/utils';
import { openCharacter, openGroup, startNewChat } from '../../lib/generate';
import { deleteCharacter, duplicateCharacter, exportCharacter } from '../../lib/appActions';
import { CharacterEditor } from './CharacterEditor';
import { GroupEditor } from './GroupEditor';
import type { Character, Group } from '../../lib/types';

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
          { label: 'Начать чат', icon: 'chat', onClick: () => openCharacter(c.id) },
          { label: 'Новый чат', icon: 'plus', onClick: () => startNewChat('character', c.id).then(() => navigate('chat')) },
          { label: c.fav ? 'Убрать из избранного' : 'В избранное', icon: 'star', onClick: () => patchItem('characters', c.id, { fav: !c.fav }) },
          { label: 'Экспорт PNG', icon: 'upload', onClick: () => exportCharacter(c, 'png').catch((err) => toastError(err)) },
          { label: 'Экспорт JSON', icon: 'upload', onClick: () => exportCharacter(c, 'json') },
          { label: 'Дублировать', icon: 'copy', onClick: () => duplicateCharacter(c) },
          { separator: true, label: '' },
          { label: 'Удалить', icon: 'trash', danger: true, onClick: () => deleteCharacter(c) },
        ]);
      }}
    >
      <div className="cs-char-card__art" style={{ background: p.bg }}>
        <div className="cs-char-card__kana" aria-hidden="true">
          {c.kana || toKana(c.name)}
        </div>
        {c.avatar ? <img src={c.avatar} alt="" loading="lazy" /> : <span className="cs-char-card__badge">[аватар]</span>}
        {c.fav ? (
          <span className="cs-char-card__fav" aria-label="Избранное">
            <Icon name="starFill" size={16} />
          </span>
        ) : null}
      </div>
      <div className="cs-char-card__info">
        <span className="cs-char-card__name cs-ellipsis">{c.name}</span>
        <span className="cs-char-card__tagline cs-ellipsis">{c.tagline}</span>
        <span className="cs-char-card__meta">
          <span className="cs-ellipsis">{c.tags.slice(0, 2).join(' · ') || 'без тегов'}</span>
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
        <span className="cs-char-card__badge">группа</span>
      </div>
      <div className="cs-char-card__info">
        <span className="cs-char-card__name cs-ellipsis">{g.name}</span>
        <span className="cs-char-card__tagline cs-ellipsis">{members.map((m) => m.name).join(', ') || 'пока пусто'}</span>
        <span className="cs-char-card__meta">
          <span>
            {members.length} {plural(members.length, 'участник', 'участника', 'участников')}
          </span>
          <span>{g.activation === 'manual' ? 'вручную' : g.activation === 'list' ? 'по списку' : 'естественно'}</span>
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
    <aside className="cs-panel cs-panel--strong cs-panel--pad-lg cs-col-side" aria-label="Карточка персонажа" style={{ flex: '1 1 360px' }}>
      <div className="cs-row" style={{ gap: 12 }}>
        <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={64} ring />
        <div className="cs-grow">
          <h2 className="cs-h2" style={{ fontSize: 20 }}>
            {c.name}
          </h2>
          <div className="cs-sub">
            V2-карточка · {fmtNum(tokens)} ток. · {greetings} {plural(greetings, 'приветствие', 'приветствия', 'приветствий')}
          </div>
        </div>
        <button
          type="button"
          className="cs-icon-btn cs-icon-btn--soft"
          aria-label="Действия"
          onClick={(e) =>
            openMenu(e.currentTarget, [
              { label: 'Экспорт PNG', icon: 'upload', onClick: () => exportCharacter(c, 'png').catch((err) => toastError(err)) },
              { label: 'Экспорт JSON', icon: 'upload', onClick: () => exportCharacter(c, 'json') },
              { label: 'Дублировать', icon: 'copy', onClick: () => duplicateCharacter(c) },
              { label: c.fav ? 'Убрать из избранного' : 'В избранное', icon: 'star', onClick: () => set({ fav: !c.fav }) },
              { label: 'Новый чат', icon: 'plus', onClick: () => startNewChat('character', c.id).then(() => navigate('chat')) },
              { separator: true, label: '' },
              { label: 'Удалить', icon: 'trash', danger: true, onClick: () => deleteCharacter(c) },
            ])
          }
        >
          <Icon name="dots" size={18} />
        </button>
      </div>
      <Field label="Описание">
        <textarea className="cs-textarea" rows={4} value={c.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Сценарий">
        <textarea className="cs-textarea" rows={2} value={c.scenario} onChange={(e) => set({ scenario: e.target.value })} />
      </Field>
      <div className="cs-col" style={{ gap: 6 }}>
        <span className="cs-label">Привязано</span>
        <div className="cs-linked">
          {c.worldIds.map((id) => {
            const w = worlds.find((x) => x.id === id);
            return w ? (
              <button key={id} type="button" className="cs-pill cs-pill--lilac cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('library', `lore:${id}`)}>
                Лорбук · {w.name}
              </button>
            ) : null;
          })}
          {scoped.map((r) => (
            <button key={r.id} type="button" className="cs-pill cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('regex', r.id)}>
              Регекс · {r.name}
            </button>
          ))}
          {preset ? (
            <button type="button" className="cs-pill cs-pill--mint cs-pill--lg" style={{ border: 'none' }} onClick={() => navigate('presets')}>
              Пресет · {preset.name}
            </button>
          ) : null}
          {!c.worldIds.length && !scoped.length && !preset ? <span className="cs-hint">Ничего — привяжи лорбук или пресет в «Все поля»</span> : null}
        </div>
      </div>
      <div className="cs-row cs-row--wrap" style={{ marginTop: 4 }}>
        <button type="button" className="cs-btn cs-btn--primary cs-btn--flex" onClick={() => openCharacter(c.id)}>
          Начать чат
        </button>
        <button type="button" className="cs-btn cs-btn--flex" onClick={() => setFull(true)}>
          Все поля
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
        Мои персоны
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
          {p.id === active ? ' · активна' : ''}
        </button>
      ))}
      <button
        type="button"
        className="cs-icon-btn cs-icon-btn--dashed"
        style={{ width: 48, height: 48 }}
        aria-label="Добавить персону"
        onClick={() => {
          const p = upsert('personas', newPersona({ name: 'Новая персона' }));
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
    for (const c of characters) for (const t of c.tags) count.set(t, (count.get(t) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [characters]);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    let out = characters.filter((c) => !q || [c.name, c.tagline, c.creator, ...c.tags].join(' ').toLowerCase().includes(q));
    if (filter === 'fav') out = out.filter((c) => c.fav);
    if (filter === 'groups') out = [];
    if (filter.startsWith('tag:')) out = out.filter((c) => c.tags.includes(filter.slice(4)));
    out = [...out].sort((a, b) => {
      if (a.fav !== b.fav) return a.fav ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
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
                ['all', 'Все'],
                ['fav', 'Избранные'],
                ['groups', `Группы · ${groups.length}`],
                ...tags.map((t) => [`tag:${t}`, `#${t}`]),
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className="cs-choice cs-choice--sm" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? 'all' : id)}>
                {label}
              </button>
            ))}
          </div>
          <select className="cs-select cs-select--sm cs-ml-auto" style={{ width: 170 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Сортировка">
            <option value="recent">Недавние</option>
            <option value="name">По имени</option>
            <option value="tokens">По размеру</option>
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
                const c = upsert('characters', newCharacter({ name: 'Новый персонаж' }));
                setSelected(c.id);
              }}
            >
              <Icon name="plus" size={32} />
              Новый персонаж
              <span>вручную или по инструкции</span>
            </button>
          ) : null}
          <button
            type="button"
            className="cs-new-card"
            onClick={() => {
              const g = upsert('groups', newGroup({ name: 'Новая группа', memberIds: characters.slice(0, 2).map((c) => c.id) }));
              setSelected(g.id);
            }}
          >
            <Icon name="group" size={32} />
            Новая группа
            <span>групповой чат с несколькими персонажами</span>
          </button>
        </div>
        {!list.length && !groupList.length && q ? <Empty icon="search" title="Никого не нашли" /> : null}
        <PersonasStrip />
      </div>
      {selChar ? <CharacterAside key={selChar.id} c={selChar} /> : selGroup ? <GroupEditor key={selGroup.id} group={selGroup} /> : null}
    </div>
  );
}
