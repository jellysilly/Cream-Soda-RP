import { useEffect, useRef, useState } from 'react';
import { useStore, updateSettingsSection, upsert, removeItem, getState } from '../../lib/store';
import { PageHead, Field, RangeField, Check, Switch, Empty, Tabs } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ExtensionsSection } from './ExtensionsSection';
import { voices, speak, ttsAvailable } from '../../lib/tts';
import { newQuickReplySet } from '../../lib/defaults';
import { uid } from '../../lib/utils';
import { slashHelp } from '../../lib/slash';
import { useExtensionPanels, type ExtensionPanel } from '../../lib/extensions';
import { IMPERSONATE_PROMPTS } from '../../lib/defaults';
import type { ImpersonateMode, QuickReplySet } from '../../lib/types';

function TtsPanel() {
  const tts = useStore((s) => s.settings.extensions.tts);
  const [list, setList] = useState(voices());
  useEffect(() => {
    if (!ttsAvailable()) return;
    const update = () => setList(voices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  const set = (p: Partial<typeof tts>) => updateSettingsSection('extensions', { tts: { ...getState().settings.extensions.tts, ...p } });
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        Озвучка
      </h2>
      {!ttsAvailable() ? <p className="cs-hint">Этот браузер не поддерживает синтез речи.</p> : null}
      <Field label="Голос">
        <select className="cs-select" value={tts.voice} onChange={(e) => set({ voice: e.target.value })}>
          <option value="">Автоматически (русский)</option>
          {list.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      </Field>
      <RangeField label="Скорость" value={tts.rate} min={0.5} max={2} step={0.05} onChange={(rate) => set({ rate })} />
      <RangeField label="Высота" value={tts.pitch} min={0.5} max={2} step={0.05} onChange={(pitch) => set({ pitch })} />
      <Check checked={tts.auto} onChange={(auto) => set({ auto })}>
        Читать новые ответы автоматически
      </Check>
      <Check checked={tts.onlyQuotes} onChange={(onlyQuotes) => set({ onlyQuotes })}>
        Только прямую речь («…»)
      </Check>
      <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => speak('«За счёт заведения. Ты опять пришёл за пять минут до закрытия».')}>
        <Icon name="speaker" size={16} /> Проверить голос
      </button>
    </section>
  );
}

function TranslatePanel() {
  const tr = useStore((s) => s.settings.extensions.translate);
  const set = (p: Partial<typeof tr>) => updateSettingsSection('extensions', { translate: { ...getState().settings.extensions.translate, ...p } });
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        Переводчик чата
      </h2>
      <p className="cs-hint">Переводит сообщения служебной моделью (Настройки → «Какой профиль для чего»). В меню сообщения — «Перевести».</p>
      <Field label="Язык перевода">
        <select className="cs-select" value={tr.target} onChange={(e) => set({ target: e.target.value })}>
          <option value="ru">Русский</option>
          <option value="en">Английский</option>
          <option value="uk">Украинский</option>
          <option value="ja">Японский</option>
          <option value="de">Немецкий</option>
          <option value="fr">Французский</option>
          <option value="es">Испанский</option>
          <option value="zh">Китайский</option>
          <option value="ko">Корейский</option>
        </select>
      </Field>
      <Check checked={tr.auto} onChange={(auto) => set({ auto })}>
        Переводить новые ответы автоматически
      </Check>
    </section>
  );
}

function ImpersonatePanel() {
  const imp = useStore((s) => s.settings.impersonate);
  const [mode, setMode] = useState<ImpersonateMode>('variants');
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        Impersonate+
      </h2>
      <RangeField label="Сколько вариантов" value={imp.count} min={2} max={5} onChange={(count) => updateSettingsSection('impersonate', { count })} />
      <Tabs<ImpersonateMode>
        value={mode}
        onChange={setMode}
        items={[
          { id: 'continue', label: 'Продолжить' },
          { id: 'variants', label: 'Варианты' },
          { id: 'action', label: 'Действие' },
          { id: 'voice', label: 'Голос' },
        ]}
      />
      <Field label="Инструкция режима" hint="{{count}} — число вариантов, {{input}} — черновик игрока. Варианты разделяются строками «### N».">
        <textarea className="cs-textarea" rows={6} value={imp.prompts[mode]} onChange={(e) => updateSettingsSection('impersonate', { prompts: { ...imp.prompts, [mode]: e.target.value } })} />
      </Field>
      <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => updateSettingsSection('impersonate', { prompts: { ...imp.prompts, [mode]: IMPERSONATE_PROMPTS[mode] } })}>
        Вернуть стандартную
      </button>
    </section>
  );
}

