import { useEffect, useState } from 'react';
import { useStore, upsert, removeItem, updateSettings, setState, toast, toastError, getState, navigate } from '../../lib/store';
import { Field, Choices, Modal, Check, confirmDialog, Empty, CodeEditor } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { newConnection } from '../../lib/defaults';
import type { ApiType, ConnectionProfile, ModelInfo, RequestLogItem, Settings } from '../../lib/types';
import { fmtTime, fmtNum } from '../../lib/utils';

const API_TYPES: { id: ApiType; label: string }[] = [
  { id: 'openai', label: 'OpenAI-совместимый' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google AI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'textcompletion', label: 'Text Completion' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'custom', label: 'Свой' },
];

export const DEFAULT_URLS: Record<ApiType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  textcompletion: 'http://127.0.0.1:5001',
  ollama: 'http://127.0.0.1:11434',
  custom: 'http://127.0.0.1:5000/v1',
};

const KIND_LABEL: Record<ApiType, string> = {
  openai: 'OpenAI-совместимый',
  anthropic: 'Anthropic',
  google: 'Google AI',
  openrouter: 'OpenRouter',
  textcompletion: 'Text Completion',
  ollama: 'Ollama',
  custom: 'Свой',
};

/** Popular OpenAI-compatible providers: one click fills the base URL. */
const PROVIDERS: { label: string; url: string }[] = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { label: 'Mistral', url: 'https://api.mistral.ai/v1' },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { label: 'xAI', url: 'https://api.x.ai/v1' },
  { label: 'Together', url: 'https://api.together.xyz/v1' },
  { label: 'Fireworks', url: 'https://api.fireworks.ai/inference/v1' },
  { label: 'NanoGPT', url: 'https://nano-gpt.com/api/v1' },
  { label: 'LM Studio', url: 'http://127.0.0.1:1234/v1' },
  { label: 'vLLM / Aphrodite', url: 'http://127.0.0.1:2242/v1' },
];

const TASKS: { key: keyof Settings['profileFor']; label: string; empty: string }[] = [
  { key: 'chat', label: 'Чат', empty: 'первый профиль' },
  { key: 'impersonate', label: 'Impersonate+', empty: 'как в чате' },
  { key: 'memory', label: 'Memory Book', empty: 'как в чате' },
  { key: 'generator', label: 'Генератор', empty: 'как в чате' },
  { key: 'utility', label: 'Служебное', empty: 'как в чате' },
];

