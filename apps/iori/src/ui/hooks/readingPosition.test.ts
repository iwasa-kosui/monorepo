import { describe, expect, it } from 'vitest';

import { anchorFromRects, prependedKeys, scrollCorrection } from './readingPosition.ts';

describe('anchorFromRects', () => {
  it('画面上端にかかっている最初のアイテムを読み位置にする', () => {
    const rects = [
      { key: 'a', top: -400, bottom: -20 },
      { key: 'b', top: -10, bottom: 300 },
      { key: 'c', top: 320, bottom: 600 },
    ];

    expect(anchorFromRects(rects, 900)).toEqual({ key: 'b', offset: -10 });
  });

  it('先頭にいるときは読み位置を持たない（新着をそのまま見せる）', () => {
    expect(anchorFromRects([{ key: 'a', top: 100, bottom: 300 }], 0)).toBeUndefined();
  });
});

describe('scrollCorrection', () => {
  it('上に差し込まれた分だけスクロールする', () => {
    expect(scrollCorrection({ key: 'a', offset: 20 }, 520)).toBe(500);
  });

  it('1px 未満のずれは補正しない', () => {
    expect(scrollCorrection({ key: 'a', offset: 20 }, 20.4)).toBe(0);
  });
});

describe('prependedKeys', () => {
  it('以前の先頭より上に増えたキーを返す', () => {
    expect(prependedKeys(['a', 'b'], ['x', 'y', 'a', 'b'])).toEqual(['x', 'y']);
  });

  it('末尾への追加は新着に数えない', () => {
    expect(prependedKeys(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('初回表示や置き換えは新着に数えない', () => {
    expect(prependedKeys([], ['a'])).toEqual([]);
    expect(prependedKeys(['a'], ['x', 'y'])).toEqual([]);
  });
});
