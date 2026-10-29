import { api } from './api';
import { getState, setState, setChat, toast, activeCharacter } from './store';
import { quietGenerate, utilityGenerate, macroEnvFor } from './generate';
import { substituteMacros } from './macros';
import { newMessage } from './defaults';
import { prompt } from './prompts';
import { t } from './i18n';

export type ImageSource = 'scene' | 'portrait' | 'free';

/** Asks the chat model to describe the current scene as an image prompt. */
export async function buildImagePrompt(source: ImageSource): Promise<string> {
  const s = getState();
  const cfg = s.imageSettings;
  if (source === 'scene') {
    const n = Math.max(1, cfg.sceneMessages || 6);
    const instruction = substituteMacros(prompt('imageScene', { count: n }), macroEnvFor());
    return quietGenerate(instruction, { label: 'Images · scene prompt', maxTokens: 200 });
  }
  if (source === 'portrait') {
    const env = macroEnvFor();
    return utilityGenerate('utility', [{ role: 'user', content: substituteMacros(prompt('imagePortrait'), env) }], {
      maxTokens: 200,
      temperature: 0.5,
      label: 'Images · portrait prompt',
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
  if (!cfg.endpoint) throw new Error(t('Set the endpoint of your API in the Images section'));
  const seed = /^\d+$/.test(String(cfg.seed).trim()) ? Number(cfg.seed) : -1;
  setState({ gen: { kind: 'image', startedAt: Date.now() } });
  try {
    const res = await api.generateImages({
      dir: s.chat?.id,
      label: t('Images · generation'),
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

/** «Scene frame»: prompt from the chat → image → (optionally) inserted into the chat. */
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
  const msg = newMessage({ role: 'system', name: 'Scene frame', text: caption ? `*${caption.slice(0, 280)}*` : '', image: url });
  msg.hidden = true;
  if (c) msg.charId = c.id;
  setChat((chat) => ({ ...chat, messages: [...chat.messages, msg] }));
  toast(t('Frame added to the chat (hidden from the model)'));
}
