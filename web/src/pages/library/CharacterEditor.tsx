import { useState } from 'react';
import { useStore, upsert, toastError, navigate } from '../../lib/store';
import { Modal, Field, Tabs, TagInput, Avatar, RangeField, Check, openMenu } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { Character, Role } from '../../lib/types';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, pickFiles, PALETTES, toKana } from '../../lib/utils';
import { exportCharacter, uploadImage, duplicateCharacter, deleteCharacter } from '../../lib/appActions';
import { newLorebook } from '../../lib/defaults';

type Tab = 'main' | 'defs' | 'greet' | 'examples' | 'prompts' | 'links' | 'sprites' | 'notes';

const EMOTIONS = ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'fear', 'love', 'embarrassment', 'curiosity', 'disgust'];
const EMOTION_RU: Record<string, string> = {
  neutral: 'нейтрально',
  joy: 'радость',
  sadness: 'грусть',
  anger: 'злость',
  surprise: 'удивление',
  fear: 'страх',
  love: 'нежность',
  embarrassment: 'смущение',
  curiosity: 'любопытство',
  disgust: 'отвращение',
};

function Tok({ text }: { text: string }) {
  return <span className="cs-pill cs-pill--mono">{fmtNum(countTokens(text))} ток.</span>;
}

export function CharacterEditor({ character, onClose }: { character: Character; onClose: () => void }) {
  const c = useStore((s) => s.characters.find((x) => x.id === character.id)) || character;
  const worlds = useStore((s) => s.worlds);
  const presets = useStore((s) => s.presets);
  const [tab, setTab] = useState<Tab>('main');
  const set = (patch: Partial<Character>) => upsert('characters', { ...c, ...patch });

  const changeAvatar = async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    try {
      set({ avatar: await uploadImage('avatars', f, f.name) });
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <Modal title={c.name || 'Персонаж'} kana={c.kana || toKana(c.name)} size="wide" onClose={onClose}>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: 'main', label: 'Основное' },
          { id: 'defs', label: 'Описание' },
          { id: 'greet', label: 'Приветствия' },
          { id: 'examples', label: 'Примеры' },
          { id: 'prompts', label: 'Промпты' },
          { id: 'links', label: 'Связи' },
          { id: 'sprites', label: 'Спрайты' },
          { id: 'notes', label: 'Заметки' },
        ]}
      />

      {tab === 'main' ? (
        <div className="cs-stack-gap">
          <div className="cs-row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button type="button" className="cs-avatar-edit" onClick={changeAvatar} aria-label="Сменить аватар">
              <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={110} ring />
            </button>
            <div className="cs-grid-fields cs-grow" style={{ minWidth: 260 }}>
              <Field label="Имя">
                <input className="cs-input cs-input--title" value={c.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Подпись" hint="Курсивом рядом с именем, например «night barista»">
                <input className="cs-input" value={c.tagline} onChange={(e) => set({ tagline: e.target.value })} />
              </Field>
              <Field label="Кана для обложки">
                <input className="cs-input" value={c.kana} placeholder={toKana(c.name)} onChange={(e) => set({ kana: e.target.value })} />
              </Field>
              <Field label="Цвет обложки">
                <div className="cs-row">
                  {PALETTES.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Палитра ${i + 1}`}
                      aria-pressed={c.palette === i}
                      onClick={() => set({ palette: i })}
                      style={{ width: 34, height: 34, borderRadius: 12, border: c.palette === i ? '3px solid var(--cs-accent)' : '3px solid transparent', background: p.bg }}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </div>
          <div className="cs-row cs-row--wrap">
            <button type="button" className="cs-btn cs-btn--sm" onClick={changeAvatar}>
              <Icon name="images" size={16} /> Загрузить аватар
            </button>
            {c.avatar ? (
              <button type="button" className="cs-btn cs-btn--sm" onClick={() => set({ avatar: '' })}>
                Убрать аватар
              </button>
            ) : null}
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => navigate('images', `portrait:${c.id}`)}>
              <Icon name="sparkle" size={14} /> Нарисовать портрет
            </button>
          </div>
          <Field label="Теги">
            <TagInput value={c.tags} onChange={(tags) => set({ tags })} placeholder="+ тег" mono={false} />
          </Field>
          <div className="cs-grid-fields">
            <Field label="Автор">
              <input className="cs-input" value={c.creator} onChange={(e) => set({ creator: e.target.value })} />
            </Field>
            <Field label="Версия карточки">
              <input className="cs-input" value={c.characterVersion} onChange={(e) => set({ characterVersion: e.target.value })} />
            </Field>
            <Field label="Прозвище (nickname)">
              <input className="cs-input" value={c.nickname} onChange={(e) => set({ nickname: e.target.value })} />
            </Field>
          </div>
          <RangeField label="Разговорчивость в группах" value={c.talkativeness} min={0} max={1} step={0.05} onChange={(v) => set({ talkativeness: v })} />
          <Check checked={c.fav} onChange={(fav) => set({ fav })}>
            В избранном
          </Check>
        </div>
      ) : null}

      {tab === 'defs' ? (
        <div className="cs-stack-gap">
          <Field label={<>Описание · <Tok text={c.description} /></>} hint="Внешность, биография, манеры. Макросы {{char}} и {{user}} подставляются.">
            <textarea className="cs-textarea cs-textarea--lg" rows={10} value={c.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label={<>Характер · <Tok text={c.personality} /></>}>
            <textarea className="cs-textarea" rows={3} value={c.personality} onChange={(e) => set({ personality: e.target.value })} />
          </Field>
          <Field label={<>Сценарий · <Tok text={c.scenario} /></>}>
            <textarea className="cs-textarea" rows={3} value={c.scenario} onChange={(e) => set({ scenario: e.target.value })} />
          </Field>
        </div>
      ) : null}

      {tab === 'greet' ? (
        <div className="cs-stack-gap">
          <Field label="Первое сообщение">
            <textarea className="cs-textarea cs-textarea--lg" rows={6} value={c.firstMessage} onChange={(e) => set({ firstMessage: e.target.value })} />
          </Field>
          <span className="cs-label">Альтернативные приветствия · листаются свайпом в начале чата</span>
          {c.alternateGreetings.map((g, i) => (
            <div key={i} className="cs-greeting">
              <textarea
                className="cs-textarea cs-grow"
                rows={4}
                value={g}
                onChange={(e) => set({ alternateGreetings: c.alternateGreetings.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Удалить приветствие" onClick={() => set({ alternateGreetings: c.alternateGreetings.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="cs-btn cs-btn--dashed" onClick={() => set({ alternateGreetings: [...c.alternateGreetings, ''] })}>
            + приветствие
          </button>
          <span className="cs-label">Только для групповых чатов</span>
          {c.groupGreetings.map((g, i) => (
            <div key={i} className="cs-greeting">
              <textarea className="cs-textarea cs-grow" rows={3} value={g} onChange={(e) => set({ groupGreetings: c.groupGreetings.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Удалить" onClick={() => set({ groupGreetings: c.groupGreetings.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => set({ groupGreetings: [...c.groupGreetings, ''] })}>
            + групповое приветствие
          </button>
        </div>
      ) : null}

      {tab === 'examples' ? (
        <Field
          label={<>Примеры диалогов · <Tok text={c.exampleMessages} /></>}
          hint="Каждый пример начинается с <START>. Формат: {{user}}: … / {{char}}: …"
        >
          <textarea className="cs-textarea cs-textarea--mono" rows={16} value={c.exampleMessages} onChange={(e) => set({ exampleMessages: e.target.value })} />
        </Field>
      ) : null}

      {tab === 'prompts' ? (
        <div className="cs-stack-gap">
          <Field label="Основной промпт персонажа" hint="Заменяет «Основной промпт» пресета. {{original}} — вставить исходный.">
            <textarea className="cs-textarea" rows={5} value={c.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
          </Field>
          <Field label="Пост-инструкция персонажа" hint="Заменяет «Пост-инструкцию» пресета. {{original}} — вставить исходную.">
            <textarea className="cs-textarea" rows={4} value={c.postHistoryInstructions} onChange={(e) => set({ postHistoryInstructions: e.target.value })} />
          </Field>
          <div className="cs-honey-box">
            <span className="cs-label cs-label--honey">Заметка персонажа (на глубине)</span>
            <textarea className="cs-textarea" rows={3} value={c.depthPrompt.prompt} onChange={(e) => set({ depthPrompt: { ...c.depthPrompt, prompt: e.target.value } })} />
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label="Глубина" honey>
                <input className="cs-input" type="number" min={0} value={c.depthPrompt.depth} onChange={(e) => set({ depthPrompt: { ...c.depthPrompt, depth: Math.max(0, Number(e.target.value)) } })} />
              </Field>
              <Field label="Роль" honey>
                <select className="cs-select" value={c.depthPrompt.role} onChange={(e) => set({ depthPrompt: { ...c.depthPrompt, role: e.target.value as Role } })}>
                  <option value="system">system</option>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                </select>
              </Field>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'links' ? (
        <div className="cs-stack-gap">
          <span className="cs-label">Лорбуки персонажа</span>
          <div className="cs-chips">
            {worlds.map((w) => (
              <button
                key={w.id}
                type="button"
                className="cs-choice cs-choice--sm"
                aria-pressed={c.worldIds.includes(w.id)}
                onClick={() => set({ worldIds: c.worldIds.includes(w.id) ? c.worldIds.filter((x) => x !== w.id) : [...c.worldIds, w.id] })}
              >
                {w.name}
              </button>
            ))}
            <button
              type="button"
              className="cs-btn cs-btn--dashed cs-btn--sm"
              onClick={() => {
                const b = upsert('worlds', newLorebook({ name: `${c.name} · лорбук` }));
                set({ worldIds: [...c.worldIds, b.id] });
                navigate('library', `lore:${b.id}`);
              }}
            >
              + новый лорбук
            </button>
          </div>
          <p className="cs-hint">Первый привязанный лорбук встраивается в карточку при экспорте (character_book).</p>
          <Field label="Пресет при открытии чата">
            <select className="cs-select" value={c.presetId} onChange={(e) => set({ presetId: e.target.value })}>
              <option value="">— не менять —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('regex', `char:${c.id}`)}>
            <Icon name="regex" size={16} /> Регексы этого персонажа
          </button>
        </div>
      ) : null}

      {tab === 'sprites' ? (
        <div className="cs-stack-gap">
          <p className="cs-hint">Спрайты эмоций для модуля «Выражения» и вида «Визуальная новелла». «neutral» используется по умолчанию.</p>
          <div className="cs-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {EMOTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="cs-tile"
                style={{ aspectRatio: '3 / 4' }}
                onClick={async () => {
                  const [f] = await pickFiles('image/*');
                  if (f) set({ sprites: { ...c.sprites, [e]: await uploadImage('sprites', f, f.name) } });
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  if (c.sprites[e]) openMenu(ev, [{ label: 'Убрать спрайт', icon: 'trash', danger: true, onClick: () => { const s = { ...c.sprites }; delete s[e]; set({ sprites: s }); } }]);
                }}
              >
                {c.sprites[e] ? <img src={c.sprites[e]} alt={e} /> : null}
                <span className="cs-tile__label">{EMOTION_RU[e]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'notes' ? (
        <Field label="Заметки автора карточки" hint="Не отправляются модели.">
          <textarea className="cs-textarea" rows={10} value={c.creatorNotes} onChange={(e) => set({ creatorNotes: e.target.value })} />
        </Field>
      ) : null}

      <div className="cs-modal-foot" style={{ justifyContent: 'space-between' }}>
        <div className="cs-row cs-row--wrap">
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportCharacter(c, 'png').catch((err) => toastError(err))}>
            Экспорт PNG
          </button>
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportCharacter(c, 'json')}>
            JSON
          </button>
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => duplicateCharacter(c)}>
            Дублировать
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--sm cs-btn--danger"
            onClick={async () => {
              if (await deleteCharacter(c)) onClose();
            }}
          >
            Удалить
          </button>
        </div>
        <button type="button" className="cs-btn cs-btn--primary" onClick={onClose}>
          Готово
        </button>
      </div>
    </Modal>
  );
}
