import { api } from './api';
import { getState, setState, setChat, toast, activeCharacter } from './store';
import { quietGenerate, utilityGenerate, macroEnvFor } from './generate';
import { substituteMacros } from './macros';
import { newMessage } from './defaults';

export type ImageSource = 'scene' | 'portrait' | 'free';

/** Asks the chat model to describe the current scene as an image prompt. */
export async function buildImagePrompt(source: ImageSource): Promise<string> {
  const s = getState();
  const cfg = s.imageSettings;
  if (source === 'scene') {
    const n = Math.max(1, cfg.sceneMessages || 6);
    const instruction = `${substituteMacros(cfg.scenePrompt, macroEnvFor())}\n(Учитывай последние ${n} сообщений.)`;
    return quietGenerate(instruction, { label: 'Картинки · промпт сцены', maxTokens: 200 });
  }
  if (source === 'portrait') {
    const env = macroEnvFor();
    return utilityGenerate('utility', [{ role: 'user', content: substituteMacros(cfg.portraitPrompt, env) }], {
      maxTokens: 200,
      temperature: 0.5,
      label: 'Картинки · промпт портрета',
    });
  }
  return '';
}

export function styleText(): string {
  const cfg = getState().imageSettings;
  return cfg.styles.find((x) => x.id === cfg.styleId)?.prompt || '';
}

export async function generateImages(prompt: string, count?: number): Promise<string[]> {
  const s = getState();
  const cfg = s.imageSettings;
  if (!cfg.endpoint) throw new Error('Укажите endpoint своего API в разделе «Картинки»');
  const seed = /^\d+$/.test(String(cfg.seed).trim()) ? Number(cfg.seed) : -1;
  setState({ gen: { kind: 'image', startedAt: Date.now() } });
  try {
    const res = await api.generateImages({
      dir: s.chat?.id,
      label: 'Картинки · генерация',
      params: {
        prompt,
        style: styleText(),
        negative: cfg.negative,
        width: cfg.width,
        height: cfg.height,
        steps: cfg.steps,
        seed,
        cfg: cfg.cfg,
        sampler: cfg.sampler,
        model: cfg.model,
        count: count ?? cfg.count,
      },
    });
    return res.images.map((i) => i.url);
  } finally {
    setState({ gen: { kind: null } });
  }
}

/** «Кадр сцены»: prompt from the chat → image → (optionally) inserted into the chat. */
export async function generateSceneFrame(opts: { insert?: boolean } = {}) {
  const prompt = await buildImagePrompt('scene');
  const [url] = await generateImages(prompt, 1);
  if (!url) return;
  setChat((c) => ({ ...c, meta: { ...c.meta, sceneImage: url } }));
  if (opts.insert) insertImageMessage(url, prompt);
  return url;
}

export function insertImageMessage(url: string, caption = '') {
  const c = activeCharacter();
  const msg = newMessage({ role: 'system', name: 'Кадр сцены', text: caption ? `*${caption.slice(0, 280)}*` : '', image: url });
  msg.hidden = true;
  if (c) msg.charId = c.id;
  setChat((chat) => ({ ...chat, messages: [...chat.messages, msg] }));
  toast('Кадр добавлен в чат (скрыт от модели)');
}
