import { decodeEntities } from '../text/htmlToPlainText.ts';

export type TextLink = Readonly<{ start: number; end: number; uri: string }>;
export type TextWithLinks = Readonly<{ text: string; links: readonly TextLink[] }>;

const LINK_OPEN = '';
const LINK_CLOSE = '';

const QUOTE_OPEN = '';
const QUOTE_CLOSE = '';

const withoutMarkers = (text: string): string =>
  text.replaceAll(LINK_OPEN, '').replaceAll(LINK_CLOSE, '').replaceAll(QUOTE_OPEN, '').replaceAll(QUOTE_CLOSE, '');

type Line = Readonly<{ depth: number; text: string }>;

// 引用の印を読んで、行ごとの引用の深さを求める。印は必ず行頭（開く）か行末（閉じる）にある。
const toLines = (marked: string): readonly Line[] => {
  const lines: Line[] = [];
  let depth = 0;
  for (const raw of marked.split('\n')) {
    let lineDepth = depth;
    let content = '';
    for (const character of raw) {
      if (character === QUOTE_OPEN) {
        depth += 1;
        lineDepth = Math.max(lineDepth, depth);
      } else if (character === QUOTE_CLOSE) {
        depth = Math.max(0, depth - 1);
      } else {
        content += character;
      }
    }
    const text = content.replace(/[^\S\n]+/g, ' ').trim();
    const last = lines.at(-1);
    if (text !== '') {
      lines.push({ depth: lineDepth, text });
    } else if (last !== undefined && last.text === '') {
      lines[lines.length - 1] = { depth: Math.min(last.depth, lineDepth), text: '' };
    } else if (last !== undefined) {
      lines.push({ depth: lineDepth, text: '' });
    }
  }
  return lines.at(-1)?.text === '' ? lines.slice(0, -1) : lines;
};

// 引用の中の行は、Markdown と同じく行頭に「>」を付ける。
// 空行は、前後の行がどちらも引用の中にあるときだけ引用の続きとして扱う。
const quoteLines = (lines: readonly Line[]): string =>
  lines
    .map(({ depth, text }, index) => {
      if (text !== '') return '> '.repeat(depth) + text;
      const around = Math.min(depth, lines[index - 1]?.depth ?? 0, lines[index + 1]?.depth ?? 0);
      return '> '.repeat(around).trimEnd();
    })
    .join('\n');

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
    marked += withoutMarkers(decodeEntities(cleaned.slice(cursor, tag.index)));
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
    } else if (name === 'blockquote') {
      marked += closing ? `${QUOTE_CLOSE}\n` : `\n${QUOTE_OPEN}`;
    } else if (closing) {
      marked += BLOCK_BREAKS[name] ?? '';
    }
  }
  marked += withoutMarkers(decodeEntities(cleaned.slice(cursor)));
  if (linkOpen) marked += LINK_CLOSE;

  const normalized = quoteLines(toLines(marked));

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
