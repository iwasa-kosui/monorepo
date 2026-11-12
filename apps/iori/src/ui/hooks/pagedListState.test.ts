import { describe, expect, it } from 'vitest';

import { appendPageTo, firstPageOf } from './pagedListState.ts';

const keyOf = (item: { id: string }): string => item.id;

describe('firstPageOf', () => {
  it('項目とカーソルを持つ ready の状態にする', () => {
    expect(firstPageOf({ items: [{ id: 'a' }], cursor: 'next' })).toEqual({
      kind: 'ready',
      items: [{ id: 'a' }],
      cursor: 'next',
      loadMoreFailed: null,
    });
  });

  it('続きが無ければ cursor を undefined にする', () => {
    expect(firstPageOf({ items: [], cursor: null }).cursor).toBeUndefined();
  });
});

describe('appendPageTo', () => {
  const prev = firstPageOf({ items: [{ id: 'a' }], cursor: 'c1' });

  it('重複を除いて項目を足し、新しいカーソルに進め、続きの失敗を消す', () => {
    const next = appendPageTo(
      { ...prev, loadMoreFailed: '失敗' },
      { items: [{ id: 'a' }, { id: 'b' }], cursor: 'c2' },
      'c1',
      keyOf,
    );

    expect(next).toEqual({ kind: 'ready', items: [{ id: 'a' }, { id: 'b' }], cursor: 'c2', loadMoreFailed: null });
  });

  it('続きが無いとき、または同じカーソルが返ったとき cursor を undefined にする', () => {
    expect(appendPageTo(prev, { items: [{ id: 'b' }], cursor: null }, 'c1', keyOf).cursor).toBeUndefined();
    expect(appendPageTo(prev, { items: [{ id: 'b' }], cursor: 'c1' }, 'c1', keyOf).cursor).toBeUndefined();
  });
});
