import { joinUrl, mergeDeep, definedOnly, sseEvents, upstreamFetch, readErrorBody } from './http.js';

export const DEFAULT_URL = 'https://api.anthropic.com/v1';

function headers(key) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key || '',
    'anthropic-version': '2023-06-01',
  };
}

function toParts(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return (content || [])
    .map((p) => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'image' && p.data) return { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } };
      if (p.type === 'image' && p.url) return { type: 'image', source: { type: 'url', url: p.url } };
      return null;
    })
    .filter(Boolean);
}

/**
 * Claude wants: a separate system prompt, strictly alternating user/assistant turns
 * and a user turn first. Leading system messages become the system prompt; system
 * messages in the middle of the chat are folded into user turns.
 */
export function convertMessages(messages) {
  const system = [];
  let i = 0;
  while (i < messages.length && messages[i].role === 'system') {
    system.push(textOf(messages[i].content));
    i++;
  }
  const out = [];
  for (; i < messages.length; i++) {
    const m = messages[i];
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let parts = toParts(m.content);
    if (m.role === 'system') parts = parts.map((p) => (p.type === 'text' ? { ...p, text: p.text } : p));
    if (m.name && m.role !== 'system' && parts[0]?.type === 'text') parts[0] = { ...parts[0], text: `${m.name}: ${parts[0].text}` };
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content.push(...parts);
    else out.push({ role, content: parts });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '[Start]' }] });
  for (const m of out) {
    // Join adjacent text parts and drop empty ones: the API rejects blank text blocks.
    const merged = [];
    for (const p of m.content) {
      const last = merged[merged.length - 1];
      if (p.type === 'text' && last?.type === 'text') last.text += `\n\n${p.text}`;
      else merged.push({ ...p });
    }
    m.content = merged.filter((p) => p.type !== 'text' || p.text.trim());
    if (!m.content.length) m.content = [{ type: 'text', text: '…' }];
  }
  const last = out[out.length - 1];
  if (last.role === 'assistant') {
    // Prefill: trailing whitespace in the final assistant turn is an API error.
    const t = last.content[last.content.length - 1];
    if (t.type === 'text') t.text = t.text.trimEnd() || '…';
  }
  return { system: system.filter(Boolean).join('\n\n'), messages: out };
}

function textOf(content) {
  if (typeof content === 'string') return content;
  return (content || [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export function buildRequest(conn, key, req) {
  const p = req.params || {};
  const { system, messages } = convertMessages(req.messages || []);
  const thinking = p.thinking_budget > 0;
  const body = definedOnly({
    model: req.model || conn.model,
    max_tokens: Math.max(1, (p.max_tokens || 1024) + (thinking ? p.thinking_budget : 0)),
    stream: !!req.stream,
    system: system || undefined,
    messages,
    temperature: thinking ? undefined : clamp(p.temperature, 0, 1),
    top_p: thinking || p.top_p === undefined || p.top_p >= 1 ? undefined : p.top_p,
    top_k: !thinking && p.top_k > 0 ? p.top_k : undefined,
    stop_sequences: p.stop?.length ? p.stop.filter((s) => s.trim()) : undefined,
    thinking: thinking ? { type: 'enabled', budget_tokens: p.thinking_budget } : undefined,
  });
  mergeDeep(body, req.extraBody);
  return { url: joinUrl(conn.baseUrl || DEFAULT_URL, 'messages'), headers: headers(key), body };
}

function clamp(v, lo, hi) {
  if (typeof v !== 'number') return undefined;
  return Math.min(hi, Math.max(lo, v));
}

export async function* parseStream(res) {
  for await (const ev of sseEvents(res)) {
    let json;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    if (json.type === 'error' || ev.event === 'error') {
      const e = new Error(json.error?.message || 'Anthropic error');
      e.status = 500;
      throw e;
    }
    if (json.type === 'content_block_delta') {
      const d = json.delta || {};
      if (d.type === 'text_delta') yield { text: d.text };
      else if (d.type === 'thinking_delta') yield { reasoning: d.thinking };
    } else if (json.type === 'message_delta') {
      if (json.delta?.stop_reason) yield { finish: json.delta.stop_reason };
      if (json.usage) yield { usage: json.usage };
    } else if (json.type === 'message_start' && json.message?.usage) {
      yield { usage: json.message.usage };
    }
  }
}

export function parseResponse(json) {
  const blocks = json.content || [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join(''),
    reasoning: blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking).join(''),
    finish: json.stop_reason,
    usage: json.usage,
  };
}

export async function listModels(conn, key, opts) {
  const res = await upstreamFetch(joinUrl(conn.baseUrl || DEFAULT_URL, 'models?limit=1000'), { headers: headers(key), ...opts });
  if (!res.ok) throw await readErrorBody(res);
  const json = await res.json();
  return (json.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id, context: null, vision: true }));
}
