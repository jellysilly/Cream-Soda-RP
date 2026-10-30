#!/usr/bin/env node
/**
 * A tiny OpenAI-compatible server for trying Cream Soda without a real model.
 *   node scripts/mock-llm.js [--port 5055]
 * Then add an «OpenAI-compatible» connection with base URL http://127.0.0.1:5055/v1
 * and any model name. It streams canned roleplay replies, echoes the last user line,
 * and answers the prompts Cream Soda sends (summary, facts, variants, translation,
 * image prompts, generator JSON) in the expected shape. The same port also plays an
 * Automatic1111 image API (Images → A1111 with endpoint http://127.0.0.1:5055).
 */
import http from 'node:http';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 5055;

const REPLIES = [
  '*Rin sets a tall glass in front of you: blue soda, a scoop of vanilla ice cream and a cherry.* "On the house. You came five minutes before closing again."\n\n[status|23:40 · downpour|Crystal Café|warm tiredness|62]',
  '*She leans on the counter and watches the rain behind the shop window.* "On nights like this the café feels like an aquarium drifting through the city."',
  '*Rin freezes with a cloth in her hand, her cheeks turning pinker than the neon.* "…Only if you carry my apron. It\'s wet and smells of caramel."',
];

function lastUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') return typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join(' ');
  }
  return '';
}

function replyFor(body) {
  const all = JSON.stringify(body.messages || body.prompt || '');
  if (/valid JSON/.test(all) && /first_mes|"name"|entries/.test(all)) {
    return JSON.stringify({
      name: 'Shiratama',
      tagline: 'ghost pastry chef',
      description: 'A shy ghost pastry chef who lives in the old display case of the Crystal café.',
      personality: 'Speaks in riddles and recipes, adores strawberry shortcake.',
      scenario: 'Late evening, the display glass fogs up from the inside.',
      first_mes: '*The display glass quietly fogs up from the inside.* "The strawberries are sour this year."',
      alternate_greetings: ['"Rain again… so the dough will rise."', '*A drawing of a cake appears on the glass.*'],
      mes_example: '<START>\n{{user}}: Who is there?\n{{char}}: "Only a grain of sugar in the display case."',
      tags: ['fantasy', 'cozy'],
      lorebook: [{ title: 'The old display case', keys: ['display case', 'glass'], content: 'The display case remembers everyone who ever leaned against it.' }],
      avatar_prompt: 'ghost pastry chef, pastel, glass display',
    });
  }
  if (/###/.test(all) && /options/.test(all)) {
    return '### 1\n"Deal. The apron is mine, and you hold the cherry."\n### 2\n*Yuki silently takes her apron off the hook and opens the umbrella by the door.*\n### 3\n"Caramel? Then he is definitely not giving it back."';
  }
  if (/Memory Book/.test(all) && /Summary:/.test(all)) {
    return 'Title: An umbrella to the station\nSummary: Rin agreed to let Yuki walk her to the station if he carries her wet apron.\nKeys: station, umbrella, apron';
  }
  if (/lasting facts/.test(all)) return '- Rin closes the café at midnight\n- Yuki promised to walk Rin to the station';
  if (/Translate this roleplay message/.test(all)) return '*Рин улыбается.* «За счёт заведения».';
  if (/prompt for an image generator/.test(all)) return 'anime style, night cafe, neon, rain on the window, girl barista, soft light';
  const user = lastUserText(body.messages);
  const base = REPLIES[Math.floor(Math.random() * REPLIES.length)];
  return user && user.length < 200 ? `${base}\n\n*(reply to: ${user.slice(0, 60)})*` : base;
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// A 1×1 pink PNG for the A1111-style image endpoint.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && /\/models$/.test(req.url)) {
    return send(res, 200, { data: [{ id: 'mock-soda-1', context_length: 32768 }, { id: 'mock-soda-mini', context_length: 8192 }] });
  }
  // Enough of the Automatic1111 API to try the Images page: model list, samplers, txt2img.
  if (req.method === 'GET' && req.url === '/sdapi/v1/sd-models') {
    return send(res, 200, [
      { title: 'soda-anime.safetensors [1a2b3c]', model_name: 'soda-anime' },
      { title: 'soda-pastel-xl.safetensors [4d5e6f]', model_name: 'soda-pastel-xl' },
    ]);
  }
  if (req.method === 'GET' && req.url === '/sdapi/v1/samplers') return send(res, 200, [{ name: 'Euler a' }, { name: 'DPM++ 2M Karras' }]);
  if (req.method === 'POST' && req.url === '/sdapi/v1/txt2img') return send(res, 200, { images: [PIXEL] });
  if (req.method !== 'POST') return send(res, 404, { error: { message: 'not found' } });
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', async () => {
    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return send(res, 400, { error: { message: 'bad json' } });
    }
    const text = replyFor(body);
    const isText = /\/completions$/.test(req.url) && !/chat/.test(req.url);
    if (!body.stream) {
      return send(res, 200, isText
        ? { choices: [{ text, finish_reason: 'stop' }] }
        : { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const tokens = text.match(/\S+\s*|\s+/g) || [];
    for (const tok of tokens) {
      if (res.destroyed) return;
      const chunk = isText ? { choices: [{ text: tok }] } : { choices: [{ delta: { content: tok } }] };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      await new Promise((r) => setTimeout(r, 12));
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: tokens.length } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

server.listen(port, '127.0.0.1', () => console.log(`mock LLM: http://127.0.0.1:${port}/v1`));
