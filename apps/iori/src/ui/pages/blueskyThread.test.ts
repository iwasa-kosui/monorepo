import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyPostThread } from '../api/mastodonClient.ts';
import { withBlueskyLiked } from '../hooks/optimisticBlueskyLike.ts';
import { threadItems, updateThreadItems } from './blueskyThread.ts';

const item = (uri: string, liked = false): IoriBlueskyTimelineItemBody =>
  ({ feedItemId: uri, uri, liked }) as IoriBlueskyTimelineItemBody;

const thread: BlueskyPostThread = {
  ancestors: [
    { kind: 'notFound', uri: 'at://did:plc:a/app.bsky.feed.post/gone' },
    { kind: 'post', item: item('at://did:plc:a/app.bsky.feed.post/root') },
  ],
  post: item('at://did:plc:a/app.bsky.feed.post/focus'),
  replies: [
    { depth: 1, node: { kind: 'post', item: item('at://did:plc:b/app.bsky.feed.post/r1') } },
    { depth: 1, node: { kind: 'blocked', uri: 'at://did:plc:c/app.bsky.feed.post/r2' } },
    { depth: 2, node: { kind: 'post', item: item('at://did:plc:b/app.bsky.feed.post/r3') } },
  ],
};

describe('threadItems', () => {
  it('lists the ancestors, the focused post and the replies in display order without the placeholders', () => {
    expect(threadItems(thread).map((entry) => entry.uri)).toEqual([
      'at://did:plc:a/app.bsky.feed.post/root',
      'at://did:plc:a/app.bsky.feed.post/focus',
      'at://did:plc:b/app.bsky.feed.post/r1',
      'at://did:plc:b/app.bsky.feed.post/r3',
    ]);
  });
});

describe('updateThreadItems', () => {
  it('applies an update to the matching post wherever it sits in the thread and keeps the rest', () => {
    const next = updateThreadItems(
      thread,
      (items) => withBlueskyLiked(items, 'at://did:plc:b/app.bsky.feed.post/r3', true),
    );

    expect(threadItems(next).map((entry) => entry.liked)).toEqual([false, false, false, true]);
    expect(next.ancestors[0]).toBe(thread.ancestors[0]);
    expect(next.replies[1]).toEqual(thread.replies[1]);
    expect(next.replies.map((reply) => reply.depth)).toEqual([1, 1, 2]);
    expect(next.post).toBe(thread.post);
  });

  it('updates the focused post', () => {
    const next = updateThreadItems(
      thread,
      (items) => withBlueskyLiked(items, 'at://did:plc:a/app.bsky.feed.post/focus', true),
    );

    expect(next.post.liked).toBe(true);
  });

  it('returns the thread unchanged when the update changes the number of items', () => {
    expect(updateThreadItems(thread, (items) => items.slice(1))).toBe(thread);
  });
});