function RequestLog() {
  const [items, setItems] = useState<RequestLogItem[]>([]);
  const [open, setOpen] = useState<RequestLogItem | null>(null);
  const load = () => api.log().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="cs-panel" style={{ gap: 8 }}>
      <div className="cs-panel-head">
        <h2 className="cs-h2" style={{ fontSize: 17 }}>
          Журнал запросов
        </h2>
        <button type="button" className="cs-icon-btn cs-icon-btn--soft cs-ml-auto" aria-label="Обновить" onClick={load}>
          <Icon name="refresh" size={16} />
        </button>
      </div>
      {items.slice(0, 8).map((it) => (
        <button key={it.id} type="button" className="cs-log-row" onClick={() => api.logItem(it.id).then(setOpen).catch((e) => toastError(e))}>
          <span className={`cs-status-code${it.status >= 400 || it.error ? ' cs-status-code--err' : ''}`}>{it.aborted ? 'стоп' : it.status || '…'}</span>
          <span className="cs-grow cs-ellipsis" style={{ fontWeight: 700 }}>
            {it.label}
          </span>
          <span className="cs-mono" style={{ fontSize: 11, color: 'var(--cs-muted)' }}>
            {fmtTime(it.time)}
          </span>
        </button>
      ))}
      {!items.length ? <p className="cs-hint">Запросов пока не было.</p> : null}
      {items.length ? (
        <a
          href="#/presets/preview"
          style={{ fontSize: 13, marginTop: 4 }}
          onClick={(e) => {
            e.preventDefault();
            if (items[0]) api.logItem(items[0].id).then(setOpen);
          }}
        >
          Открыть запрос целиком
        </a>
      ) : null}
      {open ? (
        <Modal title={open.label} size="wide" onClose={() => setOpen(null)}>
          <div className="cs-row cs-row--wrap">
            <span className={`cs-status-code${open.status >= 400 || open.error ? ' cs-status-code--err' : ''}`}>{open.status}</span>
            <span className="cs-pill cs-pill--white">{open.api}</span>
            {open.model ? <span className="cs-pill cs-pill--white">{open.model}</span> : null}
            {open.duration ? <span className="cs-pill cs-pill--mono">{(open.duration / 1000).toFixed(1)} с</span> : null}
            {open.usage ? <span className="cs-pill cs-pill--mono">{fmtNum(Object.values(open.usage).reduce((a, b) => a + (Number(b) || 0), 0))} ток.</span> : null}
          </div>
          {open.url ? <code className="cs-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{open.url}</code> : null}
          {open.error ? <p style={{ color: 'var(--cs-rose-deep)', fontWeight: 700, whiteSpace: 'pre-wrap' }}>{open.error}</p> : null}
          <span className="cs-label">Запрос</span>
          <CodeEditor value={JSON.stringify(open.request, null, 2)} lang="json" readOnly minHeight={200} />
          {open.response ? (
            <>
              <span className="cs-label">Ответ</span>
              <pre className="cs-code">{open.response}</pre>
            </>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}

export function ConnectionsTab() {
  const connections = useStore((s) => s.connections);
  const secrets = useStore((s) => s.secrets);
  const profileFor = useStore((s) => s.settings.profileFor);
  const [sel, setSel] = useState(() => profileFor.chat || connections[0]?.id || '');
  const [key, setKey] = useState('');
  const [revealed, setRevealed] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const c = connections.find((x) => x.id === sel) || connections[0];
  useEffect(() => {
    setKey('');
    setRevealed('');
    setModels([]);
  }, [c?.id]);

  const set = (patch: Partial<ConnectionProfile>) => c && upsert('connections', { ...c, ...patch });
  const secretName = c ? `conn:${c.id}` : '';
  const hasKey = !!secrets[secretName];

  const saveKey = async () => {
    if (!c || !key) return;
    const r = await api.setSecret(secretName, key);
    setState((s) => ({ secrets: { ...s.secrets, [secretName]: r.masked } }));
    setKey('');
  };

  const add = (api: ApiType = 'openai', patch: Partial<ConnectionProfile> = {}) => {
    const n = upsert('connections', newConnection({ name: connections.length ? `Профиль ${connections.length + 1}` : 'Основной', api, baseUrl: DEFAULT_URLS[api], ...patch }));
    if (!getState().settings.profileFor.chat) updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: n.id } }));
    setSel(n.id);
  };

  const refreshModels = async () => {
    if (!c) return;
    setLoadingModels(true);
    try {
      if (key) await saveKey();
      const list = await api.models(c);
      setModels(list);
      if (!c.model && list[0]) set({ model: list[0].id });
      toast(`Моделей: ${list.length}`);
    } catch (err) {
      toastError(err, 'Список моделей');
    } finally {
      setLoadingModels(false);
    }
  };

  const test = async () => {
    if (!c) return;
    setTesting(true);
    try {
      if (key) await saveKey();
      const r = await api.test(c);
      set({ status: { ok: r.ok, latency: r.latency, at: Date.now(), error: r.error } });
      if (r.ok) toast(`На связи · ${r.latency} мс`);
      else toastError(r.error || 'нет ответа', 'Соединение');
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(false);
    }
  };

  if (!c) {
    return (
      <section className="cs-panel cs-panel--pad-lg">
        <Empty icon="zap" title="Подключите языковую модель">
          Выберите, где живёт ваша модель. Ключи хранятся только на этом устройстве, в зашифрованном виде.
          <div className="cs-chips" style={{ justifyContent: 'center' }}>
            {API_TYPES.map((a) => (
              <button key={a.id} type="button" className="cs-choice cs-choice--sm" onClick={() => add(a.id, { name: a.label })}>
                {a.label}
              </button>
            ))}
          </div>
        </Empty>
      </section>
    );
  }

  const status = c.status;
  const ctxModel = models.find((m) => m.id === c.model)?.context;

  return (
    <div className="cs-columns">
      <section aria-label="Профили подключения" className="cs-panel" style={{ flex: '1 1 260px', minWidth: 0, gap: 8 }}>
        <div className="cs-panel-head" style={{ marginBottom: 4 }}>
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Профили
          </h2>
          <button type="button" className="cs-icon-btn cs-icon-btn--mint cs-ml-auto" style={{ width: 40, height: 40 }} aria-label="Новый профиль" onClick={() => add()}>
            <Icon name="plus" size={18} stroke={2.2} />
          </button>
        </div>
        {connections.map((p) => (
          <button key={p.id} type="button" className="cs-select-item cs-select-item--soft" aria-pressed={p.id === c.id} onClick={() => setSel(p.id)} style={{ minHeight: 60 }}>
            <span className={`cs-dot${p.status ? (p.status.ok ? '' : ' cs-dot--off') : ' cs-dot--off'}`} />
            <span className="cs-grow" style={{ minWidth: 0 }}>
              <span className="cs-select-item__title cs-ellipsis">{p.name}</span>
              <span className="cs-select-item__sub cs-ellipsis">
                {KIND_LABEL[p.api]}
                {p.api === 'textcompletion' ? ` · ${p.tcFlavor === 'kobold' ? 'KoboldAI' : 'v1/completions'}` : ''}
                {p.id === profileFor.chat ? ' · для чата' : ''}
              </span>
            </span>
          </button>
        ))}
        <div className="cs-row" style={{ alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '10px 12px', borderRadius: 16, background: 'var(--cs-card)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--cs-card-label)' }}>
          <Icon name="lock" size={16} stroke={2} style={{ flex: 'none', marginTop: 1 }} />
          Ключи хранятся только на этом устройстве, в зашифрованном виде. В экспорт они не попадают.
        </div>
      </section>

      <section aria-label="Профиль" className="cs-panel cs-panel--strong" style={{ flex: '999 1 480px', minWidth: 0, padding: 22, gap: 14 }}>
        <div className="cs-row cs-row--wrap">
          <input className="cs-input cs-input--title" style={{ flex: '1 1 200px', fontSize: 20 }} value={c.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название профиля" />
          <span className={`cs-pill cs-pill--lg ${status ? (status.ok ? 'cs-pill--mint' : 'cs-pill--rose') : 'cs-pill--white'}`}>
            <span className={`cs-dot cs-dot--sm${status && !status.ok ? ' cs-dot--danger' : !status ? ' cs-dot--off' : ''}`} />
            {status ? (status.ok ? `на связи · ${status.latency} мс` : 'нет связи') : 'не проверен'}
          </span>
        </div>
        <Field label="Тип API">
          <Choices<ApiType>
            label="Тип API"
            value={c.api}
            onChange={(api) => set({ api, baseUrl: Object.values(DEFAULT_URLS).includes(c.baseUrl) || !c.baseUrl ? DEFAULT_URLS[api] : c.baseUrl })}
            items={API_TYPES}
          />
        </Field>
        {c.api === 'openai' || c.api === 'custom' ? (
          <div className="cs-chips">
            <span className="cs-label" style={{ alignSelf: 'center' }}>
              Провайдер
            </span>
            {PROVIDERS.map((p) => (
              <button key={p.label} type="button" className="cs-choice cs-choice--sm" aria-pressed={c.baseUrl === p.url} onClick={() => set({ baseUrl: p.url, api: p.label === 'OpenAI' ? 'openai' : 'custom' })}>
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
        {c.api === 'textcompletion' ? (
          <Field label="Формат бэкенда">
            <Choices<'openai' | 'kobold'>
              small
              value={c.tcFlavor}
              onChange={(tcFlavor) => set({ tcFlavor })}
              items={[
                { id: 'openai', label: '/v1/completions (KoboldCpp, llama.cpp, ooba, Tabby…)' },
                { id: 'kobold', label: 'KoboldAI classic' },
              ]}
            />
          </Field>
        ) : null}
        {c.api === 'ollama' || c.api === 'custom' ? (
          <Field label="Режим">
            <Choices<'chat' | 'text'>
              small
              value={c.mode}
              onChange={(mode) => set({ mode })}
              items={[
                { id: 'chat', label: 'Chat Completion' },
                { id: 'text', label: 'Text Completion (instruct)' },
              ]}
            />
          </Field>
        ) : null}
        <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Field label="Base URL">
            <input className="cs-input cs-input--mono" type="url" style={{ minHeight: 46 }} value={c.baseUrl} placeholder={DEFAULT_URLS[c.api]} onChange={(e) => set({ baseUrl: e.target.value })} />
          </Field>
          <Field label="API-ключ" htmlFor="cs-api-key">
            <div className="cs-row" style={{ gap: 6 }}>
              <input
                id="cs-api-key"
                className="cs-input cs-input--mono cs-grow"
                style={{ minHeight: 46 }}
                type={revealed ? 'text' : 'password'}
                value={revealed || key}
                placeholder={hasKey ? secrets[secretName] : c.api === 'ollama' || c.api === 'textcompletion' ? 'обычно не нужен' : 'sk-…'}
                onChange={(e) => {
                  setRevealed('');
                  setKey(e.target.value);
                }}
                onBlur={() => key && saveKey().catch((err) => toastError(err))}
                autoComplete="off"
              />
              <button
                type="button"
                className="cs-icon-btn cs-icon-btn--square"
                aria-label={revealed ? 'Скрыть ключ' : 'Показать ключ'}
                onClick={async () => {
                  if (revealed) return setRevealed('');
                  if (!hasKey) return;
                  try {
                    setRevealed((await api.revealSecret(secretName)).value);
                  } catch (err) {
                    toastError(err);
                  }
                }}
              >
                <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </Field>
        </div>
        <Field label="Модель" htmlFor="cs-model">
          <div className="cs-row cs-row--wrap" style={{ gap: 6 }}>
            {models.length ? (
              <select id="cs-model" className="cs-select" style={{ flex: '1 1 260px', minHeight: 46 }} value={c.model} onChange={(e) => set({ model: e.target.value })}>
                {!models.some((m) => m.id === c.model) && c.model ? <option value={c.model}>{c.model}</option> : null}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name !== m.id ? `${m.name} · ${m.id}` : m.id}
                  </option>
                ))}
              </select>
            ) : (
              <input id="cs-model" className="cs-input" style={{ flex: '1 1 260px', minHeight: 46 }} value={c.model} placeholder="[модель из списка провайдера]" onChange={(e) => set({ model: e.target.value })} />
            )}
            <button type="button" className="cs-btn" style={{ borderRadius: 14, minHeight: 46 }} disabled={loadingModels} onClick={refreshModels}>
              {loadingModels ? <span className="cs-spinner" style={{ width: 16, height: 16 }} /> : <Icon name="refresh" size={16} stroke={2} />}
              Обновить список
            </button>
          </div>
          <div className="cs-chips" style={{ fontSize: 12 }}>
            <span className="cs-pill cs-pill--sky">контекст: {c.contextOverride ? fmtNum(c.contextOverride) : ctxModel ? `${fmtNum(ctxModel)} у модели` : 'из пресета'}</span>
            <span className="cs-pill cs-pill--mint">стриминг</span>
            {c.api === 'anthropic' || c.api === 'openrouter' || c.api === 'textcompletion' ? <span className="cs-pill">префилл</span> : null}
            {c.vision ? <span className="cs-pill cs-pill--lilac">картинки на вход</span> : null}
          </div>
        </Field>

        <details className="cs-details">
          <summary>Дополнительно</summary>
          <div className="cs-grid-fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label="Прокси" honey>
              <input className="cs-input cs-input--mono" value={c.proxy} placeholder="socks5://127.0.0.1:1080" onChange={(e) => set({ proxy: e.target.value })} />
            </Field>
            <Field label="Таймаут, сек" honey>
              <input className="cs-input" type="number" min={5} value={c.timeout} onChange={(e) => set({ timeout: Number(e.target.value) })} />
            </Field>
            <Field label="Свой размер контекста (0 — из пресета)" honey>
              <input className="cs-input" type="number" min={0} step={1024} value={c.contextOverride} onChange={(e) => set({ contextOverride: Math.max(0, Number(e.target.value)) })} />
            </Field>
          </div>
          <Check checked={c.vision} onChange={(vision) => set({ vision })}>
            Модель понимает картинки (отправлять вложения)
          </Check>
          <div className="cs-col" style={{ gap: 6, marginTop: 12 }}>
            <span className="cs-label cs-label--honey">Доп. заголовки</span>
            {c.headers.map((h, i) => (
              <div key={i} className="cs-row" style={{ gap: 6 }}>
                <input className="cs-input cs-input--mono" style={{ flex: 1, minHeight: 40 }} aria-label="Имя заголовка" value={h.name} onChange={(e) => set({ headers: c.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="cs-input cs-input--mono" style={{ flex: 2, minHeight: 40 }} aria-label="Значение заголовка" value={h.value} onChange={(e) => set({ headers: c.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="cs-icon-btn cs-icon-btn--soft" aria-label="Убрать" onClick={() => set({ headers: c.headers.filter((_, j) => j !== i) })}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ headers: [...c.headers, { name: 'X-Title', value: 'Cream Soda' }] })}>
              + заголовок
            </button>
          </div>
          <div className="cs-col" style={{ gap: 6, marginTop: 12 }}>
            <span className="cs-label cs-label--honey">Добавить в тело запроса · JSON</span>
            <CodeEditor value={c.extraBody} lang="json" minHeight={90} onChange={(extraBody) => set({ extraBody })} label="Доп. тело запроса" />
            {c.extraBody.trim() && (() => {
              try {
                JSON.parse(c.extraBody);
                return null;
              } catch {
                return <span className="cs-hint" style={{ color: 'var(--cs-rose-deep)' }}>Некорректный JSON</span>;
              }
            })()}
          </div>
        </details>

        <div className="cs-row cs-row--wrap">
          <button type="button" className="cs-btn" style={{ flex: '1 1 180px', minHeight: 48 }} disabled={testing} onClick={test}>
            {testing ? <span className="cs-spinner" /> : null}
            Проверить соединение
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--primary"
            style={{ flex: '1 1 180px', minHeight: 48 }}
            onClick={async () => {
              try {
                await saveKey();
                if (!getState().settings.profileFor.chat) updateSettings((s) => ({ profileFor: { ...s.profileFor, chat: c.id } }));
                toast('Профиль сохранён');
              } catch (err) {
                toastError(err);
              }
            }}
          >
            Сохранить профиль
          </button>
          <button
            type="button"
            className="cs-icon-btn"
            aria-label="Удалить профиль"
            title="Удалить профиль"
            onClick={async () => {
              if (!(await confirmDialog(`Удалить профиль «${c.name}» и его ключ?`, { ok: 'Удалить' }))) return;
              await removeItem('connections', c.id);
              setSel('');
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </section>

      <aside className="cs-col-side cs-stack-gap" style={{ flex: '1 1 320px' }}>
        <section className="cs-panel" style={{ gap: 10 }}>
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Какой профиль для чего
          </h2>
          <p className="cs-hint">Тяжёлую модель — в чат, быструю — в фоновые задачи.</p>
          {TASKS.map((t) => (
            <label key={t.key} className="cs-check cs-check--row">
              {t.label}
              <select className="cs-select cs-select--sm" value={profileFor[t.key]} onChange={(e) => updateSettings((s) => ({ profileFor: { ...s.profileFor, [t.key]: e.target.value } }))}>
                <option value="">{t.empty}</option>
                {connections.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="cs-check cs-check--row">
            Картинки
            <a
              href="#/images"
              style={{ fontSize: 13 }}
              onClick={(e) => {
                e.preventDefault();
                navigate('images');
              }}
            >
              Свой API →
            </a>
          </div>
        </section>
        <RequestLog />
      </aside>
    </div>
  );
}
