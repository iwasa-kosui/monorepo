export const MAX_TRANSLATION_INPUT_CHARS = 5000;
export const TRUNCATION_NOTICE = '（以下省略）';

export type TranslationSource = Readonly<{
  text: string;
  anchors: ReadonlyArray<string>;
}>;

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

export const toTranslationSource = (html: string): TranslationSource => {
  const anchors: string[] = [];
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, (anchor) => {
        anchors.push(anchor);
        return marker(anchors.length);
      })
      .replace(/<\/p\s*>\s*<p\b[^>]*>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, anchors };
};

export const truncateTranslationSource = (
  source: TranslationSource,
  maxChars: number = MAX_TRANSLATION_INPUT_CHARS,
): Readonly<{ source: TranslationSource; truncated: boolean }> => {
  const chars = Array.from(source.text);
  if (chars.length <= maxChars) return { source, truncated: false };
  const text = chars.slice(0, maxChars).join('').replace(/⟦\d*$/, '').trimEnd();
  const kept = Array.from(text.matchAll(/⟦(\d+)⟧/g)).reduce((max, match) => Math.max(max, Number(match[1])), 0);
  return { source: { text, anchors: source.anchors.slice(0, kept) }, truncated: true };
};

export const fromTranslatedText = (text: string, anchors: ReadonlyArray<string>): string => {
  const used = new Set<number>();
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      escapeHtml(paragraph).replace(/⟦\s*(\d+)\s*⟧/g, (_match, digits: string) => {
        const n = Number(digits);
        const anchor = anchors[n - 1];
        if (anchor === undefined) return '';
        used.add(n);
        return anchor;
      })
    )
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const missing = anchors.filter((_anchor, index) => !used.has(index + 1));
  if (missing.length > 0) {
    const last = paragraphs.length - 1;
    if (last < 0) paragraphs.push(missing.join(' '));
    else paragraphs[last] = `${paragraphs[last]} ${missing.join(' ')}`;
  }
  return paragraphs.map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
};

export const withTruncationNotice = (html: string): string => `${html}<p>${TRUNCATION_NOTICE}</p>`;
