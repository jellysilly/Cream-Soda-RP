/**
 * Tiny event bus. Extensions subscribe through CreamSoda.on() / SillyTavern's
 * eventSource shim; the app emits the same event names SillyTavern uses where
 * there is an equivalent.
 */
type Handler = (payload: any) => void | Promise<void>;

const handlers = new Map<string, Set<Handler>>();

export const EVENT_ALIASES: Record<string, string> = {
  chat_changed: 'chatLoaded',
  message_sent: 'messageSent',
  message_received: 'messageReceived',
  message_edited: 'messageEdited',
  message_deleted: 'messageDeleted',
  message_swiped: 'messageSwiped',
  generation_started: 'generationStarted',
};

export function onEvent(name: string, fn: Handler): () => void {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)!.add(fn);
  return () => handlers.get(name)?.delete(fn);
}

export function emitEvent(name: string, payload: unknown = {}) {
  const run = (n: string) => {
    for (const fn of handlers.get(n) || []) {
      try {
        const r = fn(payload);
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((e) => console.warn('[events]', n, e));
      } catch (e) {
        console.warn('[events]', n, e);
      }
    }
  };
  run(name);
  const alias = EVENT_ALIASES[name];
  if (alias) run(alias);
}
