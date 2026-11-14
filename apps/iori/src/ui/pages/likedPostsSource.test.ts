import { describe, expect, it } from 'vitest';

import { parseLikedPostsSource, withLikedPostsSource } from './likedPostsSource.ts';

describe('parseLikedPostsSource / withLikedPostsSource', () => {
  it('知らない値は Fediverse にする', () => {
    expect(parseLikedPostsSource('?source=other')).toBe('fediverse');
  });

  it('source 以外のクエリを残して付け外しし、読み戻せる', () => {
    expect(withLikedPostsSource('?a=1', 'bluesky')).toBe('?a=1&source=bluesky');
    expect(withLikedPostsSource('?a=1&source=bluesky', 'fediverse')).toBe('?a=1');
    expect(withLikedPostsSource('?source=bluesky', 'fediverse')).toBe('');
    expect(parseLikedPostsSource(withLikedPostsSource('', 'bluesky'))).toBe('bluesky');
  });
});
