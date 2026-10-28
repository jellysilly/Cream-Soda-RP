import { joinUrl, mergeDeep, definedOnly, sseEvents, upstreamFetch, readErrorBody } from './http.js';
import * as openai from './openai.js';

export const DEFAULT_URL = 'http://127.0.0.1:5001';

/**
 * Text Completion backends. Two wire formats are supported:
 *  - "openai": the OpenAI-style /v1/completions endpoint exposed by KoboldCpp,
 *    llama.cpp, text-generation-webui, TabbyAPI, vLLM, Aphrodite, LM Studio…
 *  - "kobold": the classic KoboldAI /api/v1/generate API (+ KoboldCpp SSE stream).
 */
function v1Base(base) {
  const b = String(base || DEFAULT_URL).replace(/\/+$/, '');
  return /\/v1$/.test(b) ? b : `${b}/v1`;
}

function rootBase(base) {
  return String(base || DEFAULT_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
}

function headers(key) {
  const h = { 'Content-Type': 'application/json' };
  if (key) {
    h.Authorization = `Bearer ${key}`;
    h['x-api-key'] = key;
  }
  return h;
}

export function buildRequest(conn, key, req) {
  const p = req.params || {};
  if (conn.tcFlavor === 'kobold') {
    const body = definedOnly({
      prompt: req.prompt,
      max_length: p.max_tokens,
      max_context_length: p.context_size,
      temperature: p.temperature,
      top_p: p.top_p,
      top_k: p.top_k,
      top_a: p.top_a,
      min_p: p.min_p,
      typical: p.typical_p,
      tfs: p.tfs,
      rep_pen: p.repetition_penalty,
      rep_pen_range: p.rep_pen_range,
      stop_sequence: p.stop?.length ? p.stop : undefined,
      sampler_seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : undefined,
      dry_multiplier: p.dry_multiplier || undefined,
      xtc_probability: p.xtc_probability || undefined,
      xtc_threshold: p.xtc_threshold || undefined,
      trim_stop: true,
    });
    mergeDeep(body, req.extraBody);
    const path = req.stream ? 'api/extra/generate/stream' : 'api/v1/generate';
    return { url: joinUrl(rootBase(conn.baseUrl), path), headers: headers(key), body };
  }

  const body = definedOnly({
    model: req.model || conn.model || undefined,
    prompt: req.prompt,
    stream: !!req.stream,
    max_tokens: p.max_tokens,
    temperature: p.temperature,
    top_p: p.top_p,
    top_k: p.top_k > 0 ? p.top_k : undefined,
    min_p: p.min_p > 0 ? p.min_p : undefined,
    top_a: p.top_a > 0 ? p.top_a : undefined,
    typical_p: p.typical_p && p.typical_p < 1 ? p.typical_p : undefined,
    repetition_penalty: p.repetition_penalty,
    repeat_penalty: p.repetition_penalty,
    rep_pen: p.repetition_penalty,
    repetition_penalty_range: p.rep_pen_range || undefined,
    repeat_last_n: p.rep_pen_range || undefined,
    frequency_penalty: p.frequency_penalty || undefined,
    presence_penalty: p.presence_penalty || undefined,
    stop: p.stop?.length ? p.stop : undefined,
    seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : undefined,
    dry_multiplier: p.dry_multiplier || undefined,
    xtc_probability: p.xtc_probability || undefined,
    xtc_threshold: p.xtc_threshold || undefined,
    n: 1,
  });
  mergeDeep(body, req.extraBody);
  return { url: joinUrl(v1Base(conn.baseUrl), 'completions'), headers: headers(key), body };
}

export async function* parseStream(res, conn) {
  if (conn.tcFlavor === 'kobold') {
    for await (const ev of sseEvents(res)) {
      try {
        const json = JSON.parse(ev.data);
        if (json.token) yield { text: json.token };
        if (json.finish_reason) yield { finish: json.finish_reason };
      } catch {
        /* keep-alive */
      }
    }
    return;
  }
  yield* openai.parseStream(res);
}

export function parseResponse(json, conn) {
  if (conn.tcFlavor === 'kobold') return { text: json.results?.[0]?.text || '', finish: 'stop' };
  return openai.parseResponse(json);
}

export async function listModels(conn, key, opts) {
  if (conn.tcFlavor === 'kobold') {
    const res = await upstreamFetch(joinUrl(rootBase(conn.baseUrl), 'api/v1/model'), { headers: headers(key), ...opts });
    if (!res.ok) throw await readErrorBody(res);
    const json = await res.json();
    return json.result ? [{ id: json.result, name: json.result }] : [];
  }
  const res = await upstreamFetch(joinUrl(v1Base(conn.baseUrl), 'models'), { headers: headers(key), ...opts });
  if (!res.ok) throw await readErrorBody(res);
  const json = await res.json();
  return (json.data || json.models || []).map((m) => ({ id: m.id || m.name, name: m.id || m.name, context: m.max_model_len || m.context_length || null }));
}
