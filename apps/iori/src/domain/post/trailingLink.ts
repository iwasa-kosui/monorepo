const ANCHOR_OPEN = /<a\b([^>]*)>/gi;
const ANCHOR_CLOSE = '</a>';
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const CLASS = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const REL = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

const decodeEntities = (text: string): string =>
  text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
    .replaceAll('&amp;', '&');

const textOf = (html: string): string => decodeEntities(html.replace(/<[^>]*>/g, '')).trim();

const tokensOf = (attributes: string, pattern: RegExp): readonly string[] => {
  const match = pattern.exec(attributes);
  return (match?.[1] ?? match?.[2] ?? '').toLowerCase().split(/\s+/);
};

/**
 * 本文の最後に置かれたリンクの URL を返す。リンクの後ろに文字が続くとき、メンションやハッシュタグのリンクのときは null。
 */
export const trailingLinkOf = (html: string): string | null => {
  const closeAt = html.toLowerCase().lastIndexOf(ANCHOR_CLOSE);
  if (closeAt === -1) return null;
  if (textOf(html.slice(closeAt + ANCHOR_CLOSE.length)) !== '') return null;

  const open = [...html.slice(0, closeAt).matchAll(ANCHOR_OPEN)].at(-1);
  if (open === undefined) return null;
  const attributes = open[1] ?? '';
  const classes = tokensOf(attributes, CLASS);
  if (classes.includes('mention') || classes.includes('hashtag')) return null;
  if (tokensOf(attributes, REL).includes('tag')) return null;
  if (/^[@#]/.test(textOf(html.slice(open.index + open[0].length, closeAt)))) return null;

  const hrefMatch = HREF.exec(attributes);
  const href = decodeEntities((hrefMatch?.[1] ?? hrefMatch?.[2] ?? '').trim());
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
};
