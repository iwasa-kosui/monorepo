import { describe, expect, it } from 'vitest';

import { parseSearchSource, withSearchSource } from './searchSource.ts';

describe('parseSearchSource / withSearchSource', () => {
  it('知らない値は iori の検索にする', () => {
    expect(parseSearchSource('?source=other')).toBe('iori');
  });

  it('source 以外のクエリを残して付け外しし、読み戻せる', () => {
    expect(withSearchSource('?a=1', 'bluesky-posts')).toBe('?a=1&source=bluesky-posts');
    expect(withSearchSource('?a=1&source=bluesky-posts', 'iori')).toBe('?a=1');
    expect(withSearchSource('?source=bluesky-posts', 'iori')).toBe('');
    expect(parseSearchSource(withSearchSource('', 'bluesky-actors'))).toBe('bluesky-actors');
  });
});
