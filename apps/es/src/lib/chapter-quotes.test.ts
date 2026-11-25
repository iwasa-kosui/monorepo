import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { chapterNames, readChapterText } from './chapter-files';

const readRepo = (path: string): string => readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

const postFiles: Record<string, string> = {
  'https://kosui.me/posts/2025/05/06/142842': 'apps/kosui-me/src/content/posts/2025-05-06-142842.mdx',
  'https://kosui.me/posts/2026/03/03/service-based-architecture':
    'apps/kosui-me/src/content/posts/2026-03-03-service-based-architecture.mdx',
};
const talkSource = 'SRE Kaigi 2026 の発表より';
const talkFile = 'talks/2026/sre-kaigi-2026/slides.md';

interface ChapterQuote {
  source: string;
  href: string | undefined;
  text: string;
}

const quotesOf = (mdx: string): ChapterQuote[] =>
  [...mdx.matchAll(/<Quote source="([^"]+)"(?: href="([^"]+)")?>\n\n([\s\S]*?)\n\n<\/Quote>/g)].map((match) => ({
    source: match[1] ?? '',
    href: match[2],
    text: match[3] ?? '',
  }));

const sentencesOf = (text: string): string[] => text.match(/[^。]+。/g) ?? [];

describe('章の引用', () => {
  const quotes = chapterNames().flatMap((chapter) => quotesOf(readChapterText(chapter)));

  it('引用を10件置いている', () => {
    expect(quotes.length).toBe(10);
  });

  it('引用文の各文が出典のファイルに一字一句含まれる', () => {
    for (const quote of quotes) {
      const file = quote.href === undefined ? talkFile : postFiles[quote.href];
      expect(file, `${quote.text} の出典`).toBeDefined();
      const origin = readRepo(file ?? '');
      const sentences = sentencesOf(quote.text);
      expect(sentences.join(''), quote.text).toBe(quote.text);
      for (const sentence of sentences) {
        expect(origin, sentence).toContain(sentence);
      }
    }
  });

  it('発表者ノートの引用は URL を付けず、記事の引用は記事の URL を付ける', () => {
    for (const quote of quotes) {
      if (quote.href === undefined) {
        expect(quote.source).toBe(talkSource);
      } else {
        expect(Object.keys(postFiles)).toContain(quote.href);
      }
    }
  });
});
