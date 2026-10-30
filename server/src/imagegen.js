import { upstreamFetch, readErrorBody, joinUrl } from './llm/http.js';

/**
 * Image generation through the user's own API. Supported formats:
 *  custom  — any HTTP endpoint; body is a JSON template with {{placeholders}},
 *            the image is found in the response by a JSONPath-like expression
 *  a1111   — Automatic1111 / Forge / SD.Next /sdapi/v1/txt2img
 *  comfy   — ComfyUI workflow (API format) with placeholders
 *  openai  — OpenAI-compatible /images/generations
 */

function authHeaders(key) {
  const k = String(key || '').trim();
  if (!k) return {};
  const m = /^([A-Za-z0-9\-_]+)\s*:\s*(.+)$/.exec(k);
  if (m && !/^bearer$/i.test(m[1])) return { [m[1]]: m[2] };
  return { Authorization: /^bearer\s/i.test(k) ? k : `Bearer ${k}` };
}

/** Replaces {{name}} (and %name% for ComfyUI workflows) inside a JSON template. */
export function fillTemplate(template, vars) {
  const replacer = (_, name) => {
    const v = vars[name.trim()];
    if (v === undefined) return '';
    if (typeof v === 'number') return String(v);
    return JSON.stringify(String(v)).slice(1, -1);
  };
  return String(template)
    .replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, replacer)
    .replace(/%([a-zA-Z_][\w]*)%/g, replacer);
}

/** Minimal JSONPath: $.images[0], data[0].b64_json, output.0.url */
export function pickPath(obj, expr) {
  const path = String(expr || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/^\$\.?/, '');
  if (!path) return obj;
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) || [];
  let cur = obj;
  for (const t of tokens) {
    if (cur == null) return undefined;
    const key = t.startsWith('[') ? Number(t.slice(1, -1)) : /^\d+$/.test(t) && Array.isArray(cur) ? Number(t) : t;
    cur = cur[key];
  }
  return cur;
}

async function toImageBuffer(value, opts) {
  if (value == null) throw new Error('No image found in the response: check the image path');
  if (typeof value === 'object' && value.url) value = value.url;
  if (typeof value === 'object' && value.b64_json) value = value.b64_json;
  const s = String(value);
  if (s.startsWith('data:')) return { buffer: Buffer.from(s.split(',')[1], 'base64'), mime: s.slice(5, s.indexOf(';')) };
  if (/^https?:\/\//.test(s)) {
    const res = await upstreamFetch(s, { ...opts, timeoutMs: 120000 });
    if (!res.ok) throw await readErrorBody(res);
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'image/png' };
  }
  return { buffer: Buffer.from(s, 'base64'), mime: 'image/png' };
}

function vars(params) {
  return {
    prompt: params.prompt || '',
    negative: params.negative || '',
    negative_prompt: params.negative || '',
    style: params.style || '',
    width: Number(params.width) || 768,
    height: Number(params.height) || 512,
    steps: Number(params.steps) || 28,
    seed: Number.isInteger(params.seed) && params.seed >= 0 ? params.seed : Math.floor(Math.random() * 2 ** 31),
    cfg: Number(params.cfg) || 7,
    model: params.model || '',
    sampler: params.sampler || 'Euler a',
    count: Number(params.count) || 1,
  };
}

