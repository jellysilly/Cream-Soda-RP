import { useCallback, useEffect, useState } from 'react';
import { useStore, updateImageSettings, toast, toastError, setChat, patchItem, getState, setState, activeCharacter } from '../../lib/store';
import { PageHead, Field, Tabs, CodeEditor, openMenu, promptDialog, Empty } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { buildImagePrompt, generateImages, insertImageMessage, type ImageSource } from '../../lib/images';
import type { ImageSettings } from '../../lib/types';
import { uid } from '../../lib/utils';

function hostOf(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const SIZES = ['768x512', '512x768', '1024x1024', '1216x832', '832x1216', '512x512'];

const COMFY_SAMPLE = `{
  "3": { "class_type": "KSampler", "inputs": { "seed": %seed%, "steps": %steps%, "cfg": %cfg%, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
  "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "%model%" } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": %width%, "height": %height%, "batch_size": 1 } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%, %style%", "clip": ["4", 1] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "%negative%", "clip": ["4", 1] } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "cream-soda", "images": ["8", 0] } }
}`;

export default function ImagesPage() {
  const cfg = useStore((s) => s.imageSettings);
  const secretSet = useStore((s) => !!s.secrets.imagegen);
  const chatId = useStore((s) => s.chat?.id);
  const busy = useStore((s) => s.gen.kind === 'image');
  const param = useStore((s) => s.routeParam);
  const characters = useStore((s) => s.characters);
  const portraitFor = param.startsWith('portrait:') ? characters.find((c) => c.id === param.slice(9)) : undefined;
  const [source, setSource] = useState<ImageSource>(portraitFor ? 'portrait' : 'scene');
  const [prompt, setPrompt] = useState('');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [gallery, setGallery] = useState<{ url: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [building, setBuilding] = useState(false);
  const dir = chatId || 'gallery';

  const set = (p: Partial<ImageSettings>) => updateImageSettings(p);

  const loadGallery = useCallback(() => {
    api
      .listFiles('images', dir)
      .then((files) => {
        setGallery(files);
        if (files[0] && !selected) setSelected(files[0].url);
      })
      .catch(() => setGallery([]));
  }, [dir, selected]);

  useEffect(() => {
    loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  const test = async () => {
    try {
      if (key) await saveKey();
      const r = await api.testImages();
      setStatus({ ok: r.ok, text: r.ok ? `на связи · ${r.latency} мс` : r.error || 'нет ответа' });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    }
  };

  const saveKey = async () => {
    const r = await api.setSecret('imagegen', key);
    setState((s) => ({ secrets: { ...s.secrets, imagegen: r.masked } }));
    setKey('');
  };

  const assemble = async () => {
    setBuilding(true);
    try {
      if (source === 'portrait' && portraitFor && getState().chat?.ownerId !== portraitFor.id) {
        // Portrait of a character outside the open chat: describe from the card directly.
        setPrompt(`portrait of ${portraitFor.name}, ${portraitFor.description.slice(0, 400)}`);
      } else setPrompt(await buildImagePrompt(source));
    } catch (err) {
      if ((err as Error).message !== 'no-connection') toastError(err, 'Промпт');
    } finally {
      setBuilding(false);
    }
  };

  const run = async () => {
    try {
      let p = prompt.trim();
      if (!p && source !== 'free') {
        p = await buildImagePrompt(source);
        setPrompt(p);
      }
      if (!p) return toast('Напишите промпт', 'warn');
      const urls = await generateImages(p);
      toast(`Готово: ${urls.length} изобр.`);
      setSelected(urls[0] || '');
      loadGallery();
    } catch (err) {
      if ((err as Error).message !== 'no-connection') toastError(err, 'Генерация');
    }
  };

  const target = portraitFor || activeCharacter();

  return (
    <div className="cs-page">
      <PageHead title="Изображения" kana="イラスト" sub="Кадры сцен, аватары и фоны через твой собственный API">
        <span className="cs-pill cs-pill--white cs-pill--lg" style={{ color: status ? (status.ok ? 'var(--cs-mint-deep)' : 'var(--cs-rose-deep)') : 'var(--cs-muted)' }}>
          <span className={`cs-dot${status && !status.ok ? ' cs-dot--danger' : !status ? ' cs-dot--off' : ''}`} />
          {cfg.endpoint ? hostOf(cfg.endpoint) : 'API не настроен'}
          {status ? ` · ${status.text}` : ''}
        </span>
      </PageHead>

      <div className="cs-columns">
        <section aria-label="Подключение" className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 360px', minWidth: 0 }}>
          <h2 className="cs-h2">Свой API</h2>
          <Field label="Формат">
            <select className="cs-select" value={cfg.format} onChange={(e) => set({ format: e.target.value as ImageSettings['format'] })}>
              <option value="custom">Свой JSON-шаблон</option>
              <option value="a1111">A1111 / Forge-совместимый</option>
              <option value="comfy">ComfyUI · workflow</option>
              <option value="openai">OpenAI-совместимый images</option>
            </select>
          </Field>
          <Field label="Endpoint">
            <input
              className="cs-input cs-input--mono"
              type="url"
              value={cfg.endpoint}
              placeholder={cfg.format === 'a1111' ? 'http://127.0.0.1:7860' : cfg.format === 'comfy' ? 'http://127.0.0.1:8188' : cfg.format === 'openai' ? 'https://api.openai.com/v1' : 'http://192.168.1.20:7860/generate'}
              onChange={(e) => set({ endpoint: e.target.value })}
            />
          </Field>
          <Field label="Ключ / заголовок" hint="Bearer-ключ или строка вида «X-Api-Key: …». Хранится зашифрованно.">
            <div className="cs-row">
              <input className="cs-input cs-input--mono cs-grow" type="password" value={key} placeholder={secretSet ? 'сохранён · ввести новый' : 'не задан'} onChange={(e) => setKey(e.target.value)} />
              {key ? (
                <button type="button" className="cs-btn cs-btn--sm" onClick={() => saveKey().then(() => toast('Ключ сохранён'))}>
                  OK
                </button>
              ) : null}
            </div>
          </Field>
          {cfg.format === 'custom' ? (
            <>
              <div className="cs-col" style={{ gap: 6 }}>
                <span className="cs-label">Тело запроса</span>
                <CodeEditor value={cfg.bodyTemplate} lang="json" minHeight={170} onChange={(bodyTemplate) => set({ bodyTemplate })} label="Тело запроса" />
                <span className="cs-hint">{'{{prompt}} {{style}} {{negative}} {{width}} {{height}} {{steps}} {{seed}} {{cfg}} {{model}}'}</span>
              </div>
              <Field label="Где картинка в ответе">
                <input className="cs-input cs-input--mono" value={cfg.responsePath} onChange={(e) => set({ responsePath: e.target.value })} placeholder="$.images[0]" />
              </Field>
            </>
          ) : null}
          {cfg.format === 'comfy' ? (
            <div className="cs-col" style={{ gap: 6 }}>
              <div className="cs-row">
                <span className="cs-label">Workflow (API format)</span>
                <button type="button" className="cs-btn cs-btn--xs cs-ml-auto" onClick={() => set({ workflow: COMFY_SAMPLE })}>
                  Пример
                </button>
              </div>
              <CodeEditor value={cfg.workflow} lang="json" minHeight={200} onChange={(workflow) => set({ workflow })} label="Workflow" />
              <span className="cs-hint">Плейсхолдеры: %prompt% %negative% %style% %width% %height% %steps% %seed% %cfg% %model%</span>
            </div>
          ) : null}
          {cfg.format !== 'custom' ? (
            <div className="cs-grid-fields">
              <Field label="Модель">
                <input className="cs-input" value={cfg.model} placeholder={cfg.format === 'openai' ? 'gpt-image-1' : 'по умолчанию'} onChange={(e) => set({ model: e.target.value })} />
              </Field>
              {cfg.format !== 'openai' ? (
                <Field label="CFG">
                  <input className="cs-input" type="number" step={0.5} value={cfg.cfg} onChange={(e) => set({ cfg: Number(e.target.value) })} />
                </Field>
              ) : null}
              {cfg.format === 'a1111' ? (
                <Field label="Сэмплер">
                  <input className="cs-input" value={cfg.sampler} onChange={(e) => set({ sampler: e.target.value })} />
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field label="Негативный промпт">
            <textarea className="cs-textarea" rows={2} value={cfg.negative} onChange={(e) => set({ negative: e.target.value })} />
          </Field>
          <details className="cs-details">
            <summary>Промпты для сцены и портрета</summary>
            <Field label="Кадр сцены (запрос к языковой модели)" honey>
              <textarea className="cs-textarea" rows={4} value={cfg.scenePrompt} onChange={(e) => set({ scenePrompt: e.target.value })} />
            </Field>
            <Field label="Портрет персонажа" honey>
              <textarea className="cs-textarea" rows={3} value={cfg.portraitPrompt} onChange={(e) => set({ portraitPrompt: e.target.value })} />
            </Field>
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label="Сообщений для сцены" honey>
                <input className="cs-input" type="number" min={1} max={30} value={cfg.sceneMessages} onChange={(e) => set({ sceneMessages: Number(e.target.value) })} />
              </Field>
              <Field label="Авто-кадр каждые N ответов (0 — выкл.)" honey>
                <input className="cs-input" type="number" min={0} value={cfg.autoSceneEvery} onChange={(e) => set({ autoSceneEvery: Number(e.target.value) })} />
              </Field>
            </div>
          </details>
          <button type="button" className="cs-btn" onClick={test}>
            Проверить соединение
          </button>
        </section>

        <div className="cs-col-main cs-stack-gap" style={{ flex: '999 1 520px' }}>
          <section aria-label="Промпт" className="cs-panel cs-panel--strong cs-panel--pad-lg">
            <div className="cs-panel-head">
              <h2 className="cs-h2">Промпт</h2>
              <div className="cs-ml-auto">
                <Tabs<ImageSource>
                  label="Источник"
                  value={source}
                  onChange={setSource}
                  items={[
                    { id: 'scene', label: 'Из сцены' },
                    { id: 'portrait', label: 'Портрет чара' },
                    { id: 'free', label: 'Свободный' },
                  ]}
                />
              </div>
            </div>
            <label className="cs-sr-only" htmlFor="cs-img-prompt">
              Промпт
            </label>
            <textarea id="cs-img-prompt" className="cs-textarea" rows={3} value={prompt} placeholder={source === 'free' ? 'night cafe interior, rainy window, pastel light…' : 'Нажмите «Собрать промпт» — модель опишет кадр по чату'} onChange={(e) => setPrompt(e.target.value)} />
            {source !== 'free' ? (
              <button type="button" className="cs-btn cs-btn--sm" style={{ alignSelf: 'flex-start' }} disabled={building} onClick={assemble}>
                {building ? <span className="cs-spinner" style={{ width: 16, height: 16 }} /> : <Icon name="sparkle" size={14} />}
                Собрать промпт {source === 'scene' ? 'из последних сообщений' : `для «${target?.name || 'персонажа'}»`}
              </button>
            ) : null}
            <div className="cs-chips" style={{ alignItems: 'center' }}>
              <span className="cs-label" style={{ marginRight: 4 }}>
                Стиль
              </span>
              {cfg.styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="cs-choice cs-choice--sm"
                  aria-pressed={cfg.styleId === s.id}
                  title={s.prompt}
                  onClick={() => set({ styleId: cfg.styleId === s.id ? '' : s.id })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e, [
                      {
                        label: 'Изменить',
                        icon: 'edit',
                        onClick: async () => {
                          const p = await promptDialog(`Стиль «${s.label}»`, { value: s.prompt, label: 'Добавка к промпту', multiline: true });
                          if (p !== null) set({ styles: cfg.styles.map((x) => (x.id === s.id ? { ...x, prompt: p } : x)) });
                        },
                      },
                      { label: 'Удалить', icon: 'trash', danger: true, onClick: () => set({ styles: cfg.styles.filter((x) => x.id !== s.id) }) },
                    ]);
                  }}
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                className="cs-btn cs-btn--dashed cs-btn--xs"
                onClick={async () => {
                  const label = await promptDialog('Новый стиль', { label: 'Название' });
                  if (!label) return;
                  const p = await promptDialog(`Стиль «${label}»`, { label: 'Добавка к промпту (на английском)', multiline: true });
                  set({ styles: [...cfg.styles, { id: uid(), label, prompt: p || '' }] });
                }}
              >
                + стиль
              </button>
            </div>
            <div className="cs-grid-fields cs-grid-fields--sm">
              <Field label="Размер">
                <select
                  className="cs-select"
                  value={`${cfg.width}x${cfg.height}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    set({ width: w, height: h });
                  }}
                >
                  {[...new Set([...SIZES, `${cfg.width}x${cfg.height}`])].map((s) => (
                    <option key={s} value={s}>
                      {s.replace('x', ' × ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Шаги">
                <input className="cs-input" type="number" min={1} max={150} value={cfg.steps} onChange={(e) => set({ steps: Number(e.target.value) })} />
              </Field>
              <Field label="Seed">
                <input className="cs-input" value={cfg.seed} placeholder="случайный" onChange={(e) => set({ seed: e.target.value })} />
              </Field>
              <Field label="Кол-во">
                <input className="cs-input" type="number" min={1} max={8} value={cfg.count} onChange={(e) => set({ count: Math.max(1, Math.min(8, Number(e.target.value))) })} />
              </Field>
            </div>
            <button type="button" className="cs-btn cs-btn--primary cs-btn--lg cs-btn--glow" disabled={busy} onClick={run}>
              {busy ? <span className="cs-spinner" /> : <Icon name="sparkle" size={18} />}
              {busy ? 'Рисую…' : `Сгенерировать ${cfg.count}`}
            </button>
          </section>

          <section aria-label="Галерея" className="cs-panel cs-panel--pad-lg">
            <div className="cs-panel-head">
              <h2 className="cs-h2">{chatId ? 'Галерея чата' : 'Галерея'}</h2>
              <button type="button" className="cs-icon-btn cs-icon-btn--soft cs-ml-auto" aria-label="Обновить" onClick={loadGallery}>
                <Icon name="refresh" size={16} />
              </button>
            </div>
            {gallery.length ? (
              <div className="cs-gallery">
                {gallery.map((g, i) => (
                  <button
                    key={g.url}
                    type="button"
                    className="cs-tile"
                    aria-pressed={selected === g.url}
                    onClick={() => setSelected(g.url)}
                    onDoubleClick={() => window.open(g.url, '_blank', 'noopener')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(e, [
                        { label: 'Открыть', icon: 'external', onClick: () => window.open(g.url, '_blank', 'noopener') },
                        {
                          label: 'Удалить',
                          icon: 'trash',
                          danger: true,
                          onClick: async () => {
                            await api.deleteFile(g.url);
                            loadGallery();
                          },
                        },
                      ]);
                    }}
                  >
                    <img src={g.url} alt="" loading="lazy" />
                    <span className="cs-tile__label">
                      [кадр {gallery.length - i}
                      {selected === g.url ? ' · выбран' : ''}]
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty icon="images" title="Пока пусто">
                Сгенерированные кадры этого чата появятся здесь.
              </Empty>
            )}
            <div className="cs-row cs-row--wrap">
              <button type="button" className="cs-btn cs-btn--primary" disabled={!selected || !chatId} onClick={() => insertImageMessage(selected, prompt)}>
                Вставить в чат
              </button>
              <button
                type="button"
                className="cs-btn"
                disabled={!selected || !target}
                onClick={() => {
                  if (!target) return;
                  patchItem('characters', target.id, { avatar: selected });
                  toast(`Аватар «${target.name}» обновлён`);
                }}
              >
                Сделать аватаром
              </button>
              <button
                type="button"
                className="cs-btn"
                disabled={!selected || !chatId}
                onClick={() => {
                  setChat((c) => ({ ...c, meta: { ...c.meta, background: selected, sceneImage: selected } }));
                  toast('Фон чата обновлён');
                }}
              >
                Фон чата
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
