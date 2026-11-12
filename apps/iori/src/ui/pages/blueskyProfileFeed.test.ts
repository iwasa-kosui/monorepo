import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { appendUniqueBy } from '../hooks/appendUnique.ts';
import { withBlueskyLiked } from '../hooks/optimisticBlueskyLike.ts';
import { withFeedItems } from './blueskyProfileFeed.ts';

const item = (uri: string, liked = false): IoriBlueskyTimelineItemBody =>
  ({ feedItemId: uri, uri, liked }) as IoriBlueskyTimelineItemBody;

const feed = {
  items: [item('at://a/1'), item('at://a/2')],
  cursor: 'c2' as string | undefined,
  unavailable: null,
  failed: false,
};

describe('withFeedItems', () => {
  it('feed の項目を uri で書き換え、cursor などはそのまま残す', () => {
    const next = withFeedItems(feed, (items) => withBlueskyLiked(items, 'at://a/1', true));

    expect(next).toEqual({ ...feed, items: [item('at://a/1', true), item('at://a/2')] });
  });

  it('項目の配列が変わらなければ同じ feed をそのまま返す', () => {
    expect(withFeedItems(feed, (items) => items)).toBe(feed);
  });

  it('feed がまだ読み込まれていなければ何もしない', () => {
    expect(withFeedItems(null, (items) => [...items, item('at://a/3')])).toBeNull();
  });

  it('楽観更新のあとに続きを足しても、更新した項目は残る', () => {
    const liked = withFeedItems(feed, (items) => withBlueskyLiked(items, 'at://a/2', true));

    const appended = withFeedItems(
      liked,
      (items) => appendUniqueBy(items, [item('at://a/2'), item('at://a/3')], (entry) => entry.feedItemId),
    );

    expect(appended?.items).toEqual([item('at://a/1'), item('at://a/2', true), item('at://a/3')]);
  });
});
