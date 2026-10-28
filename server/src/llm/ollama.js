import { joinUrl, mergeDeep, definedOnly, ndjson, upstreamFetch, readErrorBody } from './http.js';

export const DEFAULT_URL = 'http://127.0.0.1:11434';

function base(conn) {
  return String(conn.baseUrl || DEFAULT_URL).replace(/\/+$/, '').replace(/\/api$/, '').replace(/\/v1$/, '');
}

function headers(key) {
  const h = { 'Content-Type': 'application/json' };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

function toMessage(m) {
  if (typeof m.content === 'string') return { role: m.role, content: m.content };
  const text = (m.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  const images = (m.content || []).filter((p) => p.type === 'image' && p.data).map((p) => p.data);
  return definedOnly({ role: m.role, content: text, images: images.length ? images : undefined });
}

export function buildRequest(conn, key, req) {
  const p = req.params || {};
  const options = definedOnly({
    temperature: p.temperature,
    top_p: p.top_p,
    top_k: p.top_k > 0 ? p.top_k : undefined,
    min_p: p.min_p > 0 ? p.min_p : undefined,
    typical_p: p.typical_p && p.typical_p < 1 ? p.typical_p : undefined,
    repeat_penalty: p.repetition_penalty,
    repeat_last_n: p.rep_pen_range || undefined,
    frequency_penalty: p.frequency_penalty || undefined,
    presence_penalty: p.presence_penalty || undefined,
    num_ctx: p.context_size,
    num_predict: p.max_tokens,
    stop: p.stop?.length ? p.stop : undefined,
    seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : undefined,
  });
  const model = req.model || conn.model;
  const body =
    req.mode === 'text'
      ? { model, prompt: req.prompt, raw: true, stream: !!req.stream, options }
      : { model, messages: (req.messages || []).map(toMessage), stream: !!req.stream, options };
  mergeDeep(body, req.extraBody);
  return { url: joinUrl(base(conn), req.mode === 'text' ? 'api/generate' : 'api/chat'), headers: headers(key), body };
}

export async function* parseStream(res) {
  for await (const json of ndjson(res)) {
    if (json.error) {
      const e = new Error(json.error);
      e.status = 500;
      throw e;
    }
    const text = json.message?.content ?? json.response ?? '';
    const reasoning = json.message?.thinking ?? json.thinking ?? '';
    if (text || reasoning) yield { text, reasoning };
    if (json.done) {
      yield { finish: json.done_reason || 'stop' };
      yield { usage: { prompt_tokens: json.prompt_eval_count, completion_tokens: json.eval_count } };
    }
  }
}

export function parseResponse(json) {
  return {
    text: json.message?.content ?? json.response ?? '',
    reasoning: json.message?.thinking ?? json.thinking ?? '',
    finish: json.done_reason,
    usage: { prompt_tokens: json.prompt_eval_count, completion_tokens: json.eval_count },
  };
}

export async function listModels(conn, key, opts) {
  const res = await upstreamFetch(joinUrl(base(conn), 'api/tags'), { headers: headers(key), ...opts });
  if (!res.ok) throw await readErrorBody(res);
  const json = await res.json();
  return (json.models || []).map((m) => ({ id: m.name, name: m.name, context: null }));
}
