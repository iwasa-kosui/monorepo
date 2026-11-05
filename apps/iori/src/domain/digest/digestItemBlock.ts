import { err, ok, type Result } from '@iwasa-kosui/result';

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

export type DeepDiveOutputRejected = Readonly<{ reason: string }>;

type NormalizeDeepDiveOutputOptions = Readonly<{
  url: string;
  linkLine: string;
  otherUrls: ReadonlyArray<string>;
  maxChars: number;
}>;

const OUTPUT_HEADING = /^\s*#{1,6}(?:\s|$)/;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const UNINDENTED = /^\S/;

const rejected = (reason: string): Result<never, DeepDiveOutputRejected> => err({ reason });

const cutAtLineBoundary = (lines: ReadonlyArray<string>, maxChars: number): ReadonlyArray<string> => {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    length += Array.from(line).length + (kept.length === 0 ? 0 : 1);
    if (length > maxChars && kept.length > 0) break;
    kept.push(line);
  }
  return kept;
};

const isBlank = (lines: ReadonlyArray<string>): boolean => lines.every((line) => line.trim() === '');

export const normalizeDeepDiveOutput = (
  output: string,
  { url, linkLine, otherUrls, maxChars }: NormalizeDeepDiveOutputOptions,
): Result<string, DeepDiveOutputRejected> => {
  const target = findDigestItemBlock(output, url) === undefined ? `${linkLine}\n${output.trim()}` : output;
  const found = findDigestItemBlock(target, url);
  if (found === undefined) return rejected('the output does not contain the item link');
  const lines = found.text
    .split('\n')
    .flatMap((line) => {
      const stripped = line.replace(MARKDOWN_IMAGE, '');
      return stripped.trim() === '' && line.trim() !== '' ? [] : [stripped];
    })
    .join('\n')
    .trimEnd()
    .split('\n');
  const rest = lines.slice(1);
  if (rest.some((line) => OUTPUT_HEADING.test(line))) return rejected('the output contains a heading');
  const indented = rest.map((line) => (UNINDENTED.test(line) ? `  ${line}` : line));
  const restText = indented.join('\n');
  if (otherUrls.some((otherUrl) => findDigestItemBlock(restText, otherUrl) !== undefined)) {
    return rejected('the output contains a link to another item');
  }
  const kept = cutAtLineBoundary([lines[0]!, ...indented], maxChars);
  if (isBlank(kept.slice(1))) return rejected('the output has no body');
  return ok(kept.join('\n'));
};
