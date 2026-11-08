import { describe, expect, it } from 'vitest';

import { buildChapterPages, chapterOfEntryId, pagePath } from './chapter-routes';

describe('chapterOfEntryId', () => {
  it('エントリの id から章を取り出す', () => {
    expect(chapterOfEntryId('chapter-2/03')).toBe('chapter-2');
  });
});

describe('pagePath', () => {
  it('最初のページは章の URL、2 ページ目以降は番号つきの URL にする', () => {
    expect(pagePath('intro', 1)).toBe('/chapters/intro/');
    expect(pagePath('intro', 2)).toBe('/chapters/intro/2/');
  });
});

describe('buildChapterPages', () => {
  const entries = [{ id: 'b/02' }, { id: 'a/01' }, { id: 'b/01' }, { id: 'b/10' }];

  it('章の順、ページの順に並べて番号と URL の slug を付ける', () => {
    const pages = buildChapterPages(entries, ['a', 'b']);
    expect(pages.map((page) => [page.entry.id, page.number, page.total, page.slug])).toEqual([
      ['a/01', 1, 1, 'a'],
      ['b/01', 1, 3, 'b'],
      ['b/02', 2, 3, 'b/2'],
      ['b/10', 3, 3, 'b/3'],
    ]);
  });

  it('schedule に無い章のディレクトリがあるとエラーにする', () => {
    expect(() => buildChapterPages(entries, ['a'])).toThrow('b');
  });
});
