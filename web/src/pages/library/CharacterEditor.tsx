import { useState } from 'react';
import { useStore, upsert, toastError, navigate } from '../../lib/store';
import { Modal, Field, Tabs, TagInput, Avatar, RangeField, Check, openMenu } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { Character, Role } from '../../lib/types';
import { countTokens } from '../../lib/tokenizer';
import { fmtNum, pickFiles, PALETTES, toKana } from '../../lib/utils';
import { exportCharacter, uploadImage, duplicateCharacter, deleteCharacter } from '../../lib/appActions';
import { newLorebook } from '../../lib/defaults';
import { t } from '../../lib/i18n';

type Tab = 'main' | 'defs' | 'greet' | 'examples' | 'prompts' | 'links' | 'sprites' | 'notes';

const EMOTIONS = ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'fear', 'love', 'embarrassment', 'curiosity', 'disgust'];
const EMOTION_LABELS: Record<string, string> = {
  neutral: t('neutral'),
  joy: t('joy'),
  sadness: t('sadness'),
  anger: t('anger'),
  surprise: t('surprise'),
  fear: t('fear'),
  love: t('tenderness'),
  embarrassment: t('embarrassment'),
  curiosity: t('curiosity'),
  disgust: t('disgust'),
};

function Tok({ text }: { text: string }) {
  return <span className="cs-pill cs-pill--mono">{fmtNum(countTokens(text))} {t('tok.')}</span>;
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
    <Modal title={c.name || t('Character')} kana={c.kana || toKana(c.name)} size="wide" onClose={onClose}>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: 'main', label: t('Basics') },
          { id: 'defs', label: t('Description') },
          { id: 'greet', label: t('Greetings') },
          { id: 'examples', label: t('Examples') },
          { id: 'prompts', label: t('Prompts') },
          { id: 'links', label: t('Links') },
          { id: 'sprites', label: t('Sprites') },
          { id: 'notes', label: t('Notes') },
        ]}
      />

      {tab === 'main' ? (
        <div className="cs-stack-gap">
          <div className="cs-row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button type="button" className="cs-avatar-edit" onClick={changeAvatar} aria-label={t('Change the avatar')}>
              <Avatar src={c.avatar} name={c.name} kana={c.kana} palette={c.palette} size={110} ring />
            </button>
            <div className="cs-grid-fields cs-grow" style={{ minWidth: 260 }}>
              <Field label={t('Name')}>
                <input className="cs-input cs-input--title" value={c.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('Tagline')} hint={t('In italics next to the name, e.g. “night barista”')}>
                <input className="cs-input" value={c.tagline} onChange={(e) => set({ tagline: e.target.value })} />
              </Field>
              <Field label={t('Kana for the cover')}>
                <input className="cs-input" value={c.kana} placeholder={toKana(c.name)} onChange={(e) => set({ kana: e.target.value })} />
              </Field>
              <Field label={t('Cover color')}>
                <div className="cs-row">
                  {PALETTES.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={t('Palette {i}', { i: i + 1 })}
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
              <Icon name="images" size={16} /> {t('Upload an avatar')}
            </button>
            {c.avatar ? (
              <button type="button" className="cs-btn cs-btn--sm" onClick={() => set({ avatar: '' })}>
                {t('Remove the avatar')}
              </button>
            ) : null}
            <button type="button" className="cs-btn cs-btn--sm" onClick={() => navigate('images', `portrait:${c.id}`)}>
              <Icon name="sparkle" size={14} /> {t('Draw a portrait')}
            </button>
          </div>
          <Field label={t('Tags')}>
            <TagInput value={c.tags} onChange={(tags) => set({ tags })} placeholder={t('+ tag')} mono={false} />
          </Field>
          <div className="cs-grid-fields">
            <Field label={t('Creator')}>
              <input className="cs-input" value={c.creator} onChange={(e) => set({ creator: e.target.value })} />
            </Field>
            <Field label={t('Card version')}>
              <input className="cs-input" value={c.characterVersion} onChange={(e) => set({ characterVersion: e.target.value })} />
            </Field>
            <Field label={t('Nickname')}>
              <input className="cs-input" value={c.nickname} onChange={(e) => set({ nickname: e.target.value })} />
            </Field>
          </div>
          <RangeField label={t('Talkativeness in groups')} value={c.talkativeness} min={0} max={1} step={0.05} onChange={(v) => set({ talkativeness: v })} />
          <Check checked={c.fav} onChange={(fav) => set({ fav })}>
            {t('In favorites')}
          </Check>
        </div>
      ) : null}

      {tab === 'defs' ? (
        <div className="cs-stack-gap">
          <Field label={<>{t('Description ·')} <Tok text={c.description} /></>} hint={t('Appearance, background, manners. The {{char}} and {{user}} macros are filled in.')}>
            <textarea className="cs-textarea cs-textarea--lg" rows={10} value={c.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label={<>{t('Personality ·')} <Tok text={c.personality} /></>}>
            <textarea className="cs-textarea" rows={3} value={c.personality} onChange={(e) => set({ personality: e.target.value })} />
          </Field>
          <Field label={<>{t('Scenario ·')} <Tok text={c.scenario} /></>}>
            <textarea className="cs-textarea" rows={3} value={c.scenario} onChange={(e) => set({ scenario: e.target.value })} />
          </Field>
        </div>
      ) : null}

      {tab === 'greet' ? (
        <div className="cs-stack-gap">
          <Field label={t('First message')}>
            <textarea className="cs-textarea cs-textarea--lg" rows={6} value={c.firstMessage} onChange={(e) => set({ firstMessage: e.target.value })} />
          </Field>
          <span className="cs-label">{t('Alternate greetings · swiped through at the start of a chat')}</span>
          {c.alternateGreetings.map((g, i) => (
            <div key={i} className="cs-greeting">
              <textarea
                className="cs-textarea cs-grow"
                rows={4}
                value={g}
                onChange={(e) => set({ alternateGreetings: c.alternateGreetings.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label={t('Delete the greeting')} onClick={() => set({ alternateGreetings: c.alternateGreetings.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="cs-btn cs-btn--dashed" onClick={() => set({ alternateGreetings: [...c.alternateGreetings, ''] })}>
            {t('+ greeting')}
          </button>
          <span className="cs-label">{t('Only for group chats')}</span>
          {c.groupGreetings.map((g, i) => (
            <div key={i} className="cs-greeting">
              <textarea className="cs-textarea cs-grow" rows={3} value={g} onChange={(e) => set({ groupGreetings: c.groupGreetings.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label={t('Delete')} onClick={() => set({ groupGreetings: c.groupGreetings.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => set({ groupGreetings: [...c.groupGreetings, ''] })}>
            {t('+ group greeting')}
          </button>
        </div>
      ) : null}

      {tab === 'examples' ? (
        <Field
          label={<>{t('Dialogue examples ·')} <Tok text={c.exampleMessages} /></>}
          hint={t('Each example starts with <START>. Format: {{user}}: … / {{char}}: …')}
        >
          <textarea className="cs-textarea cs-textarea--mono" rows={16} value={c.exampleMessages} onChange={(e) => set({ exampleMessages: e.target.value })} />
        </Field>
      ) : null}

      {tab === 'prompts' ? (
        <div className="cs-stack-gap">
          <Field label={t("Character's main prompt")} hint={t("Replaces the preset's “Main prompt”. {{original}} inserts the original one.")}>
            <textarea className="cs-textarea" rows={5} value={c.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
          </Field>
          <Field label={t("Character's post-history instruction")} hint={t("Replaces the preset's “Post-history instruction”. {{original}} inserts the original one.")}>
            <textarea className="cs-textarea" rows={4} value={c.postHistoryInstructions} onChange={(e) => set({ postHistoryInstructions: e.target.value })} />
          </Field>
          <div className="cs-honey-box">
            <span className="cs-label cs-label--honey">{t("Character's note (at depth)")}</span>
            <textarea className="cs-textarea" rows={3} value={c.depthPrompt.prompt} onChange={(e) => set({ depthPrompt: { ...c.depthPrompt, prompt: e.target.value } })} />
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label={t('Depth')} honey>
                <input className="cs-input" type="number" min={0} value={c.depthPrompt.depth} onChange={(e) => set({ depthPrompt: { ...c.depthPrompt, depth: Math.max(0, Number(e.target.value)) } })} />
              </Field>
              <Field label={t('Role')} honey>
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
          <span className="cs-label">{t("Character's lorebooks")}</span>
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
                const b = upsert('worlds', newLorebook({ name: t('{name} · lorebook', { name: c.name }) }));
                set({ worldIds: [...c.worldIds, b.id] });
                navigate('library', `lore:${b.id}`);
              }}
            >
              {t('+ new lorebook')}
            </button>
          </div>
          <p className="cs-hint">{t('The first linked lorebook is embedded in the card on export (character_book).')}</p>
          <Field label={t('Preset when the chat opens')}>
            <select className="cs-select" value={c.presetId} onChange={(e) => set({ presetId: e.target.value })}>
              <option value="">{t("— don't change —")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('regex', `char:${c.id}`)}>
            <Icon name="regex" size={16} /> {t("This character's regexes")}
          </button>
        </div>
      ) : null}

      {tab === 'sprites' ? (
        <div className="cs-stack-gap">
          <p className="cs-hint">{t('Emotion sprites for the Expressions module and the Visual novel view. “neutral” is the default.')}</p>
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
                  if (c.sprites[e]) openMenu(ev, [{ label: t('Remove the sprite'), icon: 'trash', danger: true, onClick: () => { const s = { ...c.sprites }; delete s[e]; set({ sprites: s }); } }]);
                }}
              >
                {c.sprites[e] ? <img src={c.sprites[e]} alt={e} /> : null}
                <span className="cs-tile__label">{EMOTION_LABELS[e]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'notes' ? (
        <Field label={t("Card author's notes")} hint={t('Not sent to the model.')}>
          <textarea className="cs-textarea" rows={10} value={c.creatorNotes} onChange={(e) => set({ creatorNotes: e.target.value })} />
        </Field>
      ) : null}

      <div className="cs-modal-foot" style={{ justifyContent: 'space-between' }}>
        <div className="cs-row cs-row--wrap">
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportCharacter(c, 'png').catch((err) => toastError(err))}>
            {t('Export PNG')}
          </button>
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => exportCharacter(c, 'json')}>
            JSON
          </button>
          <button type="button" className="cs-btn cs-btn--sm" onClick={() => duplicateCharacter(c)}>
            {t('Duplicate')}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--sm cs-btn--danger"
            onClick={async () => {
              if (await deleteCharacter(c)) onClose();
            }}
          >
            {t('Delete')}
          </button>
        </div>
        <button type="button" className="cs-btn cs-btn--primary" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </Modal>
  );
}
