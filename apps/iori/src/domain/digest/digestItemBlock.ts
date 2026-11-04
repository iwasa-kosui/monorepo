export type DigestItemBlock = Readonly<{ start: number; end: number; text: string }>;

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const HEADING = /^\s{0,3}#{1,6}(?:\s|$)/;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const linkTargets = (url: string): ReadonlyArray<string> => {
  const bases = new Set([url]);
  if (URL.canParse(url)) {
    bases.add(new URL(url).href);
  }
  return [...bases].flatMap((base) => [base, base.replace(/([()])/g, '\\$1')]);
};

const linkPattern = (url: string): RegExp =>
  new RegExp(`\\]\\(<?(?:${linkTargets(url).map(escapeRegExp).join('|')})>?(?:\\s[^)]*)?\\)`);

const indentOf = (line: string): number => LIST_ITEM.exec(line)?.[1]?.length ?? /^\s*/.exec(line)![0].length;

export const findDigestItemBlock = (markdown: string, url: string): DigestItemBlock | undefined => {
  const pattern = linkPattern(url);
  const lines: Array<Readonly<{ text: string; offset: number }>> = [];
  let offset = 0;
  for (const text of markdown.split('\n')) {
    lines.push({ text, offset });
    offset += text.length + 1;
  }
  const first = lines.findIndex(({ text }) => LIST_ITEM.test(text) && pattern.test(text));
  if (first === -1) return undefined;
  const itemIndent = indentOf(lines[first]!.text);
  let last = first;
  for (let index = first + 1; index < lines.length; index += 1) {
    const { text } = lines[index]!;
    if (text.trim() === '') continue;
    const precededByBlank = lines[index - 1]!.text.trim() === '';
    if (HEADING.test(text)) break;
    if (LIST_ITEM.test(text) && indentOf(text) <= itemIndent) break;
    if (precededByBlank && indentOf(text) <= itemIndent) break;
    last = index;
  }
  const start = lines[first]!.offset;
  const end = lines[last]!.offset + lines[last]!.text.length;
  return { start, end, text: markdown.slice(start, end) };
};

export const replaceDigestItemBlock = (markdown: string, block: DigestItemBlock, replacement: string): string =>
  `${markdown.slice(0, block.start)}${replacement}${markdown.slice(block.end)}`;
