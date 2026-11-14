import { describe, expect, it } from 'vitest';

import { parseBookmarksSource, resolveBookmarksSource, withBookmarksSource } from './bookmarksSource.ts';

describe('parseBookmarksSource / withBookmarksSource', () => {
  it('知らない値は Fediverse にする', () => {
    expect(parseBookmarksSource('?source=other')).toBe('fediverse');
  });

  it('source 以外のクエリを残して付け外しし、読み戻せる', () => {
    expect(withBookmarksSource('?a=1', 'bluesky')).toBe('?a=1&source=bluesky');
    expect(withBookmarksSource('?a=1&source=bluesky', 'fediverse')).toBe('?a=1');
    expect(withBookmarksSource('?source=bluesky', 'fediverse')).toBe('');
    expect(parseBookmarksSource(withBookmarksSource('', 'bluesky'))).toBe('bluesky');
  });
});

describe('resolveBookmarksSource', () => {
  it('Bluesky が有効なときだけ Bluesky にし、読み込み中は pending にする', () => {
    expect(resolveBookmarksSource('fediverse', undefined)).toBe('fediverse');
    expect(resolveBookmarksSource('bluesky', true)).toBe('bluesky');
    expect(resolveBookmarksSource('bluesky', false)).toBe('fediverse');
    expect(resolveBookmarksSource('bluesky', undefined)).toBe('pending');
  });
});
