import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { MAX_FEED_ITEMS, parseFeed } from './parseFeed.ts';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const parsedItems = (xml: string) => {
  const result = parseFeed(xml);
  if (!result.ok) throw new Error(result.err.message);
  return result.val;
};

describe('parseFeed RSS 1.0', () => {
  it('reads rdf:about, dc:date and hatena:bookmarkcount, sorts newest first and drops non-http links', () => {
    expect(parsedItems(fixture('rss1Hatena.xml'))).toEqual([
      {
        guid: 'https://blog.example.test/newer',
        url: 'https://blog.example.test/newer',
        title: 'Newer entry',
        description: 'Escaped HTML body',
        publishedAt: new Date('2026-03-02T09:00:00Z'),
        hatenaBookmarkCount: 7,
      },
      {
        guid: 'https://blog.example.test/older',
        url: 'https://blog.example.test/older',
        title: 'Older & quieter entry',
        description: 'Plain description of the older entry.',
        publishedAt: new Date('2026-03-01T09:00:00Z'),
        hatenaBookmarkCount: 42,
      },
    ]);
  });
});

describe('parseFeed RSS 2.0', () => {
  it('uses guid or link, tolerates odd enclosure attributes and puts undated items last', () => {
    expect(parsedItems(fixture('rss2.xml'))).toEqual([
      {
        guid: 'guid-a',
        url: 'https://zenn.example.test/articles/a',
        title: 'With guid',
        description: 'First paragraph',
        publishedAt: new Date('2026-03-03T10:00:00Z'),
        hatenaBookmarkCount: null,
      },
      {
        guid: 'https://zenn.example.test/articles/b',
        url: 'https://zenn.example.test/articles/b',
        title: 'Without guid',
        description: '',
        publishedAt: null,
        hatenaBookmarkCount: null,
      },
    ]);
  });
});

describe('parseFeed Atom', () => {
  it('uses id, the alternate or rel-less link and falls back from summary to content', () => {
    expect(parsedItems(fixture('atom.xml'))).toEqual([
      {
        guid: 'tag:example.test,2026:2',
        url: 'https://example.test/posts/2',
        title: 'No rel link',
        description: 'Only content',
        publishedAt: new Date('2026-02-10T00:00:00Z'),
        hatenaBookmarkCount: null,
      },
      {
        guid: 'tag:example.test,2026:1',
        url: 'https://example.test/posts/1',
        title: 'Atom <entry>',
        description: 'Summary text',
        publishedAt: new Date('2026-02-01T00:00:00Z'),
        hatenaBookmarkCount: null,
      },
    ]);
  });
});

describe('parseFeed errors and limits', () => {
  it('returns an error for malformed XML', () => {
    expect(parseFeed(fixture('invalid.xml'))).toMatchObject({ ok: false, err: { type: 'FeedParseError' } });
  });

  it('returns an error for XML that is not a feed', () => {
    expect(parseFeed('<html><body>hello</body></html>')).toMatchObject({ ok: false });
    expect(parseFeed('')).toMatchObject({ ok: false });
  });

  it('returns an empty list for a feed without items', () => {
    expect(parsedItems('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });

  it('limits the result to the newest 30 items and truncates descriptions to 1000 characters', () => {
    const items = Array.from({ length: 40 }, (_, index) => {
      const published = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
      return `<item><title>t${index}</title><link>https://e.test/${index}</link>`
        + `<pubDate>${published}</pubDate><description>${'あ'.repeat(1500)}</description></item>`;
    }).join('');
    const parsed = parsedItems(`<rss version="2.0"><channel>${items}</channel></rss>`);
    expect(parsed).toHaveLength(MAX_FEED_ITEMS);
    expect(parsed[0]?.title).toBe('t39');
    expect(Array.from(parsed[0]?.description ?? '')).toHaveLength(1000);
  });
});
