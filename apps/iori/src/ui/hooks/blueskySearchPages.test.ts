import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { nextSearchCursor, withSearchItems } from './blueskySearchPages.ts';
import { withBlueskyLiked } from './optimisticBlueskyLike.ts';
import type { BlueskySearchState } from './useBlueskySearch.ts';

describe('nextSearchCursor', () => {
  it('続きがあるときは返ってきた cursor を次に使う', () => {
    expect(nextSearchCursor(undefined, 'c2', 25)).toBe('c2');
    expect(nextSearchCursor('c2', 'c3', 25)).toBe('c3');
  });

  it('cursor が null なら続きは無い', () => {
    expect(nextSearchCursor('c2', null, 25)).toBeUndefined();
  });

  it('0 件の応答や、同じ cursor が返ってきたときは続きを読まない', () => {
    expect(nextSearchCursor('c2', 'c3', 0)).toBeUndefined();
    expect(nextSearchCursor('c2', 'c2', 25)).toBeUndefined();
  });
});

describe('withSearchItems', () => {
  const item = (uri: string, liked = false): IoriBlueskyTimelineItemBody =>
    ({ feedItemId: uri, uri, liked }) as IoriBlueskyTimelineItemBody;
  const ready = (items: readonly IoriBlueskyTimelineItemBody[]): BlueskySearchState<IoriBlueskyTimelineItemBody> => ({
    kind: 'ready',
    items,
    cursor: 'c2',
    isLoadingMore: true,
    loadMoreFailure: undefined,
  });

  it('結果の項目を uri で書き換え、cursor と読み込み中の状態はそのまま残す', () => {
    const state = ready([item('at://a/1'), item('at://a/2')]);

    const next = withSearchItems(state, (items) => withBlueskyLiked(items, 'at://a/2', true));

    expect(next).toEqual({ ...state, items: [item('at://a/1'), item('at://a/2', true)] });
  });

  it('項目の配列が変わらなければ同じ状態をそのまま返す', () => {
    const state = ready([item('at://a/1')]);

    expect(withSearchItems(state, (items) => items)).toBe(state);
  });

  it('結果が読み込まれていない状態は書き換えない', () => {
    const loading: BlueskySearchState<IoriBlueskyTimelineItemBody> = { kind: 'loading' };

    expect(withSearchItems(loading, (items) => [...items, item('at://a/1')])).toBe(loading);
  });
});
