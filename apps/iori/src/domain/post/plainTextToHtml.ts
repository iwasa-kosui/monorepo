import { escapeWithMentions, type ResolvedMentions } from './mention.ts';
import { escapeHtml, URL_PATTERN } from './textSyntax.ts';

const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

const count = (text: string, char: string): number => text.split(char).length - 1;

const splitTrailing = (matched: string): Readonly<{ url: string; rest: string }> => {
  let url = matched;
  for (;;) {
    const stripped = url.replace(TRAILING_PUNCTUATION, '');
    const unbalanced = stripped.endsWith(')') && count(stripped, ')') > count(stripped, '(');
    const next = unbalanced ? stripped.slice(0, -1) : stripped;
    if (next === url) break;
    url = next;
  }
  return { url, rest: matched.slice(url.length) };
};

const linkify = (line: string, mentions: ResolvedMentions): string => {
  let html = '';
  let cursor = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    const { url, rest } = splitTrailing(match[0]);
    html += escapeWithMentions(line.slice(cursor, match.index), mentions);
    html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>${escapeHtml(rest)}`;
    cursor = match.index + match[0].length;
  }
  return html + escapeWithMentions(line.slice(cursor), mentions);
};

export const plainTextToHtml = (text: string, mentions: ResolvedMentions = new Map()): string =>
  text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split(/\n(?:[^\S\n]*\n)+/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => `<p>${paragraph.split('\n').map((line) => linkify(line, mentions)).join('<br>')}</p>`)
    .join('');
