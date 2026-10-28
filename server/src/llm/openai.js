import { joinUrl, mergeDeep, definedOnly, sseEvents, upstreamFetch, readErrorBody } from './http.js';

export const DEFAULT_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: 'http://127.0.0.1:5000/v1',
};

function isReasoningOpenAIModel(model) {
  return /^(o\d|gpt-5)/i.test(String(model || ''));
}

function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  const parts = content
    .map((p) => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'image') return { type: 'image_url', image_url: { url: p.url || `data:${p.mime};base64,${p.data}` } };
      return null;
    })
    .filter(Boolean);
  return parts.every((p) => p.type === 'text') ? parts.map((p) => p.text).join('\n') : parts;
}

export function headersFor(conn, key) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (conn.api === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/jellysilly/Cream-Soda-RP';
    headers['X-Title'] = 'Cream Soda';
  }
  return headers;
}

export function buildRequest(conn, key, req) {
  const base = conn.baseUrl || DEFAULT_URLS[conn.api] || DEFAULT_URLS.custom;
  const p = req.params || {};
  const model = req.model || conn.model;
  const official = conn.api === 'openai';
  const reasoningModel = official && isReasoningOpenAIModel(model);
  const isText = req.mode === 'text';

  const body = definedOnly({
    model,
    stream: !!req.stream,
    max_tokens: reasoningModel ? undefined : p.max_tokens,
    max_completion_tokens: reasoningModel ? p.max_tokens : undefined,
    temperature: reasoningModel ? undefined : p.temperature,
    top_p: reasoningModel ? undefined : p.top_p,
    frequency_penalty: reasoningModel ? undefined : nz(p.frequency_penalty),
    presence_penalty: reasoningModel ? undefined : nz(p.presence_penalty),
    stop: p.stop?.length ? p.stop.slice(0, official ? 4 : 16) : undefined,
    seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : undefined,
    n: p.n && p.n > 1 ? p.n : undefined,
    logit_bias: p.logit_bias && Object.keys(p.logit_bias).length ? p.logit_bias : undefined,
    reasoning_effort: p.reasoning_effort || undefined,
  });

  if (!official) {
    // OpenRouter and most self-hosted OpenAI-compatible backends accept extra samplers.
    Object.assign(
      body,
      definedOnly({
        top_k: p.top_k > 0 ? p.top_k : undefined,
        min_p: p.min_p > 0 ? p.min_p : undefined,
        top_a: p.top_a > 0 ? p.top_a : undefined,
        repetition_penalty: p.repetition_penalty && p.repetition_penalty !== 1 ? p.repetition_penalty : undefined,
      }),
    );
    if (conn.api === 'openrouter' && p.reasoning_effort) {
      delete body.reasoning_effort;
      body.reasoning = { effort: p.reasoning_effort };
    }
  }

  if (req.stream && !isText) body.stream_options = { include_usage: true };

  if (isText) {
    body.prompt = req.prompt;
  } else {
    body.messages = (req.messages || []).map((m) =>
      definedOnly({ role: m.role, content: toOpenAIContent(m.content), name: m.name || undefined }),
    );
  }

  mergeDeep(body, req.extraBody);
  return { url: joinUrl(base, isText ? 'completions' : 'chat/completions'), headers: headersFor(conn, key), body };
}

function nz(v) {
  return v ? v : undefined;
}

export async function* parseStream(res) {
  for await (const ev of sseEvents(res)) {
    if (ev.data === '[DONE]') break;
    let json;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    if (json.error) {
      const e = new Error(json.error.message || JSON.stringify(json.error));
      e.status = json.error.code || 500;
      throw e;
    }
    const choice = json.choices?.[0];
    if (choice) {
      const delta = choice.delta || {};
      const text = delta.content ?? choice.text ?? '';
      const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
      if (text || reasoning) yield { text: text || '', reasoning: reasoning || '' };
      if (choice.finish_reason) yield { finish: choice.finish_reason };
    }
    if (json.usage) yield { usage: json.usage };
  }
}

export function parseResponse(json) {
  const choice = json.choices?.[0] || {};
  const msg = choice.message || {};
  return {
    text: msg.content ?? choice.text ?? '',
    reasoning: msg.reasoning_content ?? msg.reasoning ?? '',
    finish: choice.finish_reason,
    usage: json.usage,
    choices: (json.choices || []).map((c) => c.message?.content ?? c.text ?? ''),
  };
}

export async function listModels(conn, key, opts) {
  const base = conn.baseUrl || DEFAULT_URLS[conn.api] || DEFAULT_URLS.custom;
  const res = await upstreamFetch(joinUrl(base, 'models'), { headers: headersFor(conn, key), ...opts });
  if (!res.ok) throw await readErrorBody(res);
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.data || json.models || [];
  return list
    .map((m) => ({
      id: m.id || m.name,
      name: m.name || m.id,
      context: m.context_length || m.context_window || m.max_context_length || m.top_provider?.context_length || null,
      vision: Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities.includes('image') : undefined,
    }))
    .filter((m) => m.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
