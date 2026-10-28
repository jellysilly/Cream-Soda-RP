#!/usr/bin/env node
/**
 * A tiny OpenAI-compatible server for trying Cream Soda without a real model.
 *   node scripts/mock-llm.js [--port 5055]
 * Then add a connection «OpenAI-совместимый» with base URL http://127.0.0.1:5055/v1
 * and any model name. It streams canned roleplay replies, echoes the last user line,
 * and answers summary / variant / JSON requests in the expected shape.
 */
import http from 'node:http';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 5055;

const REPLIES = [
  '*Рин ставит перед тобой высокий бокал: голубая газировка, шарик ванильного мороженого и вишенка.* «За счёт заведения. Ты опять пришёл за пять минут до закрытия».\n\n[status|23:40 · ливень|Кафе «Кристалл»|тёплая усталость|62]',
  '*Она опирается на стойку и смотрит на дождь за витриной.* «В такие ночи мне кажется, что кафе плывёт по городу, как аквариум».',
  '*Рин замирает с тряпкой в руке, и щёки у неё розовеют ярче неона.* «…Только если ты понесёшь мой фартук. Он мокрый и пахнет карамелью».',
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
  if (/JSON/.test(all) && /персонаж|character/i.test(all)) {
    return JSON.stringify({
      name: 'Сиратама',
      tagline: 'ghost pastry chef',
      description: 'Застенчивый призрак кондитера из старой витрины кафе «Кристалл».',
      personality: 'Говорит загадками и рецептами, обожает клубничный шорткейк.',
      scenario: 'Поздний вечер, витрина запотевает изнутри.',
      first_mes: '*Стекло витрины тихо запотевает изнутри.* «Клубника в этом году кислая».',
      alternate_greetings: ['«Опять дождь… значит, тесто поднимется».', '*На стекле проступает рисунок торта.*'],
      mes_example: '<START>\n{{user}}: Кто здесь?\n{{char}}: «Всего лишь крошка сахара в витрине».',
      tags: ['фэнтези', 'уют'],
      lorebook: [{ title: 'Старая витрина', keys: ['витрина', 'стекло'], content: 'Витрина помнит всех, кто к ней прижимался.' }],
      avatar_prompt: 'ghost pastry chef, pastel, glass display',
    });
  }
  if (/вариант|variants?/i.test(all) && /###/.test(all)) {
    return '### 1\n«Договорились. Фартук — мой, а ты держишь вишенку».\n### 2\n*Молча снимаю с крючка её фартук и раскрываю зонт у двери.*\n### 3\n«Карамель? Тогда я точно не отдам его обратно».';
  }
  if (/конспект|summar/i.test(all)) {
    return 'Название: Зонт до станции\nКонспект: Рин согласилась, чтобы Юки проводил её до станции, если он понесёт её мокрый фартук.\nКлючи: станция, зонт, фартук';
  }
  const user = lastUserText(body.messages);
  const base = REPLIES[Math.floor(Math.random() * REPLIES.length)];
  return user && user.length < 200 ? `${base}\n\n*(ответ на: ${user.slice(0, 60)})*` : base;
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && /\/models$/.test(req.url)) {
    return send(res, 200, { data: [{ id: 'mock-soda-1', context_length: 32768 }, { id: 'mock-soda-mini', context_length: 8192 }] });
  }
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
