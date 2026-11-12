import { describe, expect, it } from 'vitest';

import { parseBookmarksSource, resolveBookmarksSource, withBookmarksSource } from './bookmarksSource.ts';

describe('parseBookmarksSource', () => {
  it('クエリが無いときは Fediverse にする', () => {
    expect(parseBookmarksSource('')).toBe('fediverse');
  });

  it('source の値に対応するタブを返す', () => {
    expect(parseBookmarksSource('?source=bluesky')).toBe('bluesky');
    expect(parseBookmarksSource('?source=fediverse')).toBe('fediverse');
  });

  it('知らない値は Fediverse にする', () => {
    expect(parseBookmarksSource('?source=other')).toBe('fediverse');
    expect(parseBookmarksSource('?source=')).toBe('fediverse');
  });
});

describe('withBookmarksSource', () => {
  it('Fediverse ではクエリを付けない', () => {
    expect(withBookmarksSource('?source=bluesky', 'fediverse')).toBe('');
  });

  it('Bluesky では source を付ける', () => {
    expect(withBookmarksSource('', 'bluesky')).toBe('?source=bluesky');
  });

  it('source 以外のクエリは残す', () => {
    expect(withBookmarksSource('?a=1', 'bluesky')).toBe('?a=1&source=bluesky');
    expect(withBookmarksSource('?a=1&source=bluesky', 'fediverse')).toBe('?a=1');
  });
});

describe('resolveBookmarksSource', () => {
  it('Fediverse はいつでも Fediverse にする', () => {
    expect(resolveBookmarksSource('fediverse', undefined)).toBe('fediverse');
    expect(resolveBookmarksSource('fediverse', true)).toBe('fediverse');
  });

  it('Bluesky が有効なときだけ Bluesky にする', () => {
    expect(resolveBookmarksSource('bluesky', true)).toBe('bluesky');
    expect(resolveBookmarksSource('bluesky', false)).toBe('fediverse');
  });

  it('Bluesky の状態を読み込み中のときは、どちらも出さず pending にする', () => {
    expect(resolveBookmarksSource('bluesky', undefined)).toBe('pending');
  });
});
