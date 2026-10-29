import { joinUrl, mergeDeep, definedOnly, sseEvents, upstreamFetch, readErrorBody } from './http.js';

export const DEFAULT_URL = 'https://generativelanguage.googleapis.com/v1beta';

const SAFETY = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_CIVIC_INTEGRITY',
].map((category) => ({ category, threshold: 'BLOCK_NONE' }));

function headers(key) {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key || '' };
}

function toParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return (content || [])
    .map((p) => {
      if (p.type === 'text') return { text: p.text };
      if (p.type === 'image' && p.data) return { inlineData: { mimeType: p.mime, data: p.data } };
      return null;
    })
    .filter(Boolean);
}

export function convertMessages(messages) {
  const system = [];
  let i = 0;
  while (i < messages.length && messages[i].role === 'system') {
    system.push(...toParts(messages[i].content));
    i++;
  }
  const contents = [];
  for (; i < messages.length; i++) {
    const m = messages[i];
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = toParts(m.content);
    if (m.name && m.role !== 'system' && parts[0]?.text !== undefined) parts[0] = { text: `${m.name}: ${parts[0].text}` };
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else contents.push({ role, parts });
  }
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: '[Start]' }] });
  return { systemInstruction: system.length ? { parts: system } : undefined, contents };
}

export function buildRequest(conn, key, req) {
  const p = req.params || {};
  const model = String(req.model || conn.model || '').replace(/^models\//, '');
  const { systemInstruction, contents } = convertMessages(req.messages || []);
  const body = definedOnly({
    contents,
    systemInstruction,
    safetySettings: SAFETY,
    generationConfig: definedOnly({
      temperature: p.temperature,
      topP: p.top_p,
      topK: p.top_k > 0 ? p.top_k : undefined,
      maxOutputTokens: p.max_tokens,
      stopSequences: p.stop?.length ? p.stop.slice(0, 5) : undefined,
      seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : undefined,
      candidateCount: 1,
      frequencyPenalty: p.frequency_penalty || undefined,
      presencePenalty: p.presence_penalty || undefined,
      thinkingConfig: p.thinking_budget > 0 ? { thinkingBudget: p.thinking_budget, includeThoughts: true } : undefined,
    }),
  });
  mergeDeep(body, req.extraBody);
  const method = req.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  return { url: joinUrl(conn.baseUrl || DEFAULT_URL, `models/${encodeURIComponent(model)}:${method}`), headers: headers(key), body };
}

function extract(json) {
  const cand = json.candidates?.[0];
  let text = '';
  let reasoning = '';
  for (const part of cand?.content?.parts || []) {
    if (part.thought) reasoning += part.text || '';
    else text += part.text || '';
  }
  if (!cand && json.promptFeedback?.blockReason) {
    const e = new Error(`Request blocked by Google's filter: ${json.promptFeedback.blockReason}`);
    e.status = 400;
    throw e;
  }
  return { text, reasoning, finish: cand?.finishReason, usage: json.usageMetadata };
}

export async function* parseStream(res) {
  for await (const ev of sseEvents(res)) {
    let json;
    try {
      json = JSON.parse(ev.data);
    } catch {
      continue;
    }
    if (json.error) {
      const e = new Error(json.error.message || 'Google AI error');
      e.status = json.error.code || 500;
      throw e;
    }
    const r = extract(json);
    if (r.text || r.reasoning) yield { text: r.text, reasoning: r.reasoning };
    if (r.finish && r.finish !== 'STOP') yield { finish: r.finish };
    if (r.usage) yield { usage: r.usage };
  }
}

export function parseResponse(json) {
  return extract(json);
}

export async function listModels(conn, key, opts) {
  const res = await upstreamFetch(joinUrl(conn.baseUrl || DEFAULT_URL, 'models?pageSize=1000'), { headers: headers(key), ...opts });
  if (!res.ok) throw await readErrorBody(res);
  const json = await res.json();
  return (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name, context: m.inputTokenLimit || null, vision: true }));
}
