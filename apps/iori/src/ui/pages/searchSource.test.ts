import { describe, expect, it } from 'vitest';

import { parseSearchSource, withSearchSource } from './searchSource.ts';

describe('parseSearchSource', () => {
  it('クエリが無いときは iori の検索にする', () => {
    expect(parseSearchSource('')).toBe('iori');
  });

  it('source の値に対応するタブを返す', () => {
    expect(parseSearchSource('?source=bluesky-posts')).toBe('bluesky-posts');
    expect(parseSearchSource('?source=bluesky-actors')).toBe('bluesky-actors');
  });

  it('知らない値は iori の検索にする', () => {
    expect(parseSearchSource('?source=other')).toBe('iori');
    expect(parseSearchSource('?source=')).toBe('iori');
  });
});

describe('withSearchSource', () => {
  it('iori の検索ではクエリを付けない', () => {
    expect(withSearchSource('?source=bluesky-posts', 'iori')).toBe('');
  });

  it('Bluesky のタブでは source を付ける', () => {
    expect(withSearchSource('', 'bluesky-actors')).toBe('?source=bluesky-actors');
    expect(withSearchSource('?source=bluesky-actors', 'bluesky-posts')).toBe('?source=bluesky-posts');
  });

  it('source 以外のクエリは残す', () => {
    expect(withSearchSource('?a=1', 'bluesky-posts')).toBe('?a=1&source=bluesky-posts');
    expect(withSearchSource('?a=1&source=bluesky-posts', 'iori')).toBe('?a=1');
  });

  it('付けた結果を parseSearchSource で読み戻せる', () => {
    expect(parseSearchSource(withSearchSource('', 'bluesky-actors'))).toBe('bluesky-actors');
  });
});
