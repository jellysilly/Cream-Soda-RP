import DOMPurify from 'dompurify';
import { escapeHtml } from './utils';

/**
 * Message formatter: a small Markdown dialect tuned for roleplay
 * (*действия* курсивом, «реплики», **жирный**, `код`, ```блоки```, списки, цитаты)
 * plus sanitised HTML coming from the model or from regex scripts.
 */

const BLOCK_TAG = /^<(div|table|details|section|article|aside|ul|ol|pre|blockquote|hr|h[1-6]|figure|meter|progress|img|video|audio|center|style|header|footer|nav|form|fieldset|dl)\b/i;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const PURIFY = {
  ADD_TAGS: ['meter', 'progress', 'details', 'summary', 'center', 'font', 'q'],
  ADD_ATTR: ['open', 'value', 'max', 'min', 'low', 'high', 'optimum', 'color', 'face', 'target'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'style', 'form', 'input', 'textarea', 'button', 'select'],
  FORBID_ATTR: ['srcset', 'formaction'],
  ALLOW_DATA_ATTR: false,
};

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, PURIFY) as unknown as string;
}

/** Does the text look like a full HTML document (needs an isolated iframe)? */
export function isDocumentHtml(text: string): boolean {
  return /<!doctype html|<html[\s>]|<style[\s>]|<script[\s>]|<body[\s>]/i.test(text);
}

function inline(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*\*([^*\n][\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n][\s\S]*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(«"])_([^_\s][^_]*?)_(?=$|[\s).,!?:;»"])/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(«[^«»\n]*»|“[^“”\n]*”|"[^"\n<>]{1,400}")/g, (q) => `<span class="cs-quote">${q}</span>`);
}

/** Applies inline markdown only to text between HTML tags. */
function inlineOutsideTags(s: string): string {
  return s
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') && part.endsWith('>') ? part : inline(part)))
    .join('');
}

function renderBlock(chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed) return '';
  if (BLOCK_TAG.test(trimmed)) return trimmed.replace(/>\s*\n\s*</g, '><');
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return '<hr>';
  const h = /^(#{1,6})\s+(.+)$/.exec(trimmed);
  if (h && !trimmed.includes('\n')) return `<h${Math.min(6, h[1].length + 2)}>${inlineOutsideTags(h[2])}</h${Math.min(6, h[1].length + 2)}>`;
  const lines = trimmed.split('\n');
  if (lines.every((l) => /^\s*>/.test(l))) {
    return `<blockquote>${renderParagraph(lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n'))}</blockquote>`;
  }
  if (lines.every((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l))) {
    const ordered = /^\s*\d/.test(lines[0]);
    const items = lines.map((l) => `<li>${inlineOutsideTags(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`).join('');
    return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
  }
  return renderParagraph(trimmed);
}

function renderParagraph(text: string): string {
  return `<p>${inlineOutsideTags(text).replace(/\n/g, '<br>')}</p>`;
}

export interface FormatOptions {
  markdown: boolean;
  html: boolean;
}

export function formatMessage(text: string, opts: FormatOptions): string {
  if (!text) return '';
  const fences: string[] = [];
  let src = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang: string, code: string) => {
    fences.push(`<pre class="cs-codeblock"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n\n\u0000F${fences.length - 1}\u0000\n\n`;
  });
  if (!opts.html) src = escapeHtml(src);
  let html: string;
  if (opts.markdown) {
    html = src
      .split(/\n{2,}/)
      .map((chunk) => {
        const f = /^\s*\u0000F(\d+)\u0000\s*$/.exec(chunk);
        return f ? chunk : renderBlock(chunk);
      })
      .join('');
  } else {
    html = src.replace(/\n/g, '<br>');
  }
  html = html.replace(/\u0000F(\d+)\u0000/g, (_, i) => fences[Number(i)]);
  return sanitize(html);
}

/** Plain text preview (for lists, notifications, TTS). */
export function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text inside quotes only — for «читать только реплики» in TTS. */
export function quotesOnly(text: string): string {
  const m = text.match(/«[^»]+»|“[^”]+”|"[^"]+"/g);
  return m ? m.map((q) => q.slice(1, -1)).join(' ') : '';
}