function QuickRepliesPanel() {
  const sets = useStore((s) => s.quickreplies);
  const [sel, setSel] = useState(sets[0]?.id || '');
  const qs = sets.find((s) => s.id === sel) || sets[0];
  const set = (p: Partial<QuickReplySet>) => qs && upsert('quickreplies', { ...qs, ...p });
  return (
    <section className="cs-panel" style={{ gridColumn: '1 / -1' }}>
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Быстрые ответы
        </h2>
        <select className="cs-select cs-select--sm cs-ml-auto" value={qs?.id || ''} onChange={(e) => setSel(e.target.value)} aria-label="Набор">
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" className="cs-icon-btn cs-icon-btn--mint" style={{ width: 36, height: 36 }} aria-label="Новый набор" onClick={() => setSel(upsert('quickreplies', newQuickReplySet({ name: 'Новый набор' })).id)}>
          <Icon name="plus" size={16} stroke={2.2} />
        </button>
      </div>
      {qs ? (
        <>
          <div className="cs-row cs-row--wrap">
            <input className="cs-input cs-grow" value={qs.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название набора" />
            <Check checked={qs.enabled} onChange={(enabled) => set({ enabled })}>
              Показывать над вводом
            </Check>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--danger" onClick={() => removeItem('quickreplies', qs.id)}>
              Удалить набор
            </button>
          </div>
          <p className="cs-hint">Текст отправляется как сообщение; строка, начинающаяся с «/», выполняется как команда (можно цепочкой через «|»).</p>
          {qs.replies.map((r) => (
            <div key={r.id} className="cs-row-item" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <input className="cs-input" style={{ flex: '0 1 160px' }} value={r.label} placeholder="Подпись" onChange={(e) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} />
              <input className="cs-input cs-input--mono cs-grow" style={{ minWidth: 200 }} value={r.message} placeholder="/roll 1d20 или текст" onChange={(e) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, message: e.target.value } : x)) })} />
              <div className="cs-chips">
                <Check chip checked={r.autoOnNewChat} onChange={(autoOnNewChat) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, autoOnNewChat } : x)) })}>
                  при новом чате
                </Check>
                <Check chip checked={r.autoOnAi} onChange={(autoOnAi) => set({ replies: qs.replies.map((x) => (x.id === r.id ? { ...x, autoOnAi } : x)) })}>
                  после ответа ИИ
                </Check>
              </div>
              <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Удалить" onClick={() => set({ replies: qs.replies.filter((x) => x.id !== r.id) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cs-btn cs-btn--dashed"
            onClick={() => set({ replies: [...qs.replies, { id: uid(), label: 'Кнопка', message: '', title: '', autoOnNewChat: false, autoOnUser: false, autoOnAi: false }] })}
          >
            + кнопка
          </button>
        </>
      ) : (
        <Empty icon="zap" title="Наборов нет" />
      )}
    </section>
  );
}

function ExtensionPanelView({ panel }: { panel: ExtensionPanel }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const cleanup = panel.render(ref.current);
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [panel]);
  return (
    <section className="cs-panel">
      <h2 className="cs-h2" style={{ fontSize: 17 }}>
        {panel.title}
      </h2>
      <div ref={ref} />
    </section>
  );
}

export default function ModulesPage() {
  const enabled = useStore((s) => s.settings.extensions.enabled);
  const dice = useStore((s) => s.settings.extensions.dice);
  const panels = useExtensionPanels((s) => s.panels);
  const failed = useExtensionPanels((s) => s.failed);
  const [showCommands, setShowCommands] = useState(false);
  return (
    <div className="cs-page">
      <PageHead title="Модули" kana="トッピング" sub="Встроенные модули, расширения сообщества и быстрые ответы" />
      <ExtensionsSection />
      {Object.keys(failed).length ? (
        <section className="cs-panel">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Не загрузились
          </h2>
          {Object.entries(failed).map(([name, err]) => (
            <p key={name} className="cs-hint">
              <b>{name}</b>: {err}
            </p>
          ))}
          <p className="cs-hint">Расширения SillyTavern, которые импортируют внутренние файлы ST напрямую, работать не будут; поддерживается API window.CreamSoda и частично SillyTavern.getContext().</p>
        </section>
      ) : null}
      <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: 18, alignItems: 'start' }}>
        {enabled.impersonate ? <ImpersonatePanel /> : null}
        {enabled.tts ? <TtsPanel /> : null}
        {enabled.translate ? <TranslatePanel /> : null}
        {enabled.dice ? (
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Кубики и статы
            </h2>
            <p className="cs-hint">Команда /roll 2d6+1, макрос {'{{roll:1d20}}'}. Статы можно хранить в переменных: /setvar key=hp 10, {'{{getvar::hp}}'}.</p>
            <label className="cs-check cs-check--row">
              Панель кубиков над вводом
              <Switch checked={dice.showBar} label="Панель кубиков" onChange={(showBar) => updateSettingsSection('extensions', { dice: { showBar } })} />
            </label>
          </section>
        ) : null}
        {enabled.expressions ? (
          <section className="cs-panel">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Выражения
            </h2>
            <p className="cs-hint">Загрузите спрайты эмоций в карточке персонажа (вкладка «Спрайты»). В виде «Визуальная новелла» спрайт показывается над чатом.</p>
          </section>
        ) : null}
        {enabled.quickreplies ? <QuickRepliesPanel /> : null}
        {panels.map((p) => (
          <ExtensionPanelView key={p.id} panel={p} />
        ))}
        <section className="cs-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="cs-panel-head">
            <h2 className="cs-h2" style={{ fontSize: 17 }}>
              Слэш-команды
            </h2>
            <button type="button" className="cs-btn cs-btn--sm cs-ml-auto" onClick={() => setShowCommands(!showCommands)}>
              {showCommands ? 'Скрыть' : 'Показать все'}
            </button>
          </div>
          <p className="cs-hint">Пишите в поле ввода чата. Команды соединяются через «|», результат предыдущей — {'{{pipe}}'}.</p>
          {showCommands ? (
            <div className="cs-col" style={{ gap: 4 }}>
              {slashHelp().map((c) => (
                <div key={c.name} style={{ fontSize: 13 }}>
                  <code className="cs-mono" style={{ color: 'var(--cs-link)', fontWeight: 600 }}>
                    /{c.name}
                  </code>
                  {c.aliases.length ? <span className="cs-muted"> ({c.aliases.map((a) => `/${a}`).join(', ')})</span> : null} — {c.help.replace(/^\/\S+\s*(—\s*)?/, '')}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
