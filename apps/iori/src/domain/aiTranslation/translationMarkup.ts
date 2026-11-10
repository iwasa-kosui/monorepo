export const MAX_TRANSLATION_INPUT_CHARS = 5000;
export const TRUNCATION_NOTICE = '（以下省略）';

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
};

const decodeEntities = (text: string): string =>
  text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g, (match, dec, hex, named) => {
    if (named !== undefined) return NAMED_ENTITIES[named as string] ?? match;
    const codePoint = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
    const valid = Number.isInteger(codePoint)
      && codePoint >= 0
      && codePoint <= 0x10ffff
      && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    return valid ? String.fromCodePoint(codePoint) : match;
  });

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const marker = (n: number): string => `⟦${n}⟧`;
const paragraphMarker = (n: number): string => `⟪${n}⟫`;

const toHalfWidthDigits = (text: string): string =>
  text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));

const KEPT_REMAINDER = /^(?:RE|QT):$/i;

export type TranslationParagraph =
  | Readonly<{ kind: 'translate' }>
  | Readonly<{ kind: 'keep'; html: string }>;

export type TranslationSource = Readonly<{
  text: string;
  anchors: ReadonlyArray<string>;
  paragraphs: ReadonlyArray<TranslationParagraph>;
}>;

const normalizeParagraph = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const renderParagraph = (text: string, resolve: (n: number) => string | undefined): string =>
  escapeHtml(text)
    .replace(/⟦\s*([0-9０-９]+)\s*⟧/g, (_match, digits: string) => resolve(Number(toHalfWidthDigits(digits))) ?? '')
    .trim()
    .replace(/\n/g, '<br>');

export const toTranslationSource = (html: string): TranslationSource => {
  const all: string[] = [];
  const chunks = html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, (anchor) => {
      all.push(anchor);
      return marker(all.length);
    })
    .split(/<\/p\s*>\s*<p\b[^>]*>/i);
  const anchors: string[] = [];
  const paragraphs: TranslationParagraph[] = [];
  const texts: string[] = [];
  for (const chunk of chunks) {
    const text = normalizeParagraph(decodeEntities(chunk.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')));
    if (text === '') continue;
    const remainder = text.replace(/⟦\d+⟧/g, '').replace(/\s+/g, '');
    if (remainder === '' || KEPT_REMAINDER.test(remainder)) {
      paragraphs.push({ kind: 'keep', html: renderParagraph(text, (n) => all[n - 1]) });
      continue;
    }
    const renumbered = text.replace(/⟦(\d+)⟧/g, (match, digits: string) => {
      const anchor = all[Number(digits) - 1];
      if (anchor === undefined) return match;
      anchors.push(anchor);
      return marker(anchors.length);
    });
    paragraphs.push({ kind: 'translate' });
    texts.push(`${paragraphMarker(texts.length + 1)} ${renumbered}`);
  }
  return { text: texts.join('\n\n'), anchors, paragraphs };
};

export const truncateTranslationSource = (
  source: TranslationSource,
  maxChars: number = MAX_TRANSLATION_INPUT_CHARS,
): Readonly<{ source: TranslationSource; truncated: boolean }> => {
  const chars = Array.from(source.text);
  if (chars.length <= maxChars) return { source, truncated: false };
  const text = chars.slice(0, maxChars).join('').replace(/[⟦⟪][0-9０-９]*$/, '').trimEnd();
  const kept = Array.from(text.matchAll(/⟦(\d+)⟧/g)).reduce((max, match) => Math.max(max, Number(match[1])), 0);
  const keptParagraphs = Array.from(text.matchAll(/⟪\d+⟫/g)).length;
  const translateIndexes = source.paragraphs.flatMap((paragraph, index) =>
    paragraph.kind === 'translate' ? [index] : []
  );
  const end = (translateIndexes[keptParagraphs - 1] ?? -1) + 1;
  return {
    source: { text, anchors: source.anchors.slice(0, kept), paragraphs: source.paragraphs.slice(0, end) },
    truncated: true,
  };
};

type Piece = Readonly<{ html: string; translated: boolean }>;

const tidy = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

export const fromTranslatedText = (
  text: string,
  { anchors, paragraphs }: Pick<TranslationSource, 'anchors' | 'paragraphs'>,
): string => {
  const used = new Set<number>();
  const render = (segment: string): string =>
    renderParagraph(segment, (n) => {
      const anchor = anchors[n - 1];
      if (anchor !== undefined) used.add(n);
      return anchor;
    });
  const normalized = text.replace(/\r\n?/g, '\n');
  const [preamble = '', ...rest] = tidy(normalized).split(/⟪\s*([0-9０-９]+)\s*⟫/);
  const numbers = rest.filter((_part, index) => index % 2 === 0).map((digits) => Number(toHalfWidthDigits(digits)));
  const segments = rest.filter((_part, index) => index % 2 === 1);
  const translateCount = paragraphs.filter((paragraph) => paragraph.kind === 'translate').length;
  const marked = preamble.trim() === ''
    && numbers.length === translateCount
    && numbers.every((n, index) => n === index + 1);

  const pieces: Piece[] = [];
  if (marked) {
    const rendered = segments.map(render);
    let next = 0;
    for (const paragraph of paragraphs) {
      if (paragraph.kind === 'keep') pieces.push({ html: paragraph.html, translated: false });
      else pieces.push({ html: rendered[next++] ?? '', translated: true });
    }
  } else {
    const group = tidy(normalized.replace(/⟪\s*[0-9０-９]+\s*⟫[^\S\n]*/g, '\n\n'))
      .split(/\n{2,}/)
      .map((segment) => ({ html: render(segment), translated: true }));
    let placed = false;
    for (const paragraph of paragraphs) {
      if (paragraph.kind === 'keep') pieces.push({ html: paragraph.html, translated: false });
      else if (!placed) {
        pieces.push(...group);
        placed = true;
      }
    }
    if (!placed) pieces.push(...group);
  }

  const visible = pieces.filter((piece) => piece.html !== '');
  const missing = anchors.filter((_anchor, index) => !used.has(index + 1));
  if (missing.length > 0) {
    const last = visible.findLastIndex((piece) => piece.translated);
    if (last < 0) visible.push({ html: missing.join(' '), translated: true });
    else visible[last] = { html: `${visible[last]!.html} ${missing.join(' ')}`, translated: true };
  }
  return visible.map((piece) => `<p>${piece.html}</p>`).join('');
};

export const withTruncationNotice = (html: string): string => `${html}<p>${TRUNCATION_NOTICE}</p>`;
