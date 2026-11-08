import { decodeEntities } from '../text/htmlToPlainText.ts';

export type TextLink = Readonly<{ start: number; end: number; uri: string }>;
export type TextWithLinks = Readonly<{ text: string; links: readonly TextLink[] }>;

const LINK_OPEN = '';
const LINK_CLOSE = '';

const hrefOf = (attributes: string): string | undefined => {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  return raw === undefined ? undefined : decodeEntities(raw).trim();
};

const httpUri = (value: string): string | undefined => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
};

const BLOCK_BREAKS: Readonly<Record<string, string>> = {
  p: '\n\n',
  div: '\n',
  li: '\n',
  h1: '\n',
  h2: '\n',
  h3: '\n',
  h4: '\n',
  h5: '\n',
  h6: '\n',
  blockquote: '\n',
  pre: '\n',
  ul: '\n',
  ol: '\n',
};

export const htmlToTextWithLinks = (html: string): TextWithLinks => {
  const cleaned = html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const hrefs: Array<string | undefined> = [];
  let marked = '';
  let linkOpen = false;
  let cursor = 0;
  for (const tag of cleaned.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    marked += decodeEntities(cleaned.slice(cursor, tag.index));
    cursor = tag.index + tag[0].length;
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    if (name === 'br' && !closing) {
      marked += '\n';
    } else if (name === 'a') {
      if (!closing && !linkOpen) {
        hrefs.push(hrefOf(tag[3]));
        marked += LINK_OPEN;
        linkOpen = true;
      } else if (closing && linkOpen) {
        marked += LINK_CLOSE;
        linkOpen = false;
      }
    } else if (closing) {
      marked += BLOCK_BREAKS[name] ?? '';
    }
  }
  marked += decodeEntities(cleaned.slice(cursor));
  if (linkOpen) marked += LINK_CLOSE;

  const normalized = marked
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let text = '';
  const links: TextLink[] = [];
  let linkIndex = 0;
  let start = 0;
  for (const character of normalized) {
    if (character === LINK_OPEN) {
      start = text.length;
    } else if (character === LINK_CLOSE) {
      const href = hrefs[linkIndex];
      linkIndex += 1;
      const uri = href === undefined ? undefined : httpUri(href);
      if (uri !== undefined && text.length > start) links.push({ start, end: text.length, uri });
    } else {
      text += character;
    }
  }
  return { text, links };
};