async function generateOne(cfg, key, params, opts) {
  const v = vars(params);
  const headers = { 'Content-Type': 'application/json', ...authHeaders(key) };
  const endpoint = String(cfg.endpoint || '').trim();
  if (!endpoint) throw new Error('The image generator endpoint is not set');

  switch (cfg.format) {
    case 'a1111': {
      const base = endpoint.replace(/\/sdapi\/v1\/txt2img\/?$/, '');
      const res = await upstreamFetch(joinUrl(base, 'sdapi/v1/txt2img'), {
        method: 'POST',
        headers,
        body: {
          prompt: v.style ? `${v.prompt}, ${v.style}` : v.prompt,
          negative_prompt: v.negative,
          width: v.width,
          height: v.height,
          steps: v.steps,
          seed: v.seed,
          cfg_scale: v.cfg,
          sampler_name: v.sampler,
          batch_size: 1,
          ...(v.model ? { override_settings: { sd_model_checkpoint: v.model } } : {}),
        },
        ...opts,
      });
      if (!res.ok) throw await readErrorBody(res);
      const json = await res.json();
      return [await toImageBuffer(json.images?.[0], opts)];
    }
    case 'comfy': {
      const base = endpoint.replace(/\/prompt\/?$/, '');
      let workflow;
      try {
        workflow = JSON.parse(fillTemplate(cfg.workflow || cfg.bodyTemplate || '{}', v));
      } catch {
        throw new Error('The ComfyUI workflow is not valid JSON');
      }
      const clientId = `cream-soda-${Date.now()}`;
      const res = await upstreamFetch(joinUrl(base, 'prompt'), {
        method: 'POST',
        headers,
        body: { prompt: workflow, client_id: clientId },
        ...opts,
      });
      if (!res.ok) throw await readErrorBody(res);
      const { prompt_id: promptId } = await res.json();
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        if (opts.signal?.aborted) throw new Error('Cancelled');
        await new Promise((r) => setTimeout(r, 1200));
        const h = await upstreamFetch(joinUrl(base, `history/${promptId}`), { headers, ...opts });
        if (!h.ok) continue;
        const hist = (await h.json())[promptId];
        if (!hist) continue;
        if (hist.status?.status_str === 'error') throw new Error('ComfyUI reported an error while running the workflow');
        const images = Object.values(hist.outputs || {}).flatMap((o) => o.images || []);
        if (!images.length) continue;
        const out = [];
        for (const img of images) {
          const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
          const r = await upstreamFetch(joinUrl(base, `view?${q}`), { headers, ...opts });
          if (!r.ok) throw await readErrorBody(r);
          out.push({ buffer: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/png' });
        }
        return out;
      }
      throw new Error('ComfyUI returned no image within 10 minutes');
    }
    case 'openai': {
      const url = /\/images\/generations\/?$/.test(endpoint) ? endpoint : joinUrl(endpoint, 'images/generations');
      const model = v.model || 'gpt-image-1';
      const body = { model, prompt: v.style ? `${v.prompt}, ${v.style}` : v.prompt, n: 1, size: `${v.width}x${v.height}` };
      if (!/^gpt-image/.test(model)) body.response_format = 'b64_json';
      const res = await upstreamFetch(url, { method: 'POST', headers, body, ...opts });
      if (!res.ok) throw await readErrorBody(res);
      const json = await res.json();
      return [await toImageBuffer(json.data?.[0]?.b64_json || json.data?.[0]?.url, opts)];
    }
    default: {
      const bodyText = fillTemplate(cfg.bodyTemplate || '{"prompt":"{{prompt}}"}', v);
      try {
        JSON.parse(bodyText);
      } catch {
        throw new Error('The request body is not valid JSON after substitution');
      }
      const res = await upstreamFetch(endpoint, { method: cfg.method || 'POST', headers, body: bodyText, ...opts });
      if (!res.ok) throw await readErrorBody(res);
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) return [{ buffer: Buffer.from(await res.arrayBuffer()), mime: ct }];
      const json = await res.json();
      const found = pickPath(json, cfg.responsePath || '$.images[0]');
      if (Array.isArray(found)) return Promise.all(found.map((f) => toImageBuffer(f, opts)));
      return [await toImageBuffer(found, opts)];
    }
  }
}

export async function generateImages(cfg, key, params, opts = {}) {
  const count = Math.max(1, Math.min(8, Number(params.count) || 1));
  const results = [];
  for (let i = 0; i < count; i++) {
    const seed = Number.isInteger(params.seed) && params.seed >= 0 ? params.seed + i : undefined;
    results.push(...(await generateOne(cfg, key, { ...params, seed }, { proxy: cfg.proxy, timeoutMs: 300000, ...opts })));
    if (results.length >= count) break;
  }
  return results.slice(0, count);
}

