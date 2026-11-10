const URL_PATTERN = /https?:\/\/[A-Za-z0-9][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*/g;
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');

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

const linkify = (line: string): string => {
  let html = '';
  let cursor = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    const { url, rest } = splitTrailing(match[0]);
    html += escapeHtml(line.slice(cursor, match.index));
    html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>${escapeHtml(rest)}`;
    cursor = match.index + match[0].length;
  }
  return html + escapeHtml(line.slice(cursor));
};

export const plainTextToHtml = (text: string): string =>
  text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split(/\n(?:[^\S\n]*\n)+/)
    .map((paragraph) => paragraph.replace(/^\n+|\n+$/g, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => `<p>${paragraph.split('\n').map(linkify).join('<br>')}</p>`)
    .join('');
