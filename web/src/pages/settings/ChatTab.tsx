import { useStore, updateSettingsSection, updateSettings, setChat } from '../../lib/store';
import { Check, RangeField, Field, Choices } from '../../components/ui';
import { useTokenizer } from '../../lib/tokenizer';
import type { Settings } from '../../lib/types';

export function ChatTab() {
  const chat = useStore((s) => s.settings.chat);
  const tokenizer = useStore((s) => s.settings.tokenizer);
  const globalVars = useStore((s) => s.settings.globalVariables);
  const chatVars = useStore((s) => s.chat?.meta.variables);
  const tokKind = useTokenizer((s) => s.kind);
  const set = (p: Partial<Settings['chat']>) => updateSettingsSection('chat', p);
  return (
    <div className="cs-columns">
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Ввод и сообщения
        </h2>
        <Field label="Отправка">
          <Choices<'enter' | 'ctrlEnter'>
            small
            value={chat.sendOnEnter}
            onChange={(sendOnEnter) => set({ sendOnEnter })}
            items={[
              { id: 'enter', label: 'Enter — отправить, Shift+Enter — строка' },
              { id: 'ctrlEnter', label: 'Ctrl+Enter — отправить' },
            ]}
          />
        </Field>
        <Check checked={chat.showTimestamps} onChange={(showTimestamps) => set({ showTimestamps })}>
          Время у сообщений
        </Check>
        <Check checked={chat.showGenInfo} onChange={(showGenInfo) => set({ showGenInfo })}>
          Модель, время и токены у ответов
        </Check>
        <Check checked={chat.renderMarkdown} onChange={(renderMarkdown) => set({ renderMarkdown })}>
          Форматирование (*курсив*, **жирный**, списки)
        </Check>
        <Check checked={chat.renderHtml} onChange={(renderHtml) => set({ renderHtml })}>
          Показывать HTML из сообщений (очищенный, без скриптов)
        </Check>
        <Check checked={chat.htmlIframe} onChange={(htmlIframe) => set({ htmlIframe })}>
          HTML-документы со стилями — в изолированной песочнице
        </Check>
        <Check checked={chat.collapseReasoning} onChange={(collapseReasoning) => set({ collapseReasoning })}>
          Сворачивать мысли модели
        </Check>
        <Check checked={chat.confirmDelete} onChange={(confirmDelete) => set({ confirmDelete })}>
          Спрашивать перед удалением сообщения
        </Check>
        <Check checked={chat.autoScroll} onChange={(autoScroll) => set({ autoScroll })}>
          Прокручивать к новым сообщениям
        </Check>
        <RangeField label="Сообщений на экране сразу" value={chat.renderLimit} min={20} max={500} step={10} onChange={(renderLimit) => set({ renderLimit })} />
      </section>
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Генерация
        </h2>
        <Check checked={chat.autoContinue} onChange={(autoContinue) => set({ autoContinue })}>
          Автопродолжение, если ответ оборвался по длине
        </Check>
        {chat.autoContinue ? <RangeField label="…и короче, символов" value={chat.autoContinueMinChars} min={50} max={2000} step={50} onChange={(autoContinueMinChars) => set({ autoContinueMinChars })} /> : null}
        <Check checked={chat.trimIncomplete} onChange={(trimIncomplete) => set({ trimIncomplete })}>
          Обрезать незаконченное предложение в конце
        </Check>
        <Field label={`Счёт токенов · сейчас ${tokKind === 'estimate' ? 'оценка' : tokKind}`}>
          <select className="cs-select" value={tokenizer} onChange={(e) => updateSettings({ tokenizer: e.target.value as Settings['tokenizer'] })}>
            <option value="auto">Авто (o200k — GPT-4o и похожие)</option>
            <option value="cl100k">cl100k (GPT-4, многие open-source)</option>
            <option value="estimate">Быстрая оценка по символам</option>
          </select>
        </Field>
        <h3 className="cs-h3" style={{ marginTop: 8 }}>
          Переменные
        </h3>
        <p className="cs-hint">Задаются макросами {'{{setvar::имя::значение}}'} и командами /setvar. Здесь можно поправить вручную.</p>
        <VarTable title="Этого чата" vars={chatVars} onChange={(v) => setChat((c) => ({ ...c, meta: { ...c.meta, variables: v } }))} />
        <VarTable title="Глобальные" vars={globalVars} onChange={(v) => updateSettings({ globalVariables: v })} />
      </section>
    </div>
  );
}

function VarTable({ title, vars, onChange }: { title: string; vars?: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  if (!vars) return <p className="cs-hint">{title}: откройте чат.</p>;
  const entries = Object.entries(vars);
  return (
    <div className="cs-col" style={{ gap: 6 }}>
      <span className="cs-label">{title}</span>
      {entries.map(([k, v]) => (
        <div key={k} className="cs-row" style={{ gap: 6 }}>
          <code className="cs-mono" style={{ minWidth: 90, fontSize: 12 }}>
            {k}
          </code>
          <input className="cs-input cs-grow" style={{ minHeight: 36 }} value={v} onChange={(e) => onChange({ ...vars, [k]: e.target.value })} aria-label={k} />
          <button
            type="button"
            className="cs-icon-btn cs-icon-btn--xs"
            aria-label="Удалить"
            onClick={() => {
              const n = { ...vars };
              delete n[k];
              onChange(n);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {!entries.length ? <span className="cs-hint">пусто</span> : null}
    </div>
  );
}
