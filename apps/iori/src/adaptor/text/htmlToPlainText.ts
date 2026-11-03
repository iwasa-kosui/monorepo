const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  yen: '¥',
  times: '×',
};

const decodeCodePoint = (match: string, codePoint: number): string => {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
  return String.fromCodePoint(codePoint);
};

const decodeEntities = (text: string): string =>
  text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|rsquo|lsquo|rdquo|ldquo|middot|copy|reg|trade|yen|times));/g,
    (match, dec, hex, named) => {
      if (dec !== undefined) return decodeCodePoint(match, Number.parseInt(dec, 10));
      if (hex !== undefined) return decodeCodePoint(match, Number.parseInt(hex, 16));
      return NAMED_ENTITIES[named as string] ?? match;
    },
  );

export const htmlToPlainText = (html: string, maxChars: number): string => {
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table)\s*>/gi, '\n')
      .replace(/<\/(?:td|th)\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return Array.from(text).slice(0, Math.max(0, maxChars)).join('');
};
