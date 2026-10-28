import { getState } from './store';
import { quotesOnly, stripMarkup } from './markdown';

/** Text-to-speech through the browser's Web Speech API (works offline with system voices). */

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function voices(): SpeechSynthesisVoice[] {
  return ttsAvailable() ? window.speechSynthesis.getVoices() : [];
}

export function stopSpeaking() {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}

export function speak(text: string) {
  if (!ttsAvailable()) return;
  const cfg = getState().settings.extensions.tts;
  const source = cfg.onlyQuotes ? quotesOnly(text) || stripMarkup(text) : stripMarkup(text);
  if (!source.trim()) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(source);
  const v = voices().find((x) => x.voiceURI === cfg.voice) || voices().find((x) => x.lang.startsWith('ru'));
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else u.lang = 'ru-RU';
  u.rate = cfg.rate || 1;
  u.pitch = cfg.pitch || 1;
  window.speechSynthesis.speak(u);
}