const IMAGE_MODEL = /image|dall-?e|flux|stable|sdxl|sd-?[123]|imagen|recraft|ideogram|playground|kandinsky|midjourney|seedream|hidream|qwen-image|aura/i;

/**
 * Models (and samplers, where the API has them) the generator can use:
 *   a1111   checkpoints from /sdapi/v1/sd-models, samplers from /sdapi/v1/samplers
 *   comfy   checkpoints and diffusion models from /object_info
 *   openai  /models, image models first (all of them if none looks like one)
 */
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export async function listImageModels(cfg, key) {
  const headers = authHeaders(key);
  const endpoint = String(cfg.endpoint || '').trim();
  if (!endpoint) throw badRequest('The image generator endpoint is not set');
  const opts = { headers, timeoutMs: 30000, proxy: cfg.proxy };
  const getJson = async (url) => {
    const res = await upstreamFetch(url, opts);
    if (!res.ok) throw await readErrorBody(res);
    return res.json();
  };
  switch (cfg.format) {
    case 'a1111': {
      const base = endpoint.replace(/\/sdapi\/v1\/txt2img\/?$/, '');
      const [models, samplers] = await Promise.all([getJson(joinUrl(base, 'sdapi/v1/sd-models')), getJson(joinUrl(base, 'sdapi/v1/samplers')).catch(() => [])]);
      return {
        models: (Array.isArray(models) ? models : []).map((m) => ({ id: m.title || m.model_name, name: m.model_name || m.title })).filter((m) => m.id),
        samplers: (Array.isArray(samplers) ? samplers : []).map((x) => x.name).filter(Boolean),
      };
    }
    case 'comfy': {
      const base = endpoint.replace(/\/prompt\/?$/, '');
      const info = await getJson(joinUrl(base, 'object_info'));
      const options = (node, input) => {
        const spec = info?.[node]?.input?.required?.[input];
        // Old ComfyUI: [[…names]]; newer: ['COMBO', { options: […] }].
        const list = Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
        return Array.isArray(list) ? list.map(String) : [];
      };
      const names = [...new Set([...options('CheckpointLoaderSimple', 'ckpt_name'), ...options('UNETLoader', 'unet_name')])];
      // The sampler lives in the workflow itself, so only models are offered.
      return { models: names.map((id) => ({ id, name: id })), samplers: [] };
    }
    case 'openai': {
      const base = endpoint.replace(/\/images\/generations\/?$/, '');
      const json = await getJson(joinUrl(base, 'models'));
      const all = (Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []).map((m) => ({ id: String(m.id || m.name || ''), name: String(m.name || m.id || '') })).filter((m) => m.id);
      const images = all.filter((m) => IMAGE_MODEL.test(m.id) || IMAGE_MODEL.test(m.name));
      return { models: images.length ? images : all, samplers: [] };
    }
    default:
      throw badRequest('A custom JSON template has no model list: type the model name into the template');
  }
}

export async function testImageApi(cfg, key) {
  const started = Date.now();
  const headers = authHeaders(key);
  const endpoint = String(cfg.endpoint || '').trim();
  if (!endpoint) return { ok: false, error: 'The endpoint is not set' };
  let url = endpoint;
  if (cfg.format === 'a1111') url = joinUrl(endpoint.replace(/\/sdapi\/v1\/txt2img\/?$/, ''), 'sdapi/v1/sd-models');
  else if (cfg.format === 'comfy') url = joinUrl(endpoint.replace(/\/prompt\/?$/, ''), 'system_stats');
  else if (cfg.format === 'openai') url = joinUrl(endpoint.replace(/\/images\/generations\/?$/, ''), 'models');
  try {
    const res = await upstreamFetch(url, { headers, timeoutMs: 15000, proxy: cfg.proxy });
    // A custom endpoint usually rejects GET; any HTTP answer still proves it is reachable.
    const ok = res.ok || (cfg.format === 'custom' && res.status < 500);
    return { ok, latency: Date.now() - started, status: res.status, error: ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, latency: Date.now() - started, error: err.message };
  }
}
