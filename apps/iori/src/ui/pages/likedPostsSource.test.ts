import { describe, expect, it } from 'vitest';

import { parseLikedPostsSource, withLikedPostsSource } from './likedPostsSource.ts';

describe('parseLikedPostsSource', () => {
  it('クエリが無いときは Fediverse にする', () => {
    expect(parseLikedPostsSource('')).toBe('fediverse');
  });

  it('source の値に対応するタブを返す', () => {
    expect(parseLikedPostsSource('?source=fediverse')).toBe('fediverse');
    expect(parseLikedPostsSource('?source=bluesky')).toBe('bluesky');
  });

  it('知らない値は Fediverse にする', () => {
    expect(parseLikedPostsSource('?source=other')).toBe('fediverse');
    expect(parseLikedPostsSource('?source=')).toBe('fediverse');
  });
});

describe('withLikedPostsSource', () => {
  it('Fediverse ではクエリを付けない', () => {
    expect(withLikedPostsSource('?source=bluesky', 'fediverse')).toBe('');
  });

  it('Bluesky では source を付ける', () => {
    expect(withLikedPostsSource('', 'bluesky')).toBe('?source=bluesky');
  });

  it('source 以外のクエリは残す', () => {
    expect(withLikedPostsSource('?a=1', 'bluesky')).toBe('?a=1&source=bluesky');
    expect(withLikedPostsSource('?a=1&source=bluesky', 'fediverse')).toBe('?a=1');
  });

  it('付けた結果を parseLikedPostsSource で読み戻せる', () => {
    expect(parseLikedPostsSource(withLikedPostsSource('', 'bluesky'))).toBe('bluesky');
  });
});
